import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Layers, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/emma-transfer-sensory`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export default function TransferPage() {
  const { getToken } = useAuth();
  const [sourceDomain, setSourceDomain] = useState("");
  const [targetDomain, setTargetDomain] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [transfer, setTransfer] = useState<any>(null);
  const [knowledge, setKnowledge] = useState<any[]>([]);
  const [domains, setDomains] = useState<string[]>([]);

  const call = async (body: any) => {
    const token = (await getToken?.()) ?? ANON;
    const r = await fetch(FN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: ANON },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "Request failed");
    return j;
  };

  const loadKB = async () => {
    try {
      const j = await call({ action: "get_knowledge_base" });
      setKnowledge(j.knowledge || []);
      setDomains(j.domains || []);
    } catch {}
  };

  useEffect(() => { loadKB(); }, []);

  const extract = async () => {
    if (!sourceDomain.trim() || !content.trim()) return toast.error("Source domain and content required");
    setBusy(true);
    try {
      const j = await call({ action: "extract_knowledge", source_domain: sourceDomain, content });
      toast.success(`Extracted ${j.extracted} pattern(s)`);
      loadKB();
    } catch (e: any) { toast.error(e?.message); }
    finally { setBusy(false); }
  };

  const doTransfer = async () => {
    if (!targetDomain.trim() || !content.trim()) return toast.error("Target domain and task required");
    setBusy(true);
    try {
      const j = await call({ action: "transfer", target_domain: targetDomain, content });
      setTransfer(j);
      toast.success("Transfer complete");
      loadKB();
    } catch (e: any) { toast.error(e?.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <Layers className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Cross-Domain Transfer</h1>
            <p className="text-xs text-muted-foreground">Extract abstractions in one domain, apply them in another</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6 space-y-6">
        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-semibold">1 · Extract knowledge</h2>
          <Input placeholder="Source domain (e.g. 'fluid dynamics')" value={sourceDomain} onChange={(e) => setSourceDomain(e.target.value)} />
          <Textarea placeholder="Domain content to abstract from…" value={content} onChange={(e) => setContent(e.target.value)} rows={4} />
          <div className="flex justify-end">
            <Button onClick={extract} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Extract
            </Button>
          </div>
        </Card>

        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-semibold">2 · Transfer to new domain</h2>
          <Input placeholder="Target domain (e.g. 'team org design')" value={targetDomain} onChange={(e) => setTargetDomain(e.target.value)} />
          <Textarea placeholder="Task or question in target domain…" value={content} onChange={(e) => setContent(e.target.value)} rows={3} />
          <div className="flex justify-end">
            <Button onClick={doTransfer} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Transfer
            </Button>
          </div>
        </Card>

        {transfer && (
          <Card className="p-4 space-y-3">
            <Badge>Synthesis</Badge>
            <p className="text-sm whitespace-pre-wrap">{transfer.synthesis}</p>
            <div className="space-y-2">
              {(transfer.transferred_insights || []).map((i: any, idx: number) => (
                <div key={idx} className="border rounded p-2">
                  <div className="text-xs text-muted-foreground">{i.original_domain} → {targetDomain} · conf {Math.round((i.confidence || 0) * 100)}%</div>
                  <div className="text-sm mt-1"><b>Adapted:</b> {i.adapted_knowledge}</div>
                  <div className="text-sm"><b>Application:</b> {i.application}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">
            Knowledge base · {knowledge.length} entries · {domains.length} domains
          </h2>
          <div className="flex flex-wrap gap-1 mb-3">
            {domains.map((d) => <Badge key={d} variant="outline">{d}</Badge>)}
          </div>
          <div className="space-y-1 max-h-72 overflow-auto">
            {knowledge.map((k) => (
              <Card key={k.id} className="p-2 text-xs">
                <span className="text-muted-foreground">[{k.source_domain}]</span> {k.content}
              </Card>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
