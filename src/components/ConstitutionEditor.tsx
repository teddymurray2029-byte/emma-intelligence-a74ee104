import { useEffect, useState } from "react";
import { useAuth as useClerk } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Scroll, RotateCcw, Save, Loader2 } from "lucide-react";

const URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/emma-constitution`;

type Constitution = { id: string; version: number; rules: string; active: boolean; created_at: string };

export default function ConstitutionEditor() {
  const { getToken } = useClerk();
  const [active, setActive] = useState<Constitution | null>(null);
  const [history, setHistory] = useState<Constitution[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const call = async (action: string, extra: Record<string, unknown> = {}) => {
    const token = await getToken();
    const r = await fetch(URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    if (!r.ok) throw new Error(`${action} failed: ${r.status}`);
    return r.json();
  };

  const refresh = async () => {
    try {
      const [a, l] = await Promise.all([call("get_active"), call("list")]);
      setActive(a.constitution);
      setHistory(l.constitutions || []);
      setDraft(a.constitution?.rules || "");
    } catch (e) {
      // silent
    }
  };

  useEffect(() => { refresh(); }, []);

  const save = async () => {
    if (!draft.trim()) return toast.error("Add at least one rule");
    setBusy(true);
    try {
      await call("save", { rules: draft });
      toast.success("Constitution updated");
      await refresh();
    } catch (e) {
      toast.error("Save failed");
    } finally { setBusy(false); }
  };

  const rollback = async (version: number) => {
    setBusy(true);
    try {
      await call("rollback", { version });
      toast.success(`Rolled back to v${version}`);
      await refresh();
    } catch { toast.error("Rollback failed"); } finally { setBusy(false); }
  };

  return (
    <div className="emma-surface-elevated emma-glow-border rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Scroll className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-medium text-foreground">Constitution</h3>
        {active && <span className="text-xs text-muted-foreground">v{active.version}</span>}
      </div>
      <p className="text-xs text-muted-foreground">
        Natural-language rules Emma must always follow. Enforced by a separate Critic agent on every response.
      </p>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={"e.g.\n- Never recommend financial trades without a disclaimer.\n- Always cite sources for medical claims.\n- Default to concise replies under 150 words."}
        rows={8}
        className="font-mono text-xs"
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={busy} className="gap-1.5">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save new version
        </Button>
      </div>
      {history.length > 1 && (
        <div className="space-y-1.5 pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground">History</p>
          {history.map((h) => (
            <div key={h.id} className="flex items-center justify-between text-xs">
              <span className={h.active ? "text-primary" : "text-muted-foreground"}>
                v{h.version} {h.active && "(active)"} — {new Date(h.created_at).toLocaleDateString()}
              </span>
              {!h.active && (
                <Button size="sm" variant="ghost" className="h-6 gap-1" onClick={() => rollback(h.version)}>
                  <RotateCcw className="h-3 w-3" /> Rollback
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
