import { useEffect, useState, useCallback } from "react";
import { useParams, useOutletContext, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { pmApi, type Story, type Workspace } from "@/lib/pm-api";
import { Plus, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export default function ProjectBacklog() {
  const { id } = useParams();
  const nav = useNavigate();
  const { getToken } = useAuth();
  const { workspace } = useOutletContext<{ workspace: Workspace }>();
  const [stories, setStories] = useState<Story[]>([]);
  const [sprints, setSprints] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    const [s, sp] = await Promise.all([
      pmApi.listStories({ workspace_id: id }, getToken),
      pmApi.listSprints(id, getToken),
    ]);
    setStories(s.data || []);
    setSprints(sp.data || []);
  }, [id, getToken]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!name.trim()) return;
    try {
      await pmApi.createSprint({ workspace_id: id, name, goal }, getToken);
      setName(""); setGoal(""); setOpen(false);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const assignSprint = async (story_id: string, sprint_id: string | null) => {
    try {
      await pmApi.updateStory(story_id, { sprint_id }, getToken);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const backlog = stories.filter((s) => !s.sprint_id);

  return (
    <div className="p-6 space-y-6 overflow-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Sprints & Backlog</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />New sprint</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New sprint</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Sprint name (e.g. Sprint 12)" value={name} onChange={(e) => setName(e.target.value)} />
              <Input placeholder="Sprint goal" value={goal} onChange={(e) => setGoal(e.target.value)} />
              <Button onClick={create} className="w-full" disabled={!name.trim()}>Create</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {sprints.map((sp) => {
        const items = stories.filter((s) => s.sprint_id === sp.id);
        const points = items.reduce((a, s) => a + (s.story_points || 0), 0);
        const done = items.filter((s) => s.status === "done").reduce((a, s) => a + (s.story_points || 0), 0);
        const pct = points ? Math.round((done / points) * 100) : 0;
        return (
          <Card key={sp.id} className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold">{sp.name}</h3>
                  <Badge variant="outline" className="capitalize">{sp.status}</Badge>
                </div>
                {sp.goal && <p className="text-xs text-muted-foreground mt-1">{sp.goal}</p>}
              </div>
              <div className="text-xs text-muted-foreground">{done}/{points} pts • {pct}%</div>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-3">
              <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="space-y-1">
              {items.map((s) => (
                <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-secondary/50 cursor-pointer text-sm" onClick={() => nav(`/projects/${id}/story/${s.id}`)}>
                  <Badge variant="outline" className="text-[10px] capitalize">{s.type}</Badge>
                  <span className="flex-1 truncate">{s.title}</span>
                  <Badge variant="outline" className="text-[10px]">{s.story_points}pt</Badge>
                  <Badge variant="outline" className="text-[10px] capitalize">{s.status}</Badge>
                </div>
              ))}
              {items.length === 0 && <div className="text-xs text-muted-foreground text-center py-2">No stories — drag from backlog</div>}
            </div>
          </Card>
        );
      })}

      <Card className="p-4">
        <h3 className="font-semibold mb-3">Backlog ({backlog.length})</h3>
        <div className="space-y-1">
          {backlog.map((s) => (
            <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-secondary/50 text-sm">
              <Badge variant="outline" className="text-[10px] capitalize">{s.type}</Badge>
              <span className="flex-1 truncate cursor-pointer" onClick={() => nav(`/projects/${id}/story/${s.id}`)}>{s.title}</span>
              <Select value={s.sprint_id || "none"} onValueChange={(v) => assignSprint(s.id, v === "none" ? null : v)}>
                <SelectTrigger className="w-36 h-7 text-xs"><SelectValue placeholder="Move to sprint" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Backlog</SelectItem>
                  {sprints.map((sp) => <SelectItem key={sp.id} value={sp.id}>{sp.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ))}
          {backlog.length === 0 && <div className="text-xs text-muted-foreground text-center py-4">Backlog empty</div>}
        </div>
      </Card>
    </div>
  );
}
