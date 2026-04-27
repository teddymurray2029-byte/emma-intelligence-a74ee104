import { useEffect, useState, useCallback } from "react";
import { useParams, useOutletContext, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { pmApi, type Story, type Workspace } from "@/lib/pm-api";
import { Lightbulb, FileText, Sparkles, Eye, Rocket } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const STAGES = [
  { key: "todo", label: "Idea", icon: Lightbulb, color: "text-muted-foreground" },
  { key: "in_progress", label: "Build (AI)", icon: Sparkles, color: "text-blue-500" },
  { key: "review", label: "Review", icon: Eye, color: "text-amber-500" },
  { key: "done", label: "Ship", icon: Rocket, color: "text-emerald-500" },
];

export default function ProjectPipeline() {
  const { id } = useParams();
  const nav = useNavigate();
  const { getToken } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    const r = await pmApi.listStories({ workspace_id: id }, getToken);
    setStories(r.data || []);
  }, [id, getToken]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 overflow-auto">
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Workflow Pipeline</h2>
        <p className="text-sm text-muted-foreground">Idea → Build (AI) → Review → Ship</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {STAGES.map((stage, i) => {
          const items = stories.filter((s) => s.status === stage.key);
          return (
            <div key={stage.key} className="relative">
              <Card className="p-4 min-h-[400px]">
                <div className="flex items-center gap-2 mb-3">
                  <stage.icon className={`h-5 w-5 ${stage.color}`} />
                  <h3 className="font-semibold">{stage.label}</h3>
                  <Badge variant="outline" className="ml-auto">{items.length}</Badge>
                </div>
                <div className="space-y-2">
                  {items.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => nav(`/projects/${id}/story/${s.id}`)}
                      className="border border-border rounded-md p-2.5 cursor-pointer hover:border-primary/40 transition-colors text-sm"
                    >
                      <div className="font-medium leading-tight mb-1">{s.title}</div>
                      <div className="flex items-center gap-1 flex-wrap">
                        <Badge variant="outline" className="text-[10px] capitalize">{s.type}</Badge>
                        {s.story_points > 0 && <Badge variant="outline" className="text-[10px]">{s.story_points}pt</Badge>}
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && <div className="text-xs text-muted-foreground text-center py-4">Empty</div>}
                </div>
              </Card>
              {i < STAGES.length - 1 && (
                <div className="hidden md:block absolute -right-2 top-1/2 -translate-y-1/2 z-10 text-muted-foreground/40 text-2xl">→</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
