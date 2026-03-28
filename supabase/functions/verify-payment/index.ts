import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2025-08-27.basil" });
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { session_id } = await req.json();

    if (!session_id) {
      return new Response(JSON.stringify({ error: "Missing session_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status === "paid") {
      const fingerprint = session.metadata?.fingerprint;
      const userId = session.metadata?.user_id;

      // Update payment record
      await supabase.from("payments").update({
        status: "paid",
        stripe_customer_id: session.customer as string,
      }).eq("stripe_session_id", session_id);

      // Mark fingerprint as paid
      if (fingerprint) {
        await supabase.from("usage_tracking").upsert({
          fingerprint,
          is_paid: true,
          user_id: userId || null,
          stripe_customer_id: session.customer as string,
          updated_at: new Date().toISOString(),
        }, { onConflict: "fingerprint" });

        // Also mark any linked fingerprints as paid
        const { data: links } = await supabase
          .from("fingerprint_links")
          .select("linked_fingerprint")
          .eq("primary_fingerprint", fingerprint);
        if (links?.length) {
          for (const link of links) {
            await supabase.from("usage_tracking").update({ is_paid: true })
              .eq("fingerprint", link.linked_fingerprint);
          }
        }
      }

      // If user is logged in, mark all their fingerprints as paid
      if (userId) {
        await supabase.from("usage_tracking").update({ is_paid: true })
          .eq("user_id", userId);
      }

      return new Response(JSON.stringify({ paid: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ paid: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
