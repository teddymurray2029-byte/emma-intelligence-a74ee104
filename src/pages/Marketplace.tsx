import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth as useClerk } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Download, Trash2, Star, Plus, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";

const URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/emma-marketplace`;
const PUB_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

type Item = {
  id: string;
  author_id: string;
  name: string;
  description: string;
  category: string;
  manifest: Record<string, unknown>;
  install_count: number;
  rating: number;
  published: boolean;
  created_at: string;
};

type Install = { installed_at: string; marketplace_id: string; agent_marketplace: Item };

const CATEGORIES = ["all", "agent", "tool", "workflow", "persona"] as const;

export default function Marketplace() {
  const navigate = useNavigate();
  const { getToken, isSignedIn } = useClerk();

  const [items, setItems] = useState<Item[] | null>(null);
  const [installs, setInstalls] = useState<Install[]>([]);
  const [mine, setMine] = useState<Item[]>([]);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const installedIds = useMemo(() => new Set(installs.map((i) => i.marketplace_id)), [installs]);

  const call = async (action: string, extra: Record<string, unknown> = {}, withAuth = false) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (withAuth && getToken) {
      const t = await getToken();
      if (t) headers.Authorization = `Bearer ${t}`;
    } else {
      headers.Authorization = `Bearer ${PUB_KEY}`;
    }
    const r = await fetch(URL, { method: "POST", headers, body: JSON.stringify({ action, ...extra }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `${action} failed`);
    return r.json();
  };

  const refresh = async () => {
    try {
      const d = await call("list", { category: category === "all" ? undefined : category, search });
      setItems(d.items || []);
    } catch (e) {
      toast.error("Failed to load marketplace");
    }
    if (isSignedIn) {
      try {
        const [i, m] = await Promise.all([call("my_installs", {}, true), call("my_published", {}, true)]);
        setInstalls(i.installs || []);
        setMine(m.items || []);
      } catch { /* silent */ }
    }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [category, isSignedIn]);

  const onSearch = (e: React.FormEvent) => { e.preventDefault(); refresh(); };

  const install = async (id: string) => {
    if (!isSignedIn) return toast.error("Sign in to install");
    setBusyId(id);
    try {
      await call("install", { id }, true);
      toast.success("Installed");
      await refresh();
    } catch (e) { toast.error("Install failed"); } finally { setBusyId(null); }
  };

  const uninstall = async (id: string) => {
    setBusyId(id);
    try {
      await call("uninstall", { id }, true);
      toast.success("Uninstalled");
      await refresh();
    } catch { toast.error("Uninstall failed"); } finally { setBusyId(null); }
  };

  const unpublish = async (id: string) => {
    setBusyId(id);
    try {
      await call("unpublish", { id }, true);
      toast.success("Unpublished");
      await refresh();
    } catch { toast.error("Unpublish failed"); } finally { setBusyId(null); }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-6 h-14 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-base font-semibold">Agent Marketplace</h1>
          <div className="ml-auto">
            <PublishDialog onCreated={refresh} call={call} />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <Tabs defaultValue="browse" className="space-y-6">
          <TabsList>
            <TabsTrigger value="browse">Browse</TabsTrigger>
            <TabsTrigger value="installed">Installed{installs.length ? ` (${installs.length})` : ""}</TabsTrigger>
            <TabsTrigger value="mine">My Published{mine.length ? ` (${mine.length})` : ""}</TabsTrigger>
          </TabsList>

          <TabsContent value="browse" className="space-y-5">
            <form onSubmit={onSearch} className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search agents…" className="pl-9" />
              </div>
              <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button type="submit" variant="secondary" size="sm">Search</Button>
            </form>

            {!items && (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44" />)}
              </div>
            )}
            {items && items.length === 0 && <p className="text-sm text-muted-foreground">Nothing found.</p>}
            {items && items.length > 0 && (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {items.map((it) => (
                  <ItemCard
                    key={it.id}
                    item={it}
                    installed={installedIds.has(it.id)}
                    busy={busyId === it.id}
                    onInstall={() => install(it.id)}
                    onUninstall={() => uninstall(it.id)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="installed" className="space-y-4">
            {!isSignedIn ? (
              <p className="text-sm text-muted-foreground">Sign in to see your installs.</p>
            ) : installs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No installs yet. Browse and install something.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {installs.map((i) => (
                  <ItemCard
                    key={i.marketplace_id}
                    item={i.agent_marketplace}
                    installed
                    busy={busyId === i.marketplace_id}
                    onUninstall={() => uninstall(i.marketplace_id)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="mine" className="space-y-4">
            {!isSignedIn ? (
              <p className="text-sm text-muted-foreground">Sign in to see your published items.</p>
            ) : mine.length === 0 ? (
              <p className="text-sm text-muted-foreground">You haven't published anything yet.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {mine.map((it) => (
                  <Card key={it.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base">{it.name}</CardTitle>
                        <Badge variant={it.published ? "default" : "outline"}>{it.published ? "live" : "draft"}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-xs text-muted-foreground line-clamp-3">{it.description}</p>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{it.install_count} installs</span>
                        <span>{it.category}</span>
                      </div>
                      {it.published && (
                        <Button size="sm" variant="outline" className="w-full" onClick={() => unpublish(it.id)} disabled={busyId === it.id}>
                          {busyId === it.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Unpublish"}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function ItemCard({
  item, installed, busy, onInstall, onUninstall,
}: {
  item: Item;
  installed: boolean;
  busy?: boolean;
  onInstall?: () => void;
  onUninstall?: () => void;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{item.name}</CardTitle>
          <Badge variant="outline" className="capitalize">{item.category}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col space-y-3">
        <p className="text-xs text-muted-foreground line-clamp-3">{item.description}</p>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-current" /> {Number(item.rating).toFixed(1)}</span>
          <span>{item.install_count} installs</span>
        </div>
        <div className="mt-auto pt-2">
          {installed ? (
            <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={onUninstall} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Uninstall
            </Button>
          ) : (
            <Button size="sm" className="w-full gap-1.5" onClick={onInstall} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Install
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PublishDialog({ onCreated, call }: { onCreated: () => void; call: (a: string, e?: Record<string, unknown>, w?: boolean) => Promise<any> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("agent");
  const [manifest, setManifest] = useState('{\n  "system": "You are a helpful agent."\n}');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim() || !description.trim()) return toast.error("Name and description required");
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(manifest); } catch { return toast.error("Manifest must be valid JSON"); }
    setBusy(true);
    try {
      await call("publish", { name, description, category, manifest: parsed, published: true }, true);
      toast.success("Published");
      setOpen(false);
      setName(""); setDescription("");
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Publish failed");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Publish</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Publish to Marketplace</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          <Textarea placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={3} />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["agent", "tool", "workflow", "persona"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Textarea value={manifest} onChange={(e) => setManifest(e.target.value)} rows={6} className="font-mono text-xs" placeholder="Manifest JSON" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Publish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
