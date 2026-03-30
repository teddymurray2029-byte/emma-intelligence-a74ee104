
-- Enable pgvector extension for semantic embeddings
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Add embedding column to memory_episodes
ALTER TABLE public.memory_episodes ADD COLUMN IF NOT EXISTS embedding vector(768);

-- Create index for fast similarity search
CREATE INDEX IF NOT EXISTS idx_memory_embedding ON public.memory_episodes USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create autonomous agent run log table
CREATE TABLE public.autonomous_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  trigger_type text NOT NULL DEFAULT 'scheduled',
  task_description text NOT NULL,
  result_summary text,
  quality_score numeric,
  goals_generated integer DEFAULT 0,
  world_model_updated boolean DEFAULT false,
  safety_report jsonb DEFAULT '{}'::jsonb,
  duration_ms integer,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.autonomous_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.autonomous_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_autonomous_runs_user ON public.autonomous_runs (user_id, created_at DESC);

-- Create formal safety verification log table
CREATE TABLE public.safety_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  verification_type text NOT NULL,
  input_hash text,
  passed boolean NOT NULL DEFAULT true,
  violations jsonb DEFAULT '[]'::jsonb,
  formal_proofs jsonb DEFAULT '[]'::jsonb,
  risk_score numeric DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.safety_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.safety_verifications FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Create transfer learning knowledge base
CREATE TABLE public.transfer_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  source_domain text NOT NULL,
  target_domain text,
  knowledge_type text NOT NULL DEFAULT 'pattern',
  content text NOT NULL,
  embedding vector(768),
  confidence numeric DEFAULT 0.5,
  transfer_count integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.transfer_knowledge ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.transfer_knowledge FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_transfer_embedding ON public.transfer_knowledge USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create sensory grounding logs
CREATE TABLE public.sensory_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  modality text NOT NULL DEFAULT 'visual',
  raw_input_ref text,
  grounded_representation jsonb DEFAULT '{}'::jsonb,
  physical_properties jsonb DEFAULT '{}'::jsonb,
  confidence numeric DEFAULT 0.5,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.sensory_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.sensory_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
