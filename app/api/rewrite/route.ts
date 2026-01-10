import { NextRequest } from 'next/server';
import { Groq } from 'groq-sdk';
import { YTDlpWrap } from 'yt-dlp-wrap';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { urls } = await req.json();
    if (!urls || !urls.length) return Response.json({ error: 'No URLs provided' });

    let combined = '';

    const ytDlp = new YTDlpWrap();

    for (const url of urls) {
      try {
        // Download audio only (fast, small)
        const audioBuffer = await ytDlp.execPromise([
          url,
          '-f', 'bestaudio',
          '--no-playlist',
          '-o', '-'
        ], { stdout: 'pipe' });

        // Transcribe with Groq Whisper
        const transcription = await groq.audio.transcriptions.create({
          file: new File([audioBuffer], 'audio.webm', { type: 'audio/webm' }),
          model: 'whisper-large-v3-turbo',
          response_format: 'text',
          language: 'en'
        });

        combined += `\n\n--- ${url} ---\n${transcription.text.trim()}`;
      } catch (err) {
        combined += `\n\n--- ${url} ---\n[failed to transcribe audio]`;
      }
    }

    if (combined.trim().length < 100) {
      return Response.json({ error: 'No audio transcribed from these videos.' });
    }

    // Rewrite with Groq
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: `Rewrite this combined YouTube transcript into a clean, engaging, original script for a new video. Make it concise and professional:\n\n${combined}`
        }
      ],
      model: 'llama-3.1-8b-instant',
      max_tokens: 4000,
      temperature: 0.7
    });

    const script = completion.choices[0]?.message?.content?.trim() || 'No output from AI';

    return Response.json({ script });
  } catch (err: any) {
    return Response.json({ error: err.message || 'Server error' });
  }
}

export const runtime = 'edge';
