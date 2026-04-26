import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.2.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const { reference, fingerprint } = body;
    const clerkUser = await getClerkUser(req);

    if (!reference || typeof reference !== "string") {
      return new Response(JSON.stringify({ error: "Missing reference code" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find pending payment by reference
    const { data: payment } = await supabase
      .from("payments")
      .select("*")
      .eq("stripe_session_id", reference.trim().toUpperCase())
      .maybeSingle();

    if (!payment) {
      return new Response(JSON.stringify({ paid: false, error: "Reference not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark as submitted (pending admin verification). DO NOT grant paid access here —
    // a valid reference code can be obtained without making a real payment, so optimistic
    // access would be a free-money bypass. Only an admin-verified payment grants is_paid.
    await supabase.from("payments").update({
      status: payment.status === "admin_verified" ? "admin_verified" : "submitted",
      user_id: clerkUser?.id || payment.user_id || null,
      fingerprint: fingerprint || payment.fingerprint || null,
    }).eq("id", payment.id);

    // Only treat the payment as paid if an admin has already verified it.
    const isPaid = payment.status === "admin_verified";

    if (isPaid && fingerprint) {
      await supabase.from("usage_tracking").upsert({
        fingerprint,
        is_paid: true,
        user_id: clerkUser?.id || payment.user_id || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "fingerprint" });
    }

    if (isPaid && clerkUser?.id) {
      await supabase.from("usage_tracking").update({ is_paid: true }).eq("user_id", clerkUser.id);
    }

    return new Response(JSON.stringify({
      paid: isPaid,
      status: isPaid ? "verified" : "pending_admin_review",
      message: isPaid ? "Payment verified." : "Submitted for admin review. Access will be granted once your Cash App payment is confirmed.",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
