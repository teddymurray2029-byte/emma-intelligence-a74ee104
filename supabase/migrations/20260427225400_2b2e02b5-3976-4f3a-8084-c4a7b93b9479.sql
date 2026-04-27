-- Jira sync mappings
CREATE TABLE public.pm_jira_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE,
  site_url text NOT NULL,
  email text NOT NULL,
  project_key text NOT NULL,
  webhook_secret text,
  enabled boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pm_jira_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc_pm_jira_config" ON public.pm_jira_config FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.pm_jira_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  entity_type text NOT NULL, -- 'story' | 'epic' | 'sprint'
  emma_id uuid NOT NULL,
  jira_key text NOT NULL,
  jira_id text,
  last_pushed_at timestamptz,
  last_pulled_at timestamptz,
  last_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, entity_type, emma_id),
  UNIQUE (workspace_id, jira_key)
);
ALTER TABLE public.pm_jira_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc_pm_jira_links" ON public.pm_jira_links FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Slack app config per workspace (custom app)
CREATE TABLE public.pm_slack_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE,
  default_channel text,
  installed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pm_slack_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc_pm_slack_config" ON public.pm_slack_config FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Daily snapshots used for burndown / velocity
CREATE TABLE public.pm_sprint_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  sprint_id uuid NOT NULL,
  snapshot_date date NOT NULL,
  total_points integer NOT NULL DEFAULT 0,
  remaining_points integer NOT NULL DEFAULT 0,
  completed_points integer NOT NULL DEFAULT 0,
  total_stories integer NOT NULL DEFAULT 0,
  completed_stories integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sprint_id, snapshot_date)
);
ALTER TABLE public.pm_sprint_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc_pm_sprint_snapshots" ON public.pm_sprint_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_pm_sprint_snapshots_sprint ON public.pm_sprint_snapshots(sprint_id, snapshot_date);