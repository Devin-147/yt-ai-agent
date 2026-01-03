import { NextRequest } from 'next/server';
import { Groq } from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const YT_TOKEN = process.env.TRANSCRIPT_TOKEN;  // Updated to match your new env var key

export async function POST(req: NextRequest) {
  try {
    const { urls } = await req.json();
    if (!urls?.length) {
      return Response.json({ error: 'No URLs provided' });
    }

    if (!YT_TOKEN) {
      return Response.json({ error: 'Missing transcript API token' });
    }

    // Extract video IDs from URLs
    const ids = urls.map((url: string) => {
      const match = url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([^?&"\'>]+)/);
      return match ? match[1] : null;
    }).filter(Boolean);

    if (ids.length === 0) {
      return Response.json({ error: 'No valid YouTube video IDs found' });
    }

    // Call youtube-transcript.io bulk endpoint
    const res = await fetch('https://www.youtube-transcript.io/api/transcripts', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${YT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ids })
    });

    if (!res.ok) {
      const text = await res.text();
      return Response.json({ error: `Transcript API failed: ${res.status} – ${text}` });
    }

    const data = await res.json();

    // Combine transcripts with source URLs
    let combined = '';
    ids.forEach((id: string, i: number) => {
      const transcript = data[id]?.text || data[id]?.transcript || '[no transcript available]';
      const originalUrl = urls.find((u: string) => u.includes(id)) || `https://youtube.com/watch?v=${id}`;
      combined += `\n\n--- ${originalUrl} ---\n${transcript}`;
    });

    // Rewrite with Groq
    const completion = await groq.chat.completions.create({
      messages: [
        { 
          role: 'user', 
          content: `Rewrite this combined YouTube transcript into a clean, engaging, original script for a new video. Make it concise and professional:\n\n${combined}` 
        }
      ],
      model: 'llama3-8b-8192',
      max_tokens: 4000,
      temperature: 0.7
    });

    const script = completion.choices[0]?.message?.content?.trim() || 'No output from AI';

    return Response.json({ script });
  } catch (err: any) {
    return Response.json({ error: err.message || 'Unknown server error' });
  }
}

export const runtime = 'edge';
