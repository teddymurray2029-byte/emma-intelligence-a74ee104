
CREATE TABLE public.world_model_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  diff jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.world_model_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.world_model_states FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_world_model_user_version ON public.world_model_states (user_id, version DESC);

CREATE TABLE public.metacognitive_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  loop_id uuid NOT NULL,
  phase text NOT NULL,
  quality_score numeric NOT NULL DEFAULT 5,
  intervention text,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.metacognitive_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.metacognitive_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_metacognitive_loop ON public.metacognitive_logs (loop_id);
CREATE INDEX idx_metacognitive_user ON public.metacognitive_logs (user_id, created_at DESC);
