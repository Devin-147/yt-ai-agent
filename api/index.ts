import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

async function getTranscript(videoId: string): Promise<string> {
  const url = `https://youtube-transcript-api.deno.dev/?video_id=${videoId}&lang=en`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Transcript failed");
  const data = await res.json();
  return data.map((i: any) => i.text).join(" ").replace(/\s+/g, " ").trim();
}

function extractVideoId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : url.length === 11 ? url : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { urls } = await req.json();
    const ids = urls.map(extractVideoId).filter(Boolean);
    const texts = await Promise.all(ids.map(async (id, i) => {
      try {
        const t = await getTranscript(id);
        return `Video ${i+1} — https://youtu.be/${id}\n${t}\n\n`;
      } catch { return `Video ${i+1} — failed\n\n`; }
    }));

    const full = texts.join("");

    const key = Deno.env.get("LLM_API_KEY");
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.1-70b-versatile",
        temperature: 0.7,
        messages: [
          { role: "system", content: "You are an expert YouTube script writer. Turn raw transcripts into one clean, engaging script. Remove fillers, add smooth transitions, keep all key facts." },
          { role: "user", content: full.length > 100000 ? full.slice(0,100000) + "\n\n…(truncated)" : full }
        ]
      })
    });

    const data = await res.json();
    const script = data.choices[0].message.content;

    return new Response(JSON.stringify({ success: true, finalScript: script }), { headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500 }, { headers: corsHeaders });
  }
});
