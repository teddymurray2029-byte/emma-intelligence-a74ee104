import { useEffect, useState, useCallback } from "react";
import { useOutletContext, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { pmApi, type Story, type StoryStatus, type Workspace } from "@/lib/pm-api";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Sparkles, Bug, CheckSquare, BookOpen, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const COLUMNS: { key: StoryStatus; label: string; color: string }[] = [
  { key: "todo", label: "To Do", color: "bg-muted" },
  { key: "in_progress", label: "In Progress", color: "bg-blue-500/10" },
  { key: "review", label: "Review", color: "bg-amber-500/10" },
  { key: "done", label: "Done", color: "bg-emerald-500/10" },
  { key: "blocked", label: "Blocked", color: "bg-destructive/10" },
];

const TYPE_ICON = { story: BookOpen, task: CheckSquare, bug: Bug, epic: Zap };
const PRIORITY_COLOR: Record<string, string> = {
  urgent: "bg-destructive text-destructive-foreground",
  high: "bg-orange-500/20 text-orange-700 dark:text-orange-300",
  medium: "bg-blue-500/20 text-blue-700 dark:text-blue-300",
  low: "bg-muted",
};

export default function ProjectBoard() {
  const { workspace } = useOutletContext<{ workspace: Workspace }>();
  const { id } = useParams();
  const nav = useNavigate();
  const { getToken } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ title: "", description: "", type: "story", priority: "medium", points: 3, criteria: "" });

  const load = useCallback(async () => {
    const r = await pmApi.listStories({ workspace_id: id }, getToken);
    setStories(r.data || []);
  }, [id, getToken]);

  useEffect(() => { load(); }, [load]);

  // Realtime
  useEffect(() => {
    if (!id) return;
    const ch = supabase.channel(`board-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pm_stories", filter: `workspace_id=eq.${id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "pm_ai_runs", filter: `workspace_id=eq.${id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, load]);

  const create = async () => {
    if (!draft.title.trim()) return;
    try {
      await pmApi.createStory({
        workspace_id: id, title: draft.title, description: draft.description,
        type: draft.type, priority: draft.priority, story_points: draft.points,
        acceptance_criteria: draft.criteria,
      }, getToken);
      toast.success("Story created");
      setOpen(false);
      setDraft({ title: "", description: "", type: "story", priority: "medium", points: 3, criteria: "" });
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const onDrop = async (status: StoryStatus, e: React.DragEvent) => {
    e.preventDefault();
    const sid = e.dataTransfer.getData("story_id");
    if (!sid) return;
    try {
      await pmApi.updateStory(sid, { status }, getToken);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const runAI = async (story: Story, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await pmApi.startAIRun(story.id, getToken);
      toast.success(`Emma is working on "${story.title}"`);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-muted-foreground">{stories.length} stories</div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" />New Story</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>New user story</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="As a user, I want to..." value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} autoFocus />
              <Textarea placeholder="Description / context" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              <Textarea placeholder="Acceptance criteria (Given / When / Then)" rows={3} value={draft.criteria} onChange={(e) => setDraft({ ...draft, criteria: e.target.value })} />
              <div className="grid grid-cols-3 gap-2">
                <Select value={draft.type} onValueChange={(v) => setDraft({ ...draft, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="story">Story</SelectItem>
                    <SelectItem value="task">Task</SelectItem>
                    <SelectItem value="bug">Bug</SelectItem>
                    <SelectItem value="epic">Epic</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={draft.priority} onValueChange={(v) => setDraft({ ...draft, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="number" placeholder="Points" value={draft.points} onChange={(e) => setDraft({ ...draft, points: Number(e.target.value) })} />
              </div>
              <Button onClick={create} className="w-full" disabled={!draft.title.trim()}>Create story</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3 overflow-auto">
        {COLUMNS.map((col) => {
          const items = stories.filter((s) => s.status === col.key);
          return (
            <div
              key={col.key}
              className="flex flex-col rounded-lg border border-border bg-card/50 min-h-[200px]"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(col.key, e)}
            >
              <div className={`px-3 py-2 rounded-t-lg ${col.color} flex items-center justify-between`}>
                <span className="text-xs font-semibold uppercase tracking-wider">{col.label}</span>
                <Badge variant="outline" className="text-[10px]">{items.length}</Badge>
              </div>
              <div className="flex-1 p-2 space-y-2 overflow-auto">
                {items.map((s) => {
                  const Icon = TYPE_ICON[s.type] || BookOpen;
                  return (
                    <div
                      key={s.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("story_id", s.id)}
                      onClick={() => nav(`/projects/${id}/story/${s.id}`)}
                      className="bg-background border border-border rounded-md p-3 cursor-pointer hover:border-primary/40 transition-colors group"
                    >
                      <div className="flex items-start gap-2 mb-2">
                        <Icon className="h-3.5 w-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm font-medium leading-tight flex-1">{s.title}</span>
                      </div>
                      <div className="flex items-center justify-between gap-1 flex-wrap">
                        <div className="flex items-center gap-1">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_COLOR[s.priority] || ""}`}>{s.priority}</span>
                          {s.story_points > 0 && <Badge variant="outline" className="text-[10px] h-4">{s.story_points}pt</Badge>}
                        </div>
                        <Button size="sm" variant="ghost" className="h-6 px-1.5 opacity-0 group-hover:opacity-100" onClick={(e) => runAI(s, e)} title="Let Emma build this">
                          <Sparkles className="h-3 w-3 text-primary" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {items.length === 0 && <div className="text-[10px] text-muted-foreground text-center py-4">No stories</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
