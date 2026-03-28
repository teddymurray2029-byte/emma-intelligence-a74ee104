import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.2.0";

const CLERK_JWKS_URL = "https://evident-mink-7.clerk.accounts.dev/.well-known/jwks.json";
const JWKS = createRemoteJWKSet(new URL(CLERK_JWKS_URL));

export async function getClerkUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token || token.length < 20) return null;
  
  // Skip verification for anon key (public endpoints)
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (token === anonKey) return null;
  
  try {
    const { payload } = await jwtVerify(token, JWKS);
    return (payload.sub as string) || null;
  } catch {
    return null;
  }
}

export async function requireClerkUser(req: Request): Promise<{ userId: string } | Response> {
  const userId = await getClerkUserId(req);
  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" },
    });
  }
  return { userId };
}
