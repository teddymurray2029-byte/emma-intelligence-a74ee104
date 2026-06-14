
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE public.agent_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  task TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'starting',
  session_id TEXT,
  envd_token TEXT,
  engagement JSONB DEFAULT '{}'::jsonb,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  action_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_screenshot TEXT,
  summary TEXT,
  error TEXT,
  step_count INTEGER NOT NULL DEFAULT 0,
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX agent_runs_user_idx ON public.agent_runs (user_id, started_at DESC);
CREATE INDEX agent_runs_status_hb_idx ON public.agent_runs (status, last_heartbeat) WHERE status = 'running';

GRANT ALL ON public.agent_runs TO service_role;

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

-- No authenticated/anon policies: all client access is brokered through the edge function (service_role).
CREATE POLICY "service_role full access"
  ON public.agent_runs
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
