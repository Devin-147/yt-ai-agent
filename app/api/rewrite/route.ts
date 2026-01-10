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
        // Extract video ID from URL (handles watch, youtu.be, shorts, embed, etc.)
        const videoIDMatch = url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([^?&"\'>]+)/);
        const videoID = videoIDMatch ? videoIDMatch[1] : null;

        if (!videoID) {
          throw new Error('Could not extract valid video ID from URL');
        }

        // Fetch subtitles - package auto-falls back to auto-generated if no manual
        const subtitles = await getSubtitles({
          videoID,
          lang: 'en',  // Default English; change to 'es', 'fr' etc. if needed for non-English
        });

        if (!subtitles || subtitles.length === 0) {
          throw new Error('No captions found (manual or auto-generated)');
        }

        // Join text segments (removes timestamps for clean script)
        const text = subtitles.map(s => s.text.trim()).join(' ');
        combined += `\n\n--- Video: ${url} (ID: ${videoID}) ---\n${text}`;
      } catch (err: any) {
        console.error(`Failed for ${url}: ${err.message}`);
        combined += `\n\n--- ${url} ---\n[Transcript unavailable - ${err.message.slice(0, 100)}...]`;
      }
    }

    if (!combined.trim() || combined.includes('[Transcript unavailable]'.repeat(urls.length))) {
      return NextResponse.json({ error: 'No usable transcripts could be retrieved from any video.' }, { status: 400 });
    }

    // Send to Groq for rewrite
    const completion = await groq.chat.completions.create({
      messages: [{
        role: 'user',
        content: `Rewrite this combined YouTube transcript(s) into a clean, engaging, professional original script for a new video. Make it concise, natural-sounding, and well-structured:\n\n${combined}`
      }],
      model: 'llama-3.1-8b-instant',
      max_tokens: 4000,
      temperature: 0.7,
    });

    const script = completion.choices?.[0]?.message?.content?.trim() || '[AI generation failed - check Groq key]';

    return NextResponse.json({ script });
  } catch (err: any) {
    console.error('API route error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

export const runtime = 'edge';  // This package works perfectly on edge
