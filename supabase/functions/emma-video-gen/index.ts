import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// fal.ai model. Kling v2.5 turbo pro supports 5 or 10 second clips.
const MODEL = "fal-ai/kling-video/v2.5-turbo/pro/text-to-video";

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

    // Kling supports 5 or 10 seconds. Cap requested duration.
    const dur = duration === 10 || duration === "10" ? "10" : "5";

    // Submit to fal queue
    const submit = await fetch(`https://queue.fal.run/${MODEL}`, {
      method: "POST",
      headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, duration: dur, aspect_ratio: "16:9" }),
    });

    if (!submit.ok) {
      const t = await submit.text();
      console.error("fal submit error", submit.status, t);
      return new Response(JSON.stringify({ error: `Video submit failed: ${submit.status} ${t}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const job = await submit.json();
    const statusUrl: string = job.status_url;
    const responseUrl: string = job.response_url;

    // Poll up to ~5 minutes
    const start = Date.now();
    while (Date.now() - start < 5 * 60 * 1000) {
      await new Promise(r => setTimeout(r, 4000));
      const s = await fetch(statusUrl, { headers: { Authorization: `Key ${FAL_KEY}` } });
      const sj = await s.json();
      if (sj.status === "COMPLETED") break;
      if (sj.status === "FAILED" || sj.status === "ERROR") {
        return new Response(JSON.stringify({ error: "Video generation failed", detail: sj }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const r = await fetch(responseUrl, { headers: { Authorization: `Key ${FAL_KEY}` } });
    const result = await r.json();
    const videoUrl = result?.video?.url || result?.video_url;
    if (!videoUrl) {
      return new Response(JSON.stringify({ error: "No video URL returned", result }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ videoUrl, duration: Number(dur), text: `Generated ${dur}s video: "${prompt}"` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("emma-video-gen error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
