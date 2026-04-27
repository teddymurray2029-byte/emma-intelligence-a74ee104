import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link, Outlet, NavLink } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { pmApi, type Workspace } from "@/lib/pm-api";
import { Layout, ListTodo, MessageSquare, GitBranch, Settings as SettingsIcon, ArrowLeft, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function ProjectLayout() {
  const { id } = useParams();
  const nav = useNavigate();
  const { getToken, user } = useAuth();
  const [ws, setWs] = useState<Workspace | null>(null);

  useEffect(() => {
    if (!id || !user) return;
    pmApi.getWorkspace(id, getToken).then((r) => setWs(r.data)).catch(() => nav("/projects"));
  }, [id, user, getToken, nav]);

  if (!ws) return <div className="p-6 text-muted-foreground">Loading…</div>;

  const tabs = [
    { to: `/projects/${id}/board`, label: "Board", icon: Layout },
    { to: `/projects/${id}/backlog`, label: "Backlog", icon: ListTodo },
    { to: `/projects/${id}/chat`, label: "Chat", icon: MessageSquare },
    { to: `/projects/${id}/pipeline`, label: "Pipeline", icon: GitBranch },
    { to: `/projects/${id}/members`, label: "Members", icon: Users },
    { to: `/projects/${id}/settings`, label: "Settings", icon: SettingsIcon },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border px-4 py-3 flex items-center gap-4">
        <Link to="/projects" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Link>
        <div>
          <h1 className="font-semibold leading-tight">{ws.name}</h1>
          <p className="text-xs text-muted-foreground">{ws.description || "Agile workspace"}</p>
        </div>
        {ws.my_role && <Badge variant="secondary" className="capitalize ml-2">{ws.my_role}</Badge>}
      </header>
      <nav className="border-b border-border px-4 flex items-center gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2.5 text-sm border-b-2 transition-colors ${
                isActive ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`
            }
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </NavLink>
        ))}
      </nav>
      <div className="flex-1 min-h-0">
        <Outlet context={{ workspace: ws }} />
      </div>
    </div>
  );
}
