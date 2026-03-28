import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare, Bot, Zap, TrendingUp } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

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
    { label: "Agents Used", value: 6, icon: Zap, color: "text-aether-purple" },
    { label: "Est. Tokens", value: "~128K", icon: TrendingUp, color: "text-primary" },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h2 className="text-xl font-semibold text-foreground">Dashboard</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="aether-surface-elevated aether-glow-border rounded-xl p-4 space-y-2">
            <s.icon className={`h-5 w-5 ${s.color}`} />
            <p className="text-2xl font-bold text-foreground">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="aether-surface-elevated aether-glow-border rounded-xl p-5">
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
    </div>
  );
}
