import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
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
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2025-08-27.basil" });
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json();
    const { fingerprint, email: bodyEmail } = body;
    const clerkUser = await getClerkUser(req);

    const email = clerkUser?.email || bodyEmail;

    // Check if already paid via fingerprint
    if (fingerprint) {
      const { data: usage } = await supabase
        .from("usage_tracking")
        .select("is_paid")
        .eq("fingerprint", fingerprint)
        .single();
      if (usage?.is_paid) {
        return new Response(JSON.stringify({ error: "Already paid", isPaid: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
        });
      }
    }

    // Find or create Stripe customer
    let customerId: string | undefined;
    if (email) {
      const customers = await stripe.customers.list({ email, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      }
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : email,
      payment_method_types: ["card", "crypto"],
      line_items: [{ price: "price_1TG0biRzNLUIpDoyNnMHvaiE", quantity: 1 }],
      mode: "payment",
      success_url: `${req.headers.get("origin")}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get("origin")}/`,
      metadata: {
        fingerprint: fingerprint || "",
        user_id: clerkUser?.id || "",
      },
    });

    // Record pending payment
    await supabase.from("payments").insert({
      user_id: clerkUser?.id || null,
      fingerprint: fingerprint || null,
      email: email || null,
      stripe_session_id: session.id,
      status: "pending",
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});
