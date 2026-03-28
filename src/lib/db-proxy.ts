const DB_PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/emma-db-proxy`;

export async function dbProxy(
  action: string,
  params: Record<string, any>,
  getToken: () => Promise<string | null>
) {
  const token = await getToken();
  const resp = await fetch(DB_PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, ...params }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || `Error ${resp.status}`);
  }
  return resp.json();
}
