import { useEffect, useState } from "react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare, Bot, Zap, TrendingUp, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [convCount, setConvCount] = useState(0);
  const [msgCount, setMsgCount] = useState(0);
  const [tokenEstimate, setTokenEstimate] = useState(0);
  const [dailyData, setDailyData] = useState<{ day: string; messages: number; tokens: number }[]>([]);

  useEffect(() => {
    if (!user) return;

    supabase.from("conversations").select("id", { count: "exact", head: true }).then(({ count }) => {
      setConvCount(count || 0);
    });

    // Get messages with content for real stats
    supabase
      .from("messages")
      .select("content, created_at, role")
      .order("created_at", { ascending: true })
      .then(({ data, count }) => {
        if (!data) return;
        setMsgCount(data.length);

        // Estimate tokens (word count * 1.3)
        const totalTokens = data.reduce((sum, m) => {
          const words = m.content.split(/\s+/).length;
          return sum + Math.round(words * 1.3);
        }, 0);
        setTokenEstimate(totalTokens);

        // Aggregate by day (last 7 days)
        const dayMap: Record<string, { messages: number; tokens: number }> = {};
        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const key = days[d.getDay()];
          dayMap[key] = { messages: 0, tokens: 0 };
        }

        data.forEach((m) => {
          const d = new Date(m.created_at);
          const key = days[d.getDay()];
          if (dayMap[key]) {
            dayMap[key].messages++;
            dayMap[key].tokens += Math.round(m.content.split(/\s+/).length * 1.3);
          }
        });

        setDailyData(Object.entries(dayMap).map(([day, v]) => ({ day, ...v })));
      });
  }, [user]);

  const formatTokens = (n: number) => {
    if (n >= 1000) return `~${(n / 1000).toFixed(1)}K`;
    return `~${n}`;
  };

  const stats = [
    { label: "Conversations", value: convCount, icon: MessageSquare, color: "text-primary" },
    { label: "Messages", value: msgCount, icon: Bot, color: "text-accent" },
    { label: "Agents Used", value: 6, icon: Zap, color: "text-primary" },
    { label: "Est. Tokens", value: formatTokens(tokenEstimate), icon: TrendingUp, color: "text-primary" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="h-12 flex items-center border-b border-border bg-card px-4 gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-sm font-semibold text-foreground">Dashboard</h1>
      </header>

      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="emma-surface-elevated emma-glow-border rounded-xl p-4 space-y-2">
              <s.icon className={`h-5 w-5 ${s.color}`} />
              <p className="text-2xl font-bold text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="emma-surface-elevated emma-glow-border rounded-xl p-5">
            <h3 className="text-sm font-medium text-foreground mb-4">Token Usage (7 days)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="tokenGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" stroke="hsl(215, 15%, 48%)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(215, 15%, 48%)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(222, 40%, 9%)", border: "1px solid hsl(222, 20%, 16%)", borderRadius: "8px", fontSize: 12 }}
                  labelStyle={{ color: "hsl(210, 20%, 92%)" }}
                />
                <Area type="monotone" dataKey="tokens" stroke="hsl(217, 91%, 60%)" fill="url(#tokenGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="emma-surface-elevated emma-glow-border rounded-xl p-5">
            <h3 className="text-sm font-medium text-foreground mb-4">Messages per Day</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dailyData}>
                <XAxis dataKey="day" stroke="hsl(215, 15%, 48%)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(215, 15%, 48%)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(222, 40%, 9%)", border: "1px solid hsl(222, 20%, 16%)", borderRadius: "8px", fontSize: 12 }}
                  labelStyle={{ color: "hsl(210, 20%, 92%)" }}
                />
                <Bar dataKey="messages" fill="hsl(35, 90%, 55%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="emma-surface-elevated emma-glow-border rounded-xl p-5">
            <h3 className="text-sm font-medium text-foreground mb-3">Active Agents</h3>
            <div className="space-y-2">
              {["Director", "Researcher", "Coder", "Designer", "Analyst", "QA"].map((name) => (
                <div key={name} className="flex items-center justify-between text-xs">
                  <span className="text-foreground">{name}</span>
                  <span className="text-muted-foreground font-mono">Ready</span>
                </div>
              ))}
            </div>
          </div>

          <div className="emma-surface-elevated emma-glow-border rounded-xl p-5">
            <h3 className="text-sm font-medium text-foreground mb-3">Capabilities</h3>
            <div className="space-y-2 text-xs">
              {[
                { name: "Chat (Streaming)", status: "Active", color: "text-primary" },
                { name: "Image Generation", status: "Active", color: "text-primary" },
                { name: "Voice I/O", status: "Active", color: "text-primary" },
                { name: "Code Editor", status: "Active", color: "text-primary" },
                { name: "File Upload", status: "Active", color: "text-primary" },
                { name: "Conversation Branching", status: "Active", color: "text-primary" },
                { name: "Web Search", status: "API Key Required", color: "text-accent" },
                { name: "Code Execution", status: "API Key Required", color: "text-accent" },
                { name: "GitHub", status: "API Key Required", color: "text-accent" },
              ].map((cap) => (
                <div key={cap.name} className="flex items-center justify-between">
                  <span className="text-foreground">{cap.name}</span>
                  <span className={`font-mono ${cap.color}`}>{cap.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
