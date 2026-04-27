import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { pmApi, type Workspace } from "@/lib/pm-api";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Sparkles, Send, Loader2, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const STATUS_LABEL: Record<string, string> = {
  todo: "To Do", in_progress: "In Progress", review: "Review", done: "Done", blocked: "Blocked",
};
const RUN_ICON: Record<string, any> = {
  queued: Clock, planning: Loader2, executing: Loader2, review: CheckCircle2, done: CheckCircle2, failed: AlertCircle,
};

export default function StoryDetail() {
  const { id, storyId } = useParams();
  const nav = useNavigate();
  const { getToken } = useAuth();
  const { workspace } = useOutletContext<{ workspace: Workspace }>();
  const [data, setData] = useState<any>(null);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);

  const load = useCallback(async () => {
    if (!storyId) return;
    try {
      const r = await pmApi.getStory(storyId, getToken);
      setData(r.data);
    } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  }, [storyId, getToken]);

  useEffect(() => { load(); }, [load]);

  // Realtime updates for AI runs + comments
  useEffect(() => {
    if (!storyId) return;
    const ch = supabase.channel(`story-${storyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pm_ai_runs", filter: `story_id=eq.${storyId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "pm_comments", filter: `story_id=eq.${storyId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "pm_stories", filter: `id=eq.${storyId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [storyId, load]);

  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!data) return <div className="p-6 text-muted-foreground">Not found</div>;

  const { story, comments, activity, ai_runs } = data;
  const update = async (updates: any) => {
    try {
      await pmApi.updateStory(story.id, updates, getToken);
      load();
    } catch (e: any) { toast.error(e.message); }
  };
  const sendComment = async () => {
    if (!comment.trim()) return;
    try {
      await pmApi.addComment(story.id, comment, getToken);
      setComment(""); load();
    } catch (e: any) { toast.error(e.message); }
  };
  const runAI = async () => {
    setAiLoading(true);
    try {
      await pmApi.startAIRun(story.id, getToken);
      toast.success("Emma started — watch for live updates");
      load();
    } catch (e: any) { toast.error(e.message); }
    setAiLoading(false);
  };

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-[1fr,360px] gap-0 overflow-hidden">
      {/* Main */}
      <div className="overflow-auto p-6">
        <button onClick={() => nav(`/projects/${id}/board`)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mb-3">
          <ArrowLeft className="h-3 w-3" /> Back to board
        </button>
        <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="capitalize">{story.type}</Badge>
          <span>•</span>
          <span>{STATUS_LABEL[story.status]}</span>
        </div>
        <Input
          className="text-2xl font-bold border-0 px-0 h-auto py-1 mb-4"
          defaultValue={story.title}
          onBlur={(e) => e.target.value !== story.title && update({ title: e.target.value })}
        />

        <section className="mb-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Description</h3>
          <Textarea
            defaultValue={story.description}
            placeholder="Add a description…"
            rows={5}
            onBlur={(e) => e.target.value !== story.description && update({ description: e.target.value })}
          />
        </section>

        <section className="mb-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Acceptance criteria</h3>
          <Textarea
            defaultValue={story.acceptance_criteria}
            placeholder="Given / When / Then…"
            rows={4}
            onBlur={(e) => e.target.value !== story.acceptance_criteria && update({ acceptance_criteria: e.target.value })}
          />
        </section>

        {/* AI Runs */}
        {ai_runs.length > 0 && (
          <section className="mb-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">AI runs</h3>
            <div className="space-y-2">
              {ai_runs.map((r: any) => {
                const Icon = RUN_ICON[r.status] || Clock;
                const animated = r.status === "planning" || r.status === "executing";
                return (
                  <div key={r.id} className="border border-border rounded-md p-3 bg-card/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className={`h-4 w-4 ${animated ? "animate-spin text-primary" : r.status === "failed" ? "text-destructive" : "text-emerald-500"}`} />
                      <span className="text-sm font-medium capitalize">{r.status}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">{new Date(r.started_at).toLocaleString()}</span>
                    </div>
                    {r.result?.summary && (
                      <pre className="text-xs whitespace-pre-wrap font-sans text-muted-foreground max-h-64 overflow-auto">{r.result.summary}</pre>
                    )}
                    {r.logs && <pre className="text-[10px] text-destructive whitespace-pre-wrap mt-2">{r.logs}</pre>}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Comments */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Activity</h3>
          <div className="space-y-3">
            {comments.map((c: any) => (
              <div key={c.id} className="border border-border rounded-md p-3 bg-card/30">
                <div className="text-xs text-muted-foreground mb-1">
                  {c.author_id === "emma-bot" ? "🤖 Emma" : c.author_id.slice(0, 12)} • {new Date(c.created_at).toLocaleString()}
                </div>
                <div className="text-sm whitespace-pre-wrap">{c.body}</div>
              </div>
            ))}
            <div className="flex gap-2">
              <Textarea placeholder="Add a comment…" value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
              <Button onClick={sendComment} disabled={!comment.trim()}><Send className="h-4 w-4" /></Button>
            </div>
          </div>
        </section>
      </div>

      {/* Side panel */}
      <aside className="border-l border-border bg-card/30 overflow-auto p-4 space-y-4">
        <Button className="w-full" onClick={runAI} disabled={aiLoading || story.status === "in_progress"}>
          {aiLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
          Let Emma build this
        </Button>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</label>
          <Select value={story.status} onValueChange={(v) => update({ status: v })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Priority</label>
          <Select value={story.priority} onValueChange={(v) => update({ priority: v })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Story points</label>
          <Input type="number" defaultValue={story.story_points} onBlur={(e) => update({ story_points: Number(e.target.value) })} className="mt-1" />
        </div>

        <div className="text-[10px] text-muted-foreground space-y-1 pt-3 border-t border-border">
          <div>Reporter: {story.reporter_id?.slice(0, 14)}</div>
          <div>Created: {new Date(story.created_at).toLocaleString()}</div>
          <div>Updated: {new Date(story.updated_at).toLocaleString()}</div>
        </div>

        <div>
          <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Recent activity</h4>
          <div className="space-y-1">
            {activity.slice(0, 10).map((a: any) => (
              <div key={a.id} className="text-[10px] text-muted-foreground">
                <span className="capitalize">{a.action.replace(/_/g, " ")}</span> · {new Date(a.created_at).toLocaleTimeString()}
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
