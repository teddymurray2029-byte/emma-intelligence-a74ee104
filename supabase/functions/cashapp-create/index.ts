import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.2.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CASHTAG = "mycashdirect2022";
const AMOUNT = 12;

const JWKS = createRemoteJWKSet(new URL("https://evident-mink-7.clerk.accounts.dev/.well-known/jwks.json"));

async function getClerkUser(req: Request): Promise<{ id: string; email?: string } | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token || token.length < 20) return null;
  if (token === Deno.env.get("SUPABASE_ANON_KEY")) return null;
  try {
    const { payload } = await jwtVerify(token, JWKS);
    return { id: payload.sub as string, email: (payload as any).email };
  } catch { return null; }
}

function generateRef(): string {
  // Short, human-readable, unique-ish reference: EMMA-XXXXX
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `EMMA-${s}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const { fingerprint, email: bodyEmail } = body;
    const clerkUser = await getClerkUser(req);
    const email = clerkUser?.email || bodyEmail;

    // Already paid?
    if (fingerprint) {
      const { data: usage } = await supabase
        .from("usage_tracking")
        .select("is_paid")
        .eq("fingerprint", fingerprint)
        .maybeSingle();
      if (usage?.is_paid) {
        return new Response(JSON.stringify({ isPaid: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
        });
      }
    }

    const reference = generateRef();
    const cashAppUrl = `https://cash.app/$${CASHTAG}/${AMOUNT}`;

    await supabase.from("payments").insert({
      user_id: clerkUser?.id || null,
      fingerprint: fingerprint || null,
      email: email || null,
      stripe_session_id: reference, // reuse column to store our reference
      status: "pending",
      amount: AMOUNT,
      currency: "usd",
    });

    return new Response(JSON.stringify({
      reference,
      cashAppUrl,
      cashtag: `$${CASHTAG}`,
      amount: AMOUNT,
      note: `Include this code in the payment note: ${reference}`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});
