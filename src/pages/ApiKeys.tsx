import { useState, useEffect } from "react";
import { ArrowLeft, Plus, Copy, Trash2, Check, Key, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type ApiKeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
};

export default function ApiKeys() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [newKeyName, setNewKeyName] = useState("Default");
  const [creating, setCreating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/emma-api`;

  useEffect(() => {
    if (!user) return;
    loadKeys();
  }, [user]);

  async function loadKeys() {
    const { data } = await supabase
      .from("api_keys")
      .select("id, name, key_prefix, is_active, last_used_at, created_at")
      .order("created_at", { ascending: false });
    if (data) setKeys(data as ApiKeyRow[]);
  }

  async function createKey() {
    if (!user) return;
    setCreating(true);
    try {
      // Generate a random API key
      const raw = crypto.randomUUID() + crypto.randomUUID();
      const key = `emma-${raw.replace(/-/g, "")}`;
      const prefix = key.slice(0, 12) + "...";

      // Hash it
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(key));
      const keyHash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const { error } = await supabase.from("api_keys").insert({
        user_id: user.id,
        name: newKeyName || "Default",
        key_hash: keyHash,
        key_prefix: prefix,
      });

      if (error) throw error;

      setRevealedKey(key);
      setNewKeyName("Default");
      await loadKeys();
      toast.success("API key created! Copy it now — you won't see it again.");
    } catch (e: any) {
      toast.error(e.message || "Failed to create key");
    } finally {
      setCreating(false);
    }
  }

  async function revokeKey(id: string) {
    const { error } = await supabase
      .from("api_keys")
      .update({ is_active: false })
      .eq("id", id);
    if (error) {
      toast.error("Failed to revoke key");
    } else {
      toast.success("Key revoked");
      await loadKeys();
    }
  }

  async function deleteKey(id: string) {
    const { error } = await supabase.from("api_keys").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete key");
    } else {
      toast.success("Key deleted");
      await loadKeys();
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied!");
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Sign in to manage API keys</p>
          <Button onClick={() => <Button onClick={() => navigate("/sign-in")}>Sign In</Button>}>Sign In</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="h-12 flex items-center border-b border-border bg-card px-4 gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/settings")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Key className="h-4 w-4 text-primary" />
        <h1 className="text-sm font-semibold text-foreground">API Keys</h1>
      </header>

      <div className="p-6 max-w-3xl mx-auto space-y-6">
        {/* Quick start docs */}
        <div className="emma-surface-elevated emma-glow-border rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-medium text-foreground">🚀 Quick Start</h3>
          <p className="text-xs text-muted-foreground">
            Emma API is OpenAI-compatible. Swap your base URL and API key to use Emma as a drop-in replacement.
          </p>
          <div className="bg-muted/50 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-muted-foreground uppercase">Base URL</span>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyToClipboard(baseUrl)}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
            <code className="text-xs text-foreground font-mono break-all block">{baseUrl}</code>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 space-y-1">
            <span className="text-[10px] font-mono text-muted-foreground uppercase">Example (curl)</span>
            <pre className="text-[11px] text-foreground font-mono whitespace-pre-wrap break-all">{`curl ${baseUrl} \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "emma-1",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'`}</pre>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 space-y-1">
            <span className="text-[10px] font-mono text-muted-foreground uppercase">JavaScript / TypeScript</span>
            <pre className="text-[11px] text-foreground font-mono whitespace-pre-wrap break-all">{`import OpenAI from "openai";

const emma = new OpenAI({
  baseURL: "${baseUrl}",
  apiKey: "YOUR_API_KEY",
});

const chat = await emma.chat.completions.create({
  model: "emma-1",
  messages: [{ role: "user", content: "Hello!" }],
});`}</pre>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Supports: <code className="text-foreground">messages</code>, <code className="text-foreground">stream</code>, <code className="text-foreground">temperature</code>, <code className="text-foreground">max_tokens</code>. Model name is ignored (always uses Emma's cognitive engine).
          </p>
        </div>

        {/* Create key */}
        <div className="emma-surface-elevated emma-glow-border rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-medium text-foreground">Create New Key</h3>
          <div className="flex gap-2">
            <Input
              placeholder="Key name (e.g. MockMate)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="h-8 text-xs"
            />
            <Button size="sm" onClick={createKey} disabled={creating} className="gap-1.5">
              <Plus className="h-3 w-3" />
              Create
            </Button>
          </div>
        </div>

        {/* Revealed key */}
        {revealedKey && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-5 space-y-2">
            <p className="text-xs text-green-400 font-medium">⚠️ Copy this key now — you won't see it again!</p>
            <div className="flex items-center gap-2">
              <code className="text-xs font-mono text-foreground break-all flex-1 bg-muted/50 p-2 rounded">
                {revealedKey}
              </code>
              <Button size="sm" variant="outline" onClick={() => copyToClipboard(revealedKey)} className="gap-1.5 shrink-0">
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => setRevealedKey(null)}>
              Dismiss
            </Button>
          </div>
        )}

        {/* Key list */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">Your API Keys</h3>
          {keys.length === 0 ? (
            <p className="text-xs text-muted-foreground">No API keys yet. Create one above.</p>
          ) : (
            <div className="space-y-2">
              {keys.map((k) => (
                <div
                  key={k.id}
                  className={`emma-surface-elevated rounded-xl p-4 flex items-center gap-4 ${!k.is_active ? "opacity-50" : "emma-glow-border"}`}
                >
                  <Key className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{k.name}</p>
                    <p className="text-[10px] font-mono text-muted-foreground">
                      {k.key_prefix} · Created {new Date(k.created_at).toLocaleDateString()}
                      {k.last_used_at && ` · Last used ${new Date(k.last_used_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {k.is_active ? (
                      <span className="text-[10px] font-mono text-green-400 mr-2">Active</span>
                    ) : (
                      <span className="text-[10px] font-mono text-destructive mr-2">Revoked</span>
                    )}
                    {k.is_active && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => revokeKey(k.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {!k.is_active && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteKey(k.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
