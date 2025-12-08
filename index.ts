import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const HTML = `<!DOCTYPE html>
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
    <textarea id="urls" rows="10" class="w-full p-6 text-lg bg-gray-900 rounded-2xl focus:ring-4 focus:ring-purple-600"
      placeholder="Paste YouTube URLs — one per line"></textarea>
    <button onclick="go()" class="w-full py-6 text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl">
      Generate Script
    </button>
    <pre id="out" class="hidden mt-8 p-8 bg-gray-900 rounded-2xl text-lg leading-relaxed"></pre>
  </div>

  <script>
    async function go() {
      const urls = document.getElementById('urls').value.trim().split('\n').filter(Boolean);
      const out = document.getElementById('out');
      out.classList.add('hidden');
      out.textContent = 'Working… (20–40 sec)';

      if (urls.length === 0) return out.textContent = 'Paste at least one URL', out.classList.remove('hidden');

      try {
        const res = await fetch("/api", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls })
        });
        const data = await res.json();
        out.textContent = data.success ? data.finalScript : 'Error: ' + data.error;
      } catch (e) {
        out.textContent = 'Network error: ' + e.message;
      }
      out.classList.remove('hidden');
    }
  </script>
</body>
</html>`;

async function getTranscript(id: string) {
  try {
    const r = await fetch(`https://youtube-transcript-api.deno.dev/?video_id=${id}&lang=en`);
    if (!r.ok) throw 0;
    const d = await r.json();
    return d.map((i: any) => i.text).join(" ").replace(/\s+/g, " ");
  } catch { return "[no transcript]"; }
}

function getId(u: string) {
  const m = u.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : u.length === 11 ? u : null;
}

async function rewrite(t: string) {
  const key = Deno.env.get("LLM_API_KEY");
  if (!key) return "No LLM_API_KEY set in Deno Deploy";
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.1-70b-versatile",
      temperature: 0.7,
      messages: [{ role: "user", content: "Rewrite this YouTube transcript into a clean script:\n\n" + t }]
    })
  });
  const d = await res.json();
  return d.choices?.[0]?.message?.content || "No response";
}

serve(async (req) => {
  const p = new URL(req.url).pathname;
  if (p === "/") return new Response(HTML, { headers: { "Content-Type": "text/html" } });
  if (p !== "/api" || req.method !== "POST") return new Response("404", { status: 404 });

  let urls: string[] = [];
  try {
    const body = await req.json();
    urls = Array.isArray(body.urls) ? body.urls : [];
  } catch {
    const text = await req.text();
    urls = text.trim().split("\n").filter(Boolean);
  }

  if (urls.length === 0) return new Response(JSON.stringify({ success: false, error: "No URLs" }), { status: 400 });

  const ids = urls.map(getId).filter(Boolean) as string[];
  const parts = await Promise.all(ids.map(async (id, i) => `Video ${i+1}: https://youtu.be/${id}\n${await getTranscript(id)}\n`));
  const script = await rewrite(parts.join("\n"));

  return new Response(JSON.stringify({ success: true, finalScript: script }), {
    headers: { "Content-Type": "application/json" }
  });
});
