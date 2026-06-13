// Emma Gmail connector — list / get / send via Lovable connector gateway
const GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function b64url(s: string) {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildRaw(to: string, subject: string, body: string, cc?: string, bcc?: string) {
  const lines = [`To: ${to}`];
  if (cc) lines.push(`Cc: ${cc}`);
  if (bcc) lines.push(`Bcc: ${bcc}`);
  lines.push(`Subject: ${subject}`, 'Content-Type: text/plain; charset="UTF-8"', "", body);
  return b64url(lines.join("\r\n"));
}

async function gw(path: string, init: RequestInit = {}) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const GOOGLE_MAIL_API_KEY = Deno.env.get("GOOGLE_MAIL_API_KEY");
  if (!LOVABLE_API_KEY || !GOOGLE_MAIL_API_KEY) {
    throw new Error("Missing LOVABLE_API_KEY or GOOGLE_MAIL_API_KEY");
  }
  const res = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GOOGLE_MAIL_API_KEY,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Gmail gateway ${res.status}: ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || "list";
    let result: unknown;

    if (action === "list") {
      const q = body.q ? `&q=${encodeURIComponent(body.q)}` : "";
      const max = body.maxResults || 10;
      result = await gw(`/users/me/messages?maxResults=${max}${q}`);
    } else if (action === "get") {
      result = await gw(`/users/me/messages/${body.id}?format=${body.format || "full"}`);
    } else if (action === "send") {
      if (!body.to || !body.subject) throw new Error("to and subject required");
      const raw = buildRaw(body.to, body.subject, body.body || "", body.cc, body.bcc);
      result = await gw(`/users/me/messages/send`, {
        method: "POST",
        body: JSON.stringify({ raw }),
      });
    } else if (action === "modify") {
      result = await gw(`/users/me/messages/${body.id}/modify`, {
        method: "POST",
        body: JSON.stringify({
          addLabelIds: body.addLabelIds || [],
          removeLabelIds: body.removeLabelIds || [],
        }),
      });
    } else if (action === "trash") {
      result = await gw(`/users/me/messages/${body.id}/trash`, { method: "POST" });
    } else if (action === "labels") {
      result = await gw(`/users/me/labels`);
    } else {
      throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify({ ok: true, result }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e instanceof Error ? e.message : e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
