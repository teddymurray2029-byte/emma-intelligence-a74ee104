-- Provenance and benchmark evaluation separation
CREATE TABLE IF NOT EXISTS public.benchmark_dataset_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  split_name text NOT NULL UNIQUE,
  evaluation_tier text NOT NULL DEFAULT 'internal_smoke',
  is_holdout boolean NOT NULL DEFAULT false,
  is_private boolean NOT NULL DEFAULT false,
  is_adversarial boolean NOT NULL DEFAULT false,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.benchmark_scorer_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scorer_name text NOT NULL,
  version text NOT NULL,
  scoring_strategy text NOT NULL DEFAULT 'deterministic_parser',
  is_primary boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scorer_name, version)
);

CREATE TABLE IF NOT EXISTS public.benchmark_run_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  prompt_text text,
  prompt_version integer,
  model_name text,
  model_version text,
  random_seed bigint,
  time_budget_ms integer,
  requested_category text,
  evaluation_tier text NOT NULL DEFAULT 'internal_smoke',
  enable_secondary_llm_judge boolean NOT NULL DEFAULT false,
  adapter_config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.benchmark_questions
  ADD COLUMN IF NOT EXISTS split_id uuid REFERENCES public.benchmark_dataset_splits(id),
  ADD COLUMN IF NOT EXISTS task_type text NOT NULL DEFAULT 'deterministic',
  ADD COLUMN IF NOT EXISTS parser_type text NOT NULL DEFAULT 'exact_match',
  ADD COLUMN IF NOT EXISTS parser_config jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS external_adapter text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';

ALTER TABLE public.benchmark_runs
  ADD COLUMN IF NOT EXISTS run_config_id uuid REFERENCES public.benchmark_run_configs(id),
  ADD COLUMN IF NOT EXISTS dataset_split_id uuid REFERENCES public.benchmark_dataset_splits(id),
  ADD COLUMN IF NOT EXISTS scorer_version_id uuid REFERENCES public.benchmark_scorer_versions(id),
  ADD COLUMN IF NOT EXISTS confidence_interval jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS run_metadata jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS llm_judge_summary jsonb NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.benchmark_run_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.benchmark_runs(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.benchmark_questions(id) ON DELETE CASCADE,
  primary_score numeric NOT NULL DEFAULT 0,
  primary_max_score numeric NOT NULL DEFAULT 10,
  secondary_llm_score numeric,
  parser_type text,
  reasoning text,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.benchmark_dataset_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benchmark_scorer_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benchmark_run_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benchmark_run_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON public.benchmark_dataset_splits;
DROP POLICY IF EXISTS "Service role full access" ON public.benchmark_scorer_versions;
DROP POLICY IF EXISTS "Service role full access" ON public.benchmark_run_configs;
DROP POLICY IF EXISTS "Service role full access" ON public.benchmark_run_items;

CREATE POLICY "Service role full access" ON public.benchmark_dataset_splits FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.benchmark_scorer_versions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.benchmark_run_configs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.benchmark_run_items FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.benchmark_dataset_splits (split_name, evaluation_tier, is_holdout, is_private, is_adversarial, description)
VALUES
  ('internal_smoke_v1', 'internal_smoke', false, false, false, 'Fast deterministic smoke checks for CI and regressions'),
  ('asi_claim_grade_v1', 'asi_claim_grade', true, true, true, 'Private holdout and adversarial variants for claim-grade evaluation')
ON CONFLICT (split_name) DO NOTHING;

INSERT INTO public.benchmark_scorer_versions (scorer_name, version, scoring_strategy, is_primary, config)
VALUES
  ('deterministic_parser', 'v1', 'exact-match-graded', true, '{"llm_judge_role":"secondary_only"}'::jsonb),
  ('llm_judge', 'v1', 'qualitative', false, '{"primary":false}'::jsonb)
ON CONFLICT (scorer_name, version) DO NOTHING;

CREATE OR REPLACE VIEW public.benchmark_internal_smoke_dashboard AS
SELECT
  br.id,
  br.user_id,
  br.total_score,
  br.max_score,
  br.category_scores,
  br.confidence_interval,
  br.created_at,
  bds.split_name,
  brc.model_name,
  brc.model_version,
  brc.prompt_version,
  bsv.scorer_name,
  bsv.version AS scorer_version
FROM public.benchmark_runs br
LEFT JOIN public.benchmark_run_configs brc ON br.run_config_id = brc.id
LEFT JOIN public.benchmark_dataset_splits bds ON br.dataset_split_id = bds.id
LEFT JOIN public.benchmark_scorer_versions bsv ON br.scorer_version_id = bsv.id
WHERE COALESCE(brc.evaluation_tier, bds.evaluation_tier, 'internal_smoke') = 'internal_smoke';

CREATE OR REPLACE VIEW public.benchmark_asi_claim_grade_dashboard AS
SELECT
  br.id,
  br.user_id,
  br.total_score,
  br.max_score,
  br.category_scores,
  br.confidence_interval,
  br.created_at,
  bds.split_name,
  brc.model_name,
  brc.model_version,
  brc.prompt_version,
  brc.random_seed,
  brc.time_budget_ms,
  bsv.scorer_name,
  bsv.version AS scorer_version,
  br.llm_judge_summary
FROM public.benchmark_runs br
LEFT JOIN public.benchmark_run_configs brc ON br.run_config_id = brc.id
LEFT JOIN public.benchmark_dataset_splits bds ON br.dataset_split_id = bds.id
LEFT JOIN public.benchmark_scorer_versions bsv ON br.scorer_version_id = bsv.id
WHERE COALESCE(brc.evaluation_tier, bds.evaluation_tier, 'internal_smoke') = 'asi_claim_grade';
