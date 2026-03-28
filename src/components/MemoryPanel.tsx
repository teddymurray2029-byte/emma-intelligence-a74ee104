import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Database, Brain, Zap, Loader2 } from "lucide-react";
import { getMemoryEpisodes } from "@/lib/agi-api";

interface Episode {
  id: string;
  episode_type: string;
  content: string;
  relevance_score: number;
  created_at: string;
}

const typeIcons: Record<string, React.ElementType> = {
  interaction: Brain,
  self_improvement: Zap,
  feedback: Database,
};

const typeColors: Record<string, string> = {
  interaction: "text-primary",
  self_improvement: "text-accent",
  feedback: "text-green-400",
};

export function MemoryPanel() {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMemoryEpisodes()
      .then((data) => setEpisodes(data.episodes || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Database className="h-4 w-4 text-primary" />
        Persistent Memory
        <span className="text-[10px] font-mono text-muted-foreground ml-auto">{episodes.length} episodes</span>
      </h3>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : episodes.length === 0 ? (
        <p className="text-[10px] text-muted-foreground text-center py-4">No memory episodes yet. Interact with Emma to build memory.</p>
      ) : (
        <div className="space-y-1.5">
          {episodes.map((ep, i) => {
            const Icon = typeIcons[ep.episode_type] || Database;
            const color = typeColors[ep.episode_type] || "text-muted-foreground";
            return (
              <motion.div
                key={ep.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.03 }}
                className="emma-surface-elevated rounded-lg p-2.5 flex items-start gap-2"
              >
                <Icon className={`h-3 w-3 mt-0.5 flex-shrink-0 ${color}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-foreground leading-relaxed">{ep.content.slice(0, 150)}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] font-mono text-muted-foreground">{ep.episode_type}</span>
                    <span className="text-[9px] font-mono text-muted-foreground">R:{ep.relevance_score}</span>
                    <span className="text-[9px] font-mono text-muted-foreground">{new Date(ep.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
