CREATE TABLE IF NOT EXISTS public.improvement_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  parent_version integer NOT NULL,
  candidate_version integer NOT NULL,
  candidate_type text NOT NULL,
  diff_type text NOT NULL,
  proposal jsonb NOT NULL DEFAULT '{}'::jsonb,
  train_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  holdout_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  win_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  safety_regression boolean NOT NULL DEFAULT false,
  significant_win boolean NOT NULL DEFAULT false,
  stage text NOT NULL DEFAULT 'evaluation',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.improvement_candidate_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  candidate_id uuid NOT NULL REFERENCES public.improvement_candidates(id) ON DELETE CASCADE,
  stage text NOT NULL DEFAULT 'canary',
  status text NOT NULL DEFAULT 'pending',
  criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  rollback_triggered boolean NOT NULL DEFAULT false,
  current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.improvement_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.improvement_candidate_deployments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON public.improvement_candidates;
CREATE POLICY "Service role full access"
  ON public.improvement_candidates FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.improvement_candidate_deployments;
CREATE POLICY "Service role full access"
  ON public.improvement_candidate_deployments FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_improvement_candidates_user_time
  ON public.improvement_candidates (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_improvement_candidates_versions
  ON public.improvement_candidates (user_id, candidate_version DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_deployments_user_time
  ON public.improvement_candidate_deployments (user_id, created_at DESC);
