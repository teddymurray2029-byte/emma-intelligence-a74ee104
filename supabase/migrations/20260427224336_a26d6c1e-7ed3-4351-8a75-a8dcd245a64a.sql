
-- Role enum
DO $$ BEGIN
  CREATE TYPE public.pm_role AS ENUM ('admin', 'mod', 'contributor', 'viewer');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Workspaces
CREATE TABLE public.pm_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  owner_id TEXT NOT NULL,
  github_repo TEXT,
  slack_channel_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pm_workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc_pm_workspaces" ON public.pm_workspaces FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Members
CREATE TABLE public.pm_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.pm_workspaces(id) ON DELETE CASCADE,
  user_id TEXT,
  email TEXT,
  display_name TEXT,
  role public.pm_role NOT NULL DEFAULT 'contributor',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);
ALTER TABLE public.pm_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc_pm_members" ON public.pm_members FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_pm_members_user ON public.pm_members(user_id);
CREATE INDEX idx_pm_members_workspace ON public.pm_members(workspace_id);

-- Invites
CREATE TABLE public.pm_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.pm_workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.pm_role NOT NULL DEFAULT 'contributor',
  token TEXT NOT NULL UNIQUE,
  invited_by TEXT NOT NULL,
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pm_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc_pm_invites" ON public.pm_invites FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Epics
CREATE TABLE public.pm_epics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.pm_workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  color TEXT DEFAULT '#6366f1',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pm_epics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc_pm_epics" ON public.pm_epics FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Sprints
CREATE TABLE public.pm_sprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.pm_workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  goal TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'planned',
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pm_sprints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc_pm_sprints" ON public.pm_sprints FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Stories
CREATE TABLE public.pm_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.pm_workspaces(id) ON DELETE CASCADE,
  epic_id UUID REFERENCES public.pm_epics(id) ON DELETE SET NULL,
  sprint_id UUID REFERENCES public.pm_sprints(id) ON DELETE SET NULL,
  parent_id UUID REFERENCES public.pm_stories(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'story',
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  acceptance_criteria TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'medium',
  story_points INTEGER DEFAULT 0,
  assignee_id TEXT,
  reporter_id TEXT NOT NULL,
  labels TEXT[] DEFAULT '{}'::text[],
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pm_stories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc_pm_stories" ON public.pm_stories FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_pm_stories_workspace ON public.pm_stories(workspace_id);
CREATE INDEX idx_pm_stories_sprint ON public.pm_stories(sprint_id);
CREATE INDEX idx_pm_stories_status ON public.pm_stories(status);

-- Story links
CREATE TABLE public.pm_story_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_story UUID NOT NULL REFERENCES public.pm_stories(id) ON DELETE CASCADE,
  to_story UUID NOT NULL REFERENCES public.pm_stories(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL DEFAULT 'relates',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pm_story_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc_pm_story_links" ON public.pm_story_links FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Comments
CREATE TABLE public.pm_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES public.pm_stories(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pm_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc_pm_comments" ON public.pm_comments FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Activity log
CREATE TABLE public.pm_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.pm_workspaces(id) ON DELETE CASCADE,
  story_id UUID REFERENCES public.pm_stories(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pm_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc_pm_activity" ON public.pm_activity FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Attachments
CREATE TABLE public.pm_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES public.pm_stories(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  filename TEXT NOT NULL,
  size INTEGER DEFAULT 0,
  uploaded_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pm_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc_pm_attachments" ON public.pm_attachments FOR ALL TO service_role USING (true) WITH CHECK (true);

-- AI runs
CREATE TABLE public.pm_ai_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.pm_workspaces(id) ON DELETE CASCADE,
  story_id UUID NOT NULL REFERENCES public.pm_stories(id) ON DELETE CASCADE,
  triggered_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  plan JSONB DEFAULT '{}'::jsonb,
  result JSONB DEFAULT '{}'::jsonb,
  pr_url TEXT,
  branch TEXT,
  logs TEXT DEFAULT '',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
ALTER TABLE public.pm_ai_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc_pm_ai_runs" ON public.pm_ai_runs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Channels
CREATE TABLE public.pm_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.pm_workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  topic TEXT DEFAULT '',
  is_private BOOLEAN NOT NULL DEFAULT false,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pm_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc_pm_channels" ON public.pm_channels FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Channel members
CREATE TABLE public.pm_channel_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.pm_channels(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(channel_id, user_id)
);
ALTER TABLE public.pm_channel_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc_pm_channel_members" ON public.pm_channel_members FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Chat messages
CREATE TABLE public.pm_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.pm_workspaces(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.pm_channels(id) ON DELETE CASCADE,
  story_id UUID REFERENCES public.pm_stories(id) ON DELETE CASCADE,
  parent_message_id UUID REFERENCES public.pm_chat_messages(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL,
  author_name TEXT,
  body TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  reactions JSONB DEFAULT '{}'::jsonb,
  mentions TEXT[] DEFAULT '{}'::text[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at TIMESTAMPTZ
);
ALTER TABLE public.pm_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc_pm_chat_messages" ON public.pm_chat_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_pm_chat_channel ON public.pm_chat_messages(channel_id, created_at DESC);
CREATE INDEX idx_pm_chat_story ON public.pm_chat_messages(story_id, created_at DESC);

-- Notifications
CREATE TABLE public.pm_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  workspace_id UUID REFERENCES public.pm_workspaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pm_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc_pm_notifications" ON public.pm_notifications FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_pm_notifications_user ON public.pm_notifications(user_id, created_at DESC);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.pm_stories;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pm_chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pm_ai_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pm_activity;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pm_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pm_notifications;

ALTER TABLE public.pm_stories REPLICA IDENTITY FULL;
ALTER TABLE public.pm_chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.pm_ai_runs REPLICA IDENTITY FULL;
