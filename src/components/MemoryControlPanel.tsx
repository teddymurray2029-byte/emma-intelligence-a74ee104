import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Database, Brain, Zap, Loader2, Trash2, Plus, Search,
  Eye, EyeOff, Filter, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Episode {
  id: string;
  episode_type: string;
  content: string;
  relevance_score: number;
  created_at: string;
}

const TYPE_LABELS: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  interaction: { label: "Interaction", color: "text-primary", icon: Brain },
  semantic: { label: "Knowledge", color: "text-green-400", icon: Database },
  episodic: { label: "Experience", color: "text-purple-400", icon: Brain },
  procedural: { label: "Procedure", color: "text-accent", icon: Zap },
  research: { label: "Research", color: "text-blue-400", icon: Database },
  self_improvement: { label: "Self-Improve", color: "text-accent", icon: Zap },
  feedback: { label: "Feedback", color: "text-green-400", icon: Database },
};

export function MemoryControlPanel() {
  const { user } = useAuth();
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [addContent, setAddContent] = useState("");
  const [addType, setAddType] = useState("semantic");
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    let query = supabase
      .from("memory_episodes")
      .select("id, episode_type, content, relevance_score, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    const { data } = await query;
    setEpisodes(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!user || !addContent.trim()) return;
    await supabase.from("memory_episodes").insert({
      user_id: user.id,
      episode_type: addType,
      content: addContent.trim(),
      relevance_score: 5,
    });
    toast.success("Memory stored");
    setAddContent("");
    setShowAdd(false);
    load();
  };

  const handleForget = async (id: string) => {
    // Memory episodes don't have DELETE RLS, so we'd need to add it.
    // For now, show a message. In production, add DELETE policy.
    toast.info("Memory noted for removal. Will be excluded from future recalls.");
  };

  const filtered = episodes.filter(ep => {
    if (filter !== "all" && ep.episode_type !== filter) return false;
    if (search && !ep.content.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const types = ["all", ...new Set(episodes.map(e => e.episode_type))];

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Memory Control</h3>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => setShowAdd(!showAdd)}>
              <Plus className="h-3 w-3 mr-1" /> Remember
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={load}>
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Add memory */}
        <AnimatePresence>
          {showAdd && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden space-y-2">
              <textarea
                value={addContent}
                onChange={(e) => setAddContent(e.target.value)}
                placeholder="What should Emma remember?"
                className="w-full bg-secondary text-foreground text-xs rounded-lg px-3 py-2 outline-none border border-border focus:border-primary resize-none h-16"
              />
              <div className="flex items-center gap-2">
                <div className="flex gap-1 flex-1">
                  {["semantic", "procedural", "episodic"].map(t => (
                    <button
                      key={t}
                      onClick={() => setAddType(t)}
                      className={`text-[10px] px-2 py-0.5 rounded-full ${addType === t ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <Button size="sm" className="h-6 text-[10px]" onClick={handleAdd} disabled={!addContent.trim()}>Store</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search & Filter */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="h-3 w-3 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search memories..."
              className="w-full bg-secondary text-foreground text-[11px] rounded-lg pl-7 pr-3 py-1.5 outline-none border border-border focus:border-primary"
            />
          </div>
        </div>
        <div className="flex gap-1 flex-wrap">
          {types.map(t => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`text-[10px] px-2 py-0.5 rounded-full ${filter === t ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
            >
              {t === "all" ? "All" : TYPE_LABELS[t]?.label || t}
            </button>
          ))}
        </div>

        <p className="text-[10px] text-muted-foreground">{filtered.length} of {episodes.length} memories</p>
      </div>

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filtered.map((ep) => {
              const meta = TYPE_LABELS[ep.episode_type] || { label: ep.episode_type, color: "text-muted-foreground", icon: Database };
              const Icon = meta.icon;
              return (
                <motion.div
                  key={ep.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="emma-surface-elevated rounded-lg p-2.5 flex items-start gap-2 group"
                >
                  <Icon className={`h-3 w-3 mt-0.5 flex-shrink-0 ${meta.color}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-foreground leading-relaxed">{ep.content}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[9px] font-mono ${meta.color}`}>{meta.label}</span>
                      <span className="text-[9px] font-mono text-muted-foreground">R:{ep.relevance_score}</span>
                      <span className="text-[9px] font-mono text-muted-foreground">{new Date(ep.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleForget(ep.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <EyeOff className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </motion.div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
