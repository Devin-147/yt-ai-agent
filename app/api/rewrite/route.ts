import { NextRequest } from 'next/server';
import { YoutubeTranscript } from 'youtube-transcript';
import { Groq } from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { urls } = await req.json();
    if (!urls?.length) return Response.json({ error: 'No URLs provided' });

    let combined = '';
    for (const url of urls) {
      try {
        const transcript = await YoutubeTranscript.fetchTranscript(url);
        const text = transcript.map((t: any) => t.text).join(' ');
        combined += `\n\n--- ${url} ---\n${text}`;
      } catch (err) {
        combined += `\n\n--- ${url} ---\n[no transcript available]`;
      }
    }

    if (combined.trim().length < 50) {
      return Response.json({ error: 'No transcripts found for the provided URLs. Try videos with captions enabled.' });
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
