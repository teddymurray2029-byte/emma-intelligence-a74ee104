import { useEffect, useState } from "react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare, Bot, Zap, TrendingUp, ArrowLeft, Target, Database, Brain, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

const ROADMAP = {
  completed: [
    "Multi-pane code editor with semantic theme",
    "Persistent file explorer state",
    "Autonomous agent loop",
    "Memory & retrieval system",
  ],
  inProgress: [
    "Real-time collaborative editing",
    "Cross-project knowledge transfer",
    "Voice-mode latency improvements",
  ],
  next: [
    "Self-improving prompt evolution",
    "Multi-modal sensory grounding",
    "Federated agent swarms",
  ],
};

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [convCount, setConvCount] = useState(0);
  const [msgCount, setMsgCount] = useState(0);
  const [memoryCount, setMemoryCount] = useState(0);
  const [goalCount, setGoalCount] = useState(0);
  const [benchScore, setBenchScore] = useState<number | null>(null);
  const [tokenEstimate, setTokenEstimate] = useState(0);
  const [dailyData, setDailyData] = useState<{ day: string; messages: number; tokens: number }[]>([]);

  useEffect(() => {
    if (!user) return;

    supabase.from("conversations").select("id", { count: "exact", head: true }).then(({ count }) => setConvCount(count || 0));
    supabase.from("memory_episodes").select("id", { count: "exact", head: true }).eq("user_id", user.id).then(({ count }) => setMemoryCount(count || 0));
    supabase.from("goals").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "active").then(({ count }) => setGoalCount(count || 0));
    supabase.from("benchmark_runs").select("total_score").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).single().then(({ data }) => {
      if (data) setBenchScore(Number(data.total_score));
    });

    supabase
      .from("messages")
      .select("content, created_at, role")
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (!data) { setLoading(false); return; }
        setMsgCount(data.length);
        const totalTokens = data.reduce((sum, m) => sum + Math.round(m.content.split(/\s+/).length * 1.3), 0);
        setTokenEstimate(totalTokens);

        const dayMap: Record<string, { messages: number; tokens: number }> = {};
        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          dayMap[days[d.getDay()]] = { messages: 0, tokens: 0 };
        }
        data.forEach((m) => {
          const key = days[new Date(m.created_at).getDay()];
          if (dayMap[key]) {
            dayMap[key].messages++;
            dayMap[key].tokens += Math.round(m.content.split(/\s+/).length * 1.3);
          }
        });
        setDailyData(Object.entries(dayMap).map(([day, v]) => ({ day, ...v })));
        setLoading(false);
      });
  }, [user]);

  const formatTokens = (n: number) => n >= 1000 ? `~${(n / 1000).toFixed(1)}K` : `~${n}`;

  const stats = [
    { label: "Conversations", value: convCount, icon: MessageSquare, color: "text-primary", tint: "from-primary/15" },
    { label: "Messages", value: msgCount, icon: Bot, color: "text-accent", tint: "from-accent/15" },
    { label: "Memory Episodes", value: memoryCount, icon: Database, color: "text-primary", tint: "from-primary/15" },
    { label: "Active Goals", value: goalCount, icon: Target, color: "text-accent", tint: "from-accent/15" },
    { label: "Agents", value: 8, icon: Brain, color: "text-primary", tint: "from-primary/15" },
    { label: "Bench Score", value: benchScore !== null ? `${benchScore}/100` : "N/A", icon: TrendingUp, color: "text-primary", tint: "from-primary/15" },
    { label: "Est. Tokens", value: formatTokens(tokenEstimate), icon: Zap, color: "text-accent", tint: "from-accent/15" },
  ];

  const hasChartData = dailyData.some(d => d.messages > 0 || d.tokens > 0);

  return (
    <div className="min-h-screen bg-background relative">
      <div className="absolute inset-0 emma-soft-grid opacity-20 pointer-events-none" />
      <header className="relative h-12 flex items-center border-b border-border/60 bg-card/60 backdrop-blur-xl px-4 gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-sm font-semibold tracking-tight emma-glow-text-static">Dashboard</h1>
        <span className="text-[10px] font-mono text-muted-foreground bg-secondary/60 border border-white/[0.05] px-2 py-0.5 rounded-full">Overview</span>
      </header>

      <div className="relative p-6 max-w-6xl mx-auto space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
              className={`emma-card emma-hover-lift rounded-2xl p-3 space-y-1.5 bg-gradient-to-br ${s.tint} to-transparent`}
            >
              <s.icon className={`h-4 w-4 ${s.color}`} />
              {loading ? (
                <Skeleton className="h-6 w-12" />
              ) : (
                <p className="text-xl font-bold text-foreground tracking-tight">{s.value}</p>
              )}
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="emma-card rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-foreground tracking-tight">Token Usage</h3>
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">7 days</span>
            </div>
            {loading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : !hasChartData ? (
              <div className="emma-empty-state h-[200px]">
                <Sparkles className="h-6 w-6 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">No usage yet — start a conversation to see metrics.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={dailyData}>
                  <defs>
                    <linearGradient id="tokenGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "10px", fontSize: 12, boxShadow: "0 12px 32px -12px hsl(0 0% 0% / 0.5)" }} />
                  <Area type="monotone" dataKey="tokens" stroke="hsl(var(--primary))" fill="url(#tokenGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="emma-card rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-foreground tracking-tight">Messages per Day</h3>
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">7 days</span>
            </div>
            {loading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : !hasChartData ? (
              <div className="emma-empty-state h-[200px]">
                <MessageSquare className="h-6 w-6 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">No messages yet this week.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dailyData}>
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "10px", fontSize: 12, boxShadow: "0 12px 32px -12px hsl(0 0% 0% / 0.5)" }} />
                  <Bar dataKey="messages" fill="hsl(var(--accent))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* System Status / Roadmap */}
        <div className="emma-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-medium text-foreground tracking-tight">System Status & Roadmap</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">Live capabilities and what's coming next</p>
            </div>
            <span className="text-[10px] font-mono text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">v2.0</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <RoadmapColumn
              title="Completed"
              icon={<CheckCircle2 className="h-3.5 w-3.5 text-success" />}
              items={ROADMAP.completed}
              tint="text-success"
              dotClass="bg-success"
            />
            <RoadmapColumn
              title="In Progress"
              icon={<Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />}
              items={ROADMAP.inProgress}
              tint="text-primary"
              dotClass="bg-primary emma-pulse"
            />
            <RoadmapColumn
              title="Next"
              icon={<Sparkles className="h-3.5 w-3.5 text-accent" />}
              items={ROADMAP.next}
              tint="text-accent"
              dotClass="bg-accent/70"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function RoadmapColumn({ title, icon, items, tint, dotClass }: { title: string; icon: React.ReactNode; items: string[]; tint: string; dotClass: string }) {
  return (
    <div className="rounded-xl p-3 bg-secondary/30 border border-white/[0.04]">
      <div className="flex items-center gap-1.5 mb-2.5">
        {icon}
        <h4 className={`text-[11px] font-semibold uppercase tracking-wider ${tint}`}>{title}</h4>
        <span className="ml-auto text-[10px] font-mono text-muted-foreground">{items.length}</span>
      </div>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <li key={it} className="flex items-start gap-2 text-xs text-foreground/85 leading-snug">
            <span className={`mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0 ${dotClass}`} />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
