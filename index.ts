import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "text/html; charset=utf-8",
};

const HTML = `
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>YT AI Agent</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-black text-white min-h-screen flex items-center justify-center p-8">
  <div class="w-full max-w-2xl space-y-8">
    <h1 class="text-6xl font-black text-center bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
      YT AI Agent
    </h1>
    <textarea id="urls" rows="10" class="w-full p-6 text-lg bg-gray-900 rounded-2xl focus:outline-none focus:ring-4 focus:ring-purple-600"
      placeholder="Paste YouTube URLs — one per line (max 10)"></textarea>
    <button onclick="run()" class="w-full py-6 text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl hover:from-purple-700 hover:to-pink-700">
      Generate Script
    </button>
    <pre id="result" class="hidden mt-8 p-8 bg-gray-900 rounded-2xl text-lg leading-relaxed overflow-x-auto"></pre>
  </div>

  <script>
    async function run() {
      const urls = document.getElementById('urls').value.trim().split('\\n').filter(Boolean);
      const result = document.getElementById('result');
      result.classList.add('hidden');
      result.textContent = 'Working…';

      if (urls.length === 0) {
        result.textContent = 'Please paste at least one URL';
        result.classList.remove('hidden');
        return;
      }

      try {
        const res = await fetch("/api", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls })
        });
        const data = await res.json();

        if (data.success) {
          result.textContent = data.finalScript;
        } else {
          result.textContent = \`Error: \${data.error}\`;
        }
      } catch (e) {
        result.textContent = \`Network error: \${e.message}\`;
      }
      result.classList.remove('hidden');
    }
  </script>
</body>
</html>
`;

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

  if (!apiKey) {
    return `No API key set — add LLM_API_KEY in Deno Deploy env vars. Raw transcript preview:\n${transcriptText.slice(0, 1000)}...`;
  }

  const baseUrl = provider === "groq" ? "https://api.groq.com/openai/v1" : "https://api.openai.com/v1";
  const model = provider === "groq" ? "llama-3.1-70b-versatile" : "gpt-4o-mini";

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        max_tokens: 3000,
        messages: [
          { role: "system", content: "You are an expert YouTube script writer. Turn raw transcripts into one clean, engaging script. Remove fillers, add transitions, keep key facts." },
          { role: "user", content: `Rewrite this into a polished YouTube script:\n\n${transcriptText}` }
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
    return `AI error: ${e.message}. Transcript preview:\n${transcriptText.slice(0, 800)}...`;
  }
}

serve(async (req) => {
  const url = new URL(req.url);
  const pathname = url.pathname;

  if (pathname === "/") {
    return new Response(HTML, { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (pathname === "/api") {
    let urls: string[] = [];
    try {
      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const payload = await req.json().catch(() => ({}));
        urls = Array.isArray(payload.urls) ? payload.urls : [];
      } else {
        const text = await req.text();
        urls = text.trim().split("\n").filter(Boolean);
      }
    } catch (e) {
      console.warn("Body parse error:", e);
    }

    if (urls.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "No YouTube URLs received" }), { status: 400, headers: corsHeaders });
    }

    try {
      const videoIds = urls.map(extractVideoId).filter((id): id is string => id !== null);
      if (videoIds.length === 0) throw new Error("No valid video IDs");

      const segments = await Promise.all(videoIds.map(async (id, i) => {
        const text = await getTranscript(id);
        return `Video ${i + 1}: https://youtu.be/${id}\n${text}\n`;
      }));

      const fullTranscript = segments.join("\n");
      const finalScript = await rewriteScript(fullTranscript);

      return new Response(JSON.stringify({ success: true, inputVideos: videoIds.length, finalScript }), { headers: corsHeaders });
    } catch (error) {
      console.error("API error:", error);
      return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: corsHeaders });
    }
  }

  return new Response("Not found", { status: 404, headers: corsHeaders });
});
