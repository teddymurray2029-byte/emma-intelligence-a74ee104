CREATE TABLE public.world_model_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  prediction_type text NOT NULL CHECK (prediction_type IN ('forecast', 'counterfactual')),
  event_key text NOT NULL,
  hypothesis text NOT NULL,
  intervention text,
  horizon text,
  predicted_probability numeric NOT NULL CHECK (predicted_probability >= 0 AND predicted_probability <= 1),
  confidence numeric NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  assumptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  drivers jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_snapshot_version integer,
  model_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone
);

ALTER TABLE public.world_model_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.world_model_predictions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_world_model_predictions_user_created ON public.world_model_predictions (user_id, created_at DESC);
CREATE INDEX idx_world_model_predictions_event ON public.world_model_predictions (user_id, event_key);

CREATE TABLE public.world_model_prediction_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  prediction_id uuid NOT NULL REFERENCES public.world_model_predictions(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  prediction_type text NOT NULL,
  intervention text,
  predicted_probability numeric NOT NULL CHECK (predicted_probability >= 0 AND predicted_probability <= 1),
  actual_probability numeric NOT NULL CHECK (actual_probability >= 0 AND actual_probability <= 1),
  observed_outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
  success boolean NOT NULL DEFAULT false,
  absolute_error numeric NOT NULL DEFAULT 0,
  brier_score numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.world_model_prediction_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.world_model_prediction_outcomes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_world_model_prediction_outcomes_user_created ON public.world_model_prediction_outcomes (user_id, created_at DESC);
CREATE INDEX idx_world_model_prediction_outcomes_prediction ON public.world_model_prediction_outcomes (prediction_id, created_at DESC);

CREATE TABLE public.world_model_calibration_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  sample_size integer NOT NULL DEFAULT 0,
  mean_brier_score numeric NOT NULL DEFAULT 0,
  mean_absolute_calibration_error numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.world_model_calibration_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.world_model_calibration_metrics FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_world_model_calibration_metrics_user_created ON public.world_model_calibration_metrics (user_id, created_at DESC);
