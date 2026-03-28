import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Flag, Target, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { getGoals } from "@/lib/agi-api";

interface Goal {
  id: string;
  goal_type: string;
  description: string;
  priority: number;
  status: string;
  progress: number;
  created_at: string;
  completed_at: string | null;
}

export function GoalsPanel() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getGoals()
      .then((data) => setGoals(data.goals || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const statusIcon = (status: string) => {
    if (status === "completed") return <CheckCircle2 className="h-3 w-3 text-green-400" />;
    if (status === "active") return <Target className="h-3 w-3 text-primary animate-pulse" />;
    return <Clock className="h-3 w-3 text-muted-foreground" />;
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Flag className="h-4 w-4 text-accent" />
        Goal Engine
        <span className="text-[10px] font-mono text-muted-foreground ml-auto">{goals.filter(g => g.status === "active").length} active</span>
      </h3>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : goals.length === 0 ? (
        <p className="text-[10px] text-muted-foreground text-center py-4">No goals yet. Run benchmarks to auto-generate goals.</p>
      ) : (
        <div className="space-y-2">
          {goals.map((goal, i) => (
            <motion.div
              key={goal.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="emma-surface-elevated rounded-lg p-3 space-y-2"
            >
              <div className="flex items-start gap-2">
                {statusIcon(goal.status)}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground">{goal.description}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-mono text-muted-foreground">P{goal.priority}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">{goal.goal_type}</span>
                  </div>
                </div>
              </div>
              {goal.progress > 0 && (
                <div className="w-full h-1 bg-secondary rounded-full">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${goal.progress}%` }} />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
