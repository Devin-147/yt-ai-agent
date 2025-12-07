import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

async function getTranscript(videoId: string): Promise<string> {
  try {
    const url = `https://youtube-transcript-api.deno.dev/?video_id=${videoId}&lang=en`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TranscriptBot/1.0)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.map((item: any) => item.text).join(" ").replace(/\s+/g, " ").trim();
  } catch (e) {
    console.error(`Transcript error ${videoId}:`, e);
    return `[No transcript available for ${videoId}]`;
  }
}

function extractVideoId(url: string): string | null {
  const regex = /(?:youtube\.com\/.*v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/;
  const match = url.match(regex);
  return match ? match[1] : (url.length === 11 ? url : null);
}

async function rewriteScript(transcriptText: string): Promise<string> {
  const apiKey = Deno.env.get("LLM_API_KEY");
  const provider = Deno.env.get("LLM_PROVIDER") || "groq";

  // ——— NO API KEY → FREE FALLBACK ———
  if (!apiKey || apiKey.trim() === "") {
    console.warn("No LLM key → using free HuggingFace fallback");
    try {
      const res = await fetch("https://api-inference.huggingface.co/models/gpt2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputs: `Rewrite this YouTube transcript into a clean script:\n${transcriptText.slice(0, 800)}`,
          parameters: { max_new_tokens: 600 },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data) ? data[0].generated_text : "Free fallback script generated.";
      }
    } catch (e) {
      console.error("HuggingFace fallback failed:", e);
    }
    return `No AI key → raw transcript (first 1500 chars):\n\n${transcriptText.slice(0, 1500)}...`;
  }

  // ——— GROQ / OPENAI ———
  const baseUrl = provider === "groq"
    ? "https://api.groq.com/openai/v1"
    : "https://api.openai.com/v1";

  const model = provider === "groq" ? "llama-3.1-70b-versatile" : "gpt-4o-mini";

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        max_tokens: 3000,
        messages: [
          {
            role: "system",
            content: "You are an expert YouTube script writer. Turn raw transcripts into one clean, engaging, natural-sounding script. Remove all filler words, fix grammar, add smooth transitions and sections. Keep every important fact and insight."
          },
          {
            role: "user",
            content: transcriptText.length > 100000
              ? "Long transcript — give me the core message + a tight 6-minute script:\n\n" + transcriptText.slice(0, 100000)
              : "Rewrite this into a polished YouTube script:\n\n" + transcriptText
          }
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`${res.status}: ${err.slice(0, 200)}`);
    }

    const data = await res.json();
    return data.choices[0]?.message?.content || "No content returned";
  } catch (e) {
    console.error("LLM failed:", e);
    return `AI failed (${e.message}). Raw transcript preview:\n${transcriptText.slice(0, 800)}...`;
  }
}

// ——————————————————————— MAIN SERVER ———————————————————————
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ——— ROBUST WAY TO GET URLs (never crashes) ———
  let urls: string[] = [];

  try {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const payload = await req.json().catch(() => ({}));
      urls = Array.isArray(payload.urls) ? payload.urls.map(String) : [];
    }
  } catch {
    // ignore
  }

  // Fallback 1: plain text body (your textarea sends this)
  if (urls.length === 0) {
    try {
      const text = await req.text();
      if (text.trim()) {
        urls = text.trim().split("\n").map(s => s.trim()).filter(Boolean);
      }
    } catch {
      // ignore
    }
  }

  // Fallback 2: query string ?urls=http://...
  if (urls.length === 0) {
    const q = new URL(req.url).searchParams.get("urls");
    if (q) urls = q.split(",").map(decodeURIComponent);
  }

  if (urls.length === 0) {
    return new Response(
      JSON.stringify({ success: false, error: "No YouTube URLs received" }),
      { status: 400, headers: corsHeaders }
    );
  }

  if (urls.length > 10) urls = urls.slice(0, 10);

  console.log("Processing URLs:", urls);

  try {
    const videoIds = urls
      .map(u => extractVideoId(u))
      .filter((id): id is string => id !== null);

    if (videoIds.length === 0) {
      throw new Error("No valid YouTube video IDs found");
    }

    const segments = await Promise.all(
      videoIds.map(async (id, i) => {
        const text = await getTranscript(id);
        return `=== Video ${i + 1} — https://youtu.be/${id} ===\n${text}\n\n`;
      })
    );

    const fullTranscript = segments.join("");
    const finalScript = await rewriteScript(fullTranscript);

    return new Response(
      JSON.stringify({
        success: true,
        inputVideos: videoIds.length,
        finalScript,
        rawLength: fullTranscript.length,
      }),
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("Fatal error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Unknown server error",
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});
