import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "fal-ai/kling-video/v2.5-turbo/pro/text-to-video";
const MERGE_MODEL = "fal-ai/ffmpeg-api/merge-videos";

async function falRun(model: string, input: unknown, key: string): Promise<any> {
  const submit = await fetch(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!submit.ok) throw new Error(`fal submit ${model} ${submit.status}: ${await submit.text()}`);
  const job = await submit.json();
  const start = Date.now();
  while (Date.now() - start < 8 * 60 * 1000) {
    await new Promise(r => setTimeout(r, 4000));
    const s = await fetch(job.status_url, { headers: { Authorization: `Key ${key}` } });
    const sj = await s.json();
    if (sj.status === "COMPLETED") {
      const r = await fetch(job.response_url, { headers: { Authorization: `Key ${key}` } });
      return await r.json();
    }
    if (sj.status === "FAILED" || sj.status === "ERROR") {
      throw new Error(`fal ${model} failed: ${JSON.stringify(sj)}`);
    }
  }
  throw new Error(`fal ${model} timed out`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { prompt, duration } = await req.json();
    if (!prompt || typeof prompt !== "string") {
      return new Response(JSON.stringify({ error: "Prompt is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const FAL_KEY = Deno.env.get("FAL_KEY");
    if (!FAL_KEY) {
      return new Response(JSON.stringify({ error: "FAL_KEY is not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Total duration up to 30s. Kling caps at 10s per clip — chain 1, 2, or 3 clips.
    const totalRequested = Math.max(5, Math.min(30, Number(duration) || 5));
    const clipLen = totalRequested <= 5 ? 5 : 10;
    const clipCount = Math.ceil(totalRequested / clipLen);
    const clipDur = String(clipLen);

    // Generate all clips in parallel. Add a "continuation" hint after the first.
    const clipJobs = Array.from({ length: clipCount }, (_, i) => {
      const clipPrompt = i === 0
        ? prompt
        : `${prompt} — continuation, part ${i + 1}, seamlessly continues the previous scene`;
      return falRun(MODEL, { prompt: clipPrompt, duration: clipDur, aspect_ratio: "16:9" }, FAL_KEY);
    });
    const results = await Promise.all(clipJobs);
    const clipUrls: string[] = results.map(r => r?.video?.url).filter(Boolean);
    if (clipUrls.length === 0) {
      return new Response(JSON.stringify({ error: "No clips were generated", results }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let finalUrl = clipUrls[0];
    if (clipUrls.length > 1) {
      const merged = await falRun(
        MERGE_MODEL,
        { video_urls: clipUrls, target_format: "mp4", resolution: "landscape_16_9" },
        FAL_KEY,
      );
      finalUrl = merged?.video?.url || finalUrl;
    }

    const finalDuration = clipUrls.length * clipLen;
    return new Response(JSON.stringify({
      videoUrl: finalUrl,
      duration: finalDuration,
      clipCount: clipUrls.length,
      text: `Generated ${finalDuration}s video (${clipUrls.length} × ${clipLen}s clips): "${prompt}"`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("emma-video-gen error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
