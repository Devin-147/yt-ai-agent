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
    if (!res.ok) {
      console.error(`Transcript fetch failed for ${videoId}: ${res.status}`);
      throw new Error(`API error ${res.status}`);
    }
    const data = await res.json();
    return data.map((item: any) => item.text).join(" ").replace(/\s+/g, " ").trim();
  } catch (e) {
    console.error(`Full transcript error for ${videoId}:`, e);
    return `[Transcript failed for ${videoId}: ${e.message}]`;
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
    console.warn("No LLM_API_KEY found—falling back to free HuggingFace GPT-2");
    try {
      // Free fallback: HuggingFace inference API (no key needed, public endpoint)
      const hfRes = await fetch("https://api-inference.huggingface.co/models/gpt2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputs: `Rewrite this transcript into a clean YouTube script: ${transcriptText.slice(0, 500)}...`,
          parameters: { max_new_tokens: 500, temperature: 0.7 },
        }),
      });
      if (hfRes.ok) {
        const hfData = await hfRes.json();
        return Array.isArray(hfData) ? hfData[0].generated_text : "Fallback script: [Summary of key points from transcript].";
      } else {
        console.error("HuggingFace fallback failed:", hfRes.status);
        return `Fallback script (no AI): ${transcriptText.slice(0, 1000)}...`;
      }
    } catch (e) {
      console.error("Fallback error:", e);
      return `Error in fallback: ${e.message}. Raw transcript: ${transcriptText.slice(0, 500)}...`;
    }
  }

  // Primary: Groq/OpenAI
  let url = provider === "groq" ? "https://api.groq.com/openai/v1/chat/completions" : "https://api.openai.com/v1/chat/completions";
  let model = provider === "groq" ? "llama-3.1-70b-versatile" : "gpt-4o-mini";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        max_tokens: 2000,
        messages: [
          {
            role: "system",
            content: "You are an expert YouTube script writer. Turn raw transcripts into one engaging, natural-sounding video script. Remove fillers ('um', 'like'), fix grammar, organize logically with sections/transitions. Keep all key facts/insights. Sound like a confident presenter."
          },
          {
            role: "user",
            content: transcriptText.length > 100000
              ? "Long transcript—summarize core message + create 5-8 min script from key parts:\n\n" + transcriptText.slice(0, 100000)
              : `Rewrite into polished script:\n\n${transcriptText}`
          }
        ],
      }),
    });

    console.log(`LLM response status: ${res.status} for provider ${provider}`);

    if (!res.ok) {
      const errText = await res.text();
      console.error("LLM error:", res.status, errText);
      throw new Error(`LLM failed: ${res.status} - ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    if (!data.choices || !data.choices[0]?.message?.content) {
      throw new Error("Invalid LLM response structure");
    }

    return data.choices[0].message.content;
  } catch (e) {
    console.error("Full LLM error:", e);
    return `AI rewrite failed: ${e.message}. Raw transcript preview: ${transcriptText.slice(0, 500)}...`;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { urls } = await req.json();
    console.log("Received URLs:", urls);

    if (!Array.isArray(urls) || urls.length === 0 || urls.length > 10) {
      throw new Error("Send 1–10 YouTube URLs in an array");
    }

    const videoIds = urls.map(u => extractVideoId(u.trim())).filter(Boolean) as string[];
    console.log("Extracted IDs:", videoIds);

    if (videoIds.length === 0) {
      throw new Error("No valid YouTube URLs found");
    }

    const transcripts = await Promise.all(
      videoIds.map(async (id, i) => {
        const text = await getTranscript(id);
        return `=== Video ${i + 1} — https://youtu.be/${id} ===\n${text}\n\n`;
      })
    );

    const fullTranscript = transcripts.join("");
    console.log(`Combined transcript length: ${fullTranscript.length}`);

    const rewritten = await rewriteScript(fullTranscript);
    console.log("Rewrite complete, length:", rewritten.length);

    return new Response(
      JSON.stringify({
        success: true,
        inputVideos: videoIds.length,
        finalScript: rewritten,
        rawTranscriptsLength: fullTranscript.length,
        transcripts,  // Bonus: Return raw for debugging
      }),
      { headers: corsHeaders }
    );

  } catch (error) {
    console.error("Global error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});
