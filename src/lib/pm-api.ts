import { dbProxy } from "./db-proxy";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

async function callFn(fn: string, body: any, getToken: () => Promise<string | null>) {
  const token = await getToken();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `Error ${res.status}` }));
    throw new Error(err.error || `Error ${res.status}`);
  }
  return res.json();
}

export const pmApi = {
  // workspaces
  listWorkspaces: (gt: any) => callFn("emma-pm", { action: "list_workspaces" }, gt),
  createWorkspace: (params: any, gt: any) => callFn("emma-pm", { action: "create_workspace", ...params }, gt),
  getWorkspace: (workspace_id: string, gt: any) => callFn("emma-pm", { action: "get_workspace", workspace_id }, gt),
  updateWorkspace: (workspace_id: string, updates: any, gt: any) => callFn("emma-pm", { action: "update_workspace", workspace_id, updates }, gt),
  deleteWorkspace: (workspace_id: string, gt: any) => callFn("emma-pm", { action: "delete_workspace", workspace_id }, gt),

  // members
  listMembers: (workspace_id: string, gt: any) => callFn("emma-pm", { action: "list_members", workspace_id }, gt),
  invite: (params: any, gt: any) => callFn("emma-pm", { action: "invite_member", ...params }, gt),
  acceptInvite: (params: any, gt: any) => callFn("emma-pm", { action: "accept_invite", ...params }, gt),
  updateRole: (params: any, gt: any) => callFn("emma-pm", { action: "update_member_role", ...params }, gt),
  removeMember: (params: any, gt: any) => callFn("emma-pm", { action: "remove_member", ...params }, gt),

  // epics & sprints
  listEpics: (workspace_id: string, gt: any) => callFn("emma-pm", { action: "list_epics", workspace_id }, gt),
  createEpic: (params: any, gt: any) => callFn("emma-pm", { action: "create_epic", ...params }, gt),
  listSprints: (workspace_id: string, gt: any) => callFn("emma-pm", { action: "list_sprints", workspace_id }, gt),
  createSprint: (params: any, gt: any) => callFn("emma-pm", { action: "create_sprint", ...params }, gt),
  updateSprint: (sprint_id: string, updates: any, gt: any) => callFn("emma-pm", { action: "update_sprint", sprint_id, updates }, gt),

  // stories
  listStories: (params: any, gt: any) => callFn("emma-pm", { action: "list_stories", ...params }, gt),
  getStory: (story_id: string, gt: any) => callFn("emma-pm", { action: "get_story", story_id }, gt),
  createStory: (params: any, gt: any) => callFn("emma-pm", { action: "create_story", ...params }, gt),
  updateStory: (story_id: string, updates: any, gt: any) => callFn("emma-pm", { action: "update_story", story_id, updates }, gt),
  deleteStory: (story_id: string, gt: any) => callFn("emma-pm", { action: "delete_story", story_id }, gt),
  addComment: (story_id: string, body: string, gt: any) => callFn("emma-pm", { action: "add_comment", story_id, body }, gt),

  // chat
  listChannels: (workspace_id: string, gt: any) => callFn("emma-pm-chat", { action: "list_channels", workspace_id }, gt),
  createChannel: (params: any, gt: any) => callFn("emma-pm-chat", { action: "create_channel", ...params }, gt),
  listMessages: (params: any, gt: any) => callFn("emma-pm-chat", { action: "list_messages", ...params }, gt),
  sendMessage: (params: any, gt: any) => callFn("emma-pm-chat", { action: "send_message", ...params }, gt),
  react: (message_id: string, emoji: string, gt: any) => callFn("emma-pm-chat", { action: "react", message_id, emoji }, gt),
  notifications: (gt: any) => callFn("emma-pm-chat", { action: "list_notifications" }, gt),
  markRead: (ids: string[], gt: any) => callFn("emma-pm-chat", { action: "mark_read", ids }, gt),

  // AI
  startAIRun: (story_id: string, gt: any) => callFn("emma-pm-ai-run", { action: "start", story_id }, gt),
  getAIRun: (run_id: string, gt: any) => callFn("emma-pm-ai-run", { action: "get_run", run_id }, gt),
};

export type StoryStatus = "todo" | "in_progress" | "review" | "done" | "blocked";
export type StoryType = "story" | "task" | "bug" | "epic";
export type StoryPriority = "low" | "medium" | "high" | "urgent";
export type PMRole = "admin" | "mod" | "contributor" | "viewer";

export interface Story {
  id: string;
  workspace_id: string;
  epic_id: string | null;
  sprint_id: string | null;
  parent_id: string | null;
  type: StoryType;
  title: string;
  description: string;
  acceptance_criteria: string;
  status: StoryStatus;
  priority: StoryPriority;
  story_points: number;
  assignee_id: string | null;
  reporter_id: string;
  labels: string[];
  position: number;
  created_at: string;
  updated_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  github_repo: string | null;
  my_role?: PMRole;
  created_at: string;
  updated_at: string;
}
