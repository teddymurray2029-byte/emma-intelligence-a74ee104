import { useEffect, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare, Bot, Zap, TrendingUp, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const mockUsage = [
  { day: "Mon", tokens: 12400 },
  { day: "Tue", tokens: 18200 },
  { day: "Wed", tokens: 9800 },
  { day: "Thu", tokens: 24100 },
  { day: "Fri", tokens: 15600 },
  { day: "Sat", tokens: 8900 },
  { day: "Sun", tokens: 21300 },
];

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [convCount, setConvCount] = useState(0);
  const [msgCount, setMsgCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    supabase.from("conversations").select("id", { count: "exact", head: true }).then(({ count }) => {
      setConvCount(count || 0);
    });
    supabase.from("messages").select("id", { count: "exact", head: true }).then(({ count }) => {
      setMsgCount(count || 0);
    });
  }, [user]);

  const stats = [
    { label: "Conversations", value: convCount, icon: MessageSquare, color: "text-primary" },
    { label: "Messages", value: msgCount, icon: Bot, color: "text-accent" },
    { label: "Agents Used", value: 6, icon: Zap, color: "text-emma-purple" },
    { label: "Est. Tokens", value: "~128K", icon: TrendingUp, color: "text-primary" },
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

        <div className="emma-surface-elevated emma-glow-border rounded-xl p-5">
          <h3 className="text-sm font-medium text-foreground mb-4">Token Usage (7 days)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={mockUsage}>
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
                { name: "Chat (Streaming)", status: "Active", color: "text-green-400" },
                { name: "Image Generation", status: "Active", color: "text-green-400" },
                { name: "Voice Input", status: "Active", color: "text-green-400" },
                { name: "Code Editor", status: "Active", color: "text-green-400" },
                { name: "Web Search", status: "API Key Required", color: "text-accent" },
                { name: "Code Execution", status: "API Key Required", color: "text-accent" },
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
