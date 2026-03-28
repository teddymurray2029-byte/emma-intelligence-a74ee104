import {
  MessageSquare,
  Plus,
  Bot,
  BarChart3,
  Settings,
  LogOut,
  Trash2,
  GitBranch,
  Brain,
  Shield,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import type { Conversation } from "@/hooks/useConversations";

interface EmmaSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onNavigate: (path: string) => void;
  onSignOut: () => void;
}

export function EmmaSidebar({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  onNavigate,
  onSignOut,
}: EmmaSidebarProps) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const startRename = (c: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(c.id);
    setEditTitle(c.title);
  };

  const commitRename = () => {
    if (editingId && editTitle.trim()) {
      onRename(editingId, editTitle.trim());
    }
    setEditingId(null);
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarContent>
        {/* Brand */}
        <div className="px-4 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg emma-gradient-bg flex items-center justify-center flex-shrink-0">
            <span className="font-mono font-bold text-xs text-primary-foreground">E</span>
          </div>
          {!collapsed && (
            <span className="font-semibold text-foreground tracking-tight">Emma</span>
          )}
        </div>

        {/* New Chat */}
        <div className="px-3 mb-2">
          <Button
            onClick={onCreate}
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2 border-border"
          >
            <Plus className="h-4 w-4" />
            {!collapsed && "New Chat"}
          </Button>
        </div>

        {/* Conversations */}
        <SidebarGroup>
          <SidebarGroupLabel>Conversations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {conversations.map((c) => (
                <SidebarMenuItem key={c.id}>
                  <SidebarMenuButton
                    onClick={() => onSelect(c.id)}
                    className={`group ${activeId === c.id ? "bg-secondary text-foreground" : ""}`}
                  >
                    {(c as any).parent_id ? (
                      <GitBranch className="h-4 w-4 flex-shrink-0 text-accent" />
                    ) : (
                      <MessageSquare className="h-4 w-4 flex-shrink-0" />
                    )}
                    {!collapsed && (
                      <>
                        {editingId === c.id ? (
                          <input
                            className="flex-1 bg-transparent text-sm outline-none border-b border-primary"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRename();
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span
                            className="truncate flex-1 text-sm"
                            onDoubleClick={(e) => startRename(c, e)}
                          >
                            {c.title}
                          </span>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                        </button>
                      </>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => onNavigate("/agents")}>
                  <Bot className="h-4 w-4" />
                  {!collapsed && <span>Agents</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => onNavigate("/agi")}>
                  <Brain className="h-4 w-4" />
                  {!collapsed && <span>AGI Systems</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => onNavigate("/dashboard")}>
                  <BarChart3 className="h-4 w-4" />
                  {!collapsed && <span>Dashboard</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => onNavigate("/settings")}>
                  <Settings className="h-4 w-4" />
                  {!collapsed && <span>Settings</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => onNavigate("/admin")}>
                  <Shield className="h-4 w-4" />
                  {!collapsed && <span>Admin Learning</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onSignOut}>
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>Sign Out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
