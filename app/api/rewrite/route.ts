import { NextRequest } from 'next/server';
import { Groq } from 'groq-sdk';
import { YTDlpWrap } from 'yt-dlp-wrap';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const YT_TOKEN = process.env.TRANSCRIPT_TOKEN;

export async function POST(req: NextRequest) {
  try {
    const { urls } = await req.json();
    if (!urls?.length) return Response.json({ error: 'No URLs provided' });

    let combined = '';
    let usedWhisper = false;

    // Try paid caption API first (fast if manual captions exist)
    if (YT_TOKEN) {
      const ids = urls.map((url: string) => {
        const match = url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([^?&"\'>]+)/);
        return match ? match[1] : null;
      }).filter(Boolean);

      if (ids.length > 0) {
        const res = await fetch('https://www.youtube-transcript.io/api/transcripts', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${YT_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ ids })
        });

        if (res.ok) {
          const data = await res.json();
          ids.forEach((id: string, i: number) => {
            const transcript = data[id]?.text || '';
            if (transcript.trim()) {
              const originalUrl = urls[i];
              combined += `\n\n--- ${originalUrl} ---\n${transcript}`;
            }
          });
        }
      }
    }

    // Fallback to Whisper audio transcription if no captions
    if (combined.trim().length < 100) {
      usedWhisper = true;
      const ytDlp = new YTDlpWrap();

      for (const url of urls) {
        try {
          const videoID = url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([^?&"\'>]+)/)?.[1];
          if (!videoID) continue;

          const audioBuffer = await ytDlp.execPromise([
            url,
            '-f', 'bestaudio',
            '--no-playlist',
            '-o', '-'
          ], { stdout: 'pipe' });

          const transcription = await groq.audio.transcriptions.create({
            file: new File([audioBuffer], 'audio'),
            model: 'whisper-large-v3-turbo',
            response_format: 'text'
          });

          combined += `\n\n--- ${url} ---\n${transcription.text.trim()}`;
        } catch (err) {
          combined += `\n\n--- ${url} ---\n[failed to transcribe audio]`;
        }
      }
    }

    if (combined.trim().length < 100) {
      return Response.json({ error: 'No transcript available for these videos.' });
    }

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
