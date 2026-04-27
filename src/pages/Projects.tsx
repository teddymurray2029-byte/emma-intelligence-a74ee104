import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Folder, Users, Sparkles, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { pmApi, type Workspace } from "@/lib/pm-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function Projects() {
  const { getToken, user } = useAuth();
  const nav = useNavigate();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [repo, setRepo] = useState("");

  useEffect(() => {
    if (!user) return;
    pmApi.listWorkspaces(getToken).then((r) => setWorkspaces(r.data || [])).finally(() => setLoading(false));
  }, [user, getToken]);

  const create = async () => {
    if (!name.trim()) return;
    try {
      const r = await pmApi.createWorkspace({
        name: name.trim(), description: desc, github_repo: repo || null,
        display_name: user?.user_metadata?.display_name, email: user?.email,
      }, getToken);
      toast.success("Project created");
      setOpen(false); setName(""); setDesc(""); setRepo("");
      nav(`/projects/${r.data.id}/board`);
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
            <p className="text-muted-foreground mt-1">Agile workspaces with one-click AI implementation</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => nav("/app")}>Back to Emma</Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />New Project</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create project</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <Input placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                  <Textarea placeholder="Description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
                  <Input placeholder="GitHub repo (owner/repo, optional)" value={repo} onChange={(e) => setRepo(e.target.value)} />
                  <Button onClick={create} className="w-full" disabled={!name.trim()}>Create</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {loading ? (
          <div className="text-muted-foreground">Loading…</div>
        ) : workspaces.length === 0 ? (
          <Card className="p-12 text-center">
            <Sparkles className="h-10 w-10 mx-auto mb-4 text-primary" />
            <h3 className="text-lg font-semibold mb-2">No projects yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first project to start planning sprints, writing user stories, and shipping with AI.
            </p>
            <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />Create your first project</Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workspaces.map((w) => (
              <Card key={w.id} className="p-5 cursor-pointer hover:border-primary/40 transition-colors group" onClick={() => nav(`/projects/${w.id}/board`)}>
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Folder className="h-5 w-5 text-primary" />
                  </div>
                  {w.my_role && <Badge variant="secondary" className="capitalize">{w.my_role}</Badge>}
                </div>
                <h3 className="font-semibold mb-1">{w.name}</h3>
                <p className="text-xs text-muted-foreground line-clamp-2 mb-3 min-h-[32px]">{w.description || "No description"}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />Team</span>
                  <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
