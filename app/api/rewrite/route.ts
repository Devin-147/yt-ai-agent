import { NextRequest, NextResponse } from 'next/server';
import { Groq } from 'groq-sdk';
import { getSubtitles } from 'youtube-caption-extractor';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { urls } = await req.json();
    if (!Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: 'Provide at least one valid YouTube URL' }, { status: 400 });
    }

    let combined = '';

    for (const url of urls) {
      try {
        // Extract video ID from various URL formats
        const videoIDMatch = url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([^?&"\'>]+)/);
        const videoID = videoIDMatch ? videoIDMatch[1] : null;

        if (!videoID) {
          throw new Error('Invalid YouTube URL');
        }

        // Fetch subtitles (supports auto-generated + manual, defaults to English)
        const subtitles = await getSubtitles({
          videoID,
          lang: 'en',  // Change to 'fr', 'es', etc. if needed for other languages
        });

        if (!subtitles || subtitles.length === 0) {
          throw new Error('No captions available (auto or manual)');
        }

        // Join all text segments into clean paragraph-style transcript
        const text = subtitles.map(s => s.text.trim()).join(' ');
        combined += `\n\n--- ${url} (ID: ${videoID}) ---\n${text}`;
      } catch (err: any) {
        console.error(`Transcript fetch failed for ${url}:`, err.message);
        combined += `\n\n--- ${url} ---\n[Transcript unavailable - ${err.message.slice(0, 120)}]`;
      }
    }

    if (!combined.trim() || combined.split('[Transcript unavailable').length > urls.length) {
      return NextResponse.json({ error: 'Failed to retrieve any usable transcripts.' }, { status: 400 });
    }

    // Rewrite with Groq
    const completion = await groq.chat.completions.create({
      messages: [{
        role: 'user',
        content: `Rewrite these combined YouTube transcript(s) into a clean, engaging, professional original script for a new video. Make it concise, natural, and well-structured:\n\n${combined}`
      }],
      model: 'llama-3.1-8b-instant',
      max_tokens: 4000,
      temperature: 0.7,
    });

    const script = completion.choices?.[0]?.message?.content?.trim() || '[Generation failed]';

    return NextResponse.json({ script });
  } catch (err: any) {
    console.error('API error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

export const runtime = 'edge';  // Works great here; switch to 'nodejs' only if issues
