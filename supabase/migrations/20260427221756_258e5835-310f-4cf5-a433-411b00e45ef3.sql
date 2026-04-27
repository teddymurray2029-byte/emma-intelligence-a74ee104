
-- agent_tools: self-forged tool registry
CREATE TABLE public.agent_tools (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  spec JSONB NOT NULL DEFAULT '{}'::jsonb,
  code TEXT,
  endpoint TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  invocations INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_tools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.agent_tools FOR ALL TO service_role USING (true) WITH CHECK (true);

-- plan_nodes: HTN+MCTS plan trees
CREATE TABLE public.plan_nodes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan_id UUID NOT NULL,
  parent_id UUID,
  goal_id UUID,
  action TEXT NOT NULL,
  rationale TEXT,
  expected_utility NUMERIC DEFAULT 0,
  visit_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  result JSONB DEFAULT '{}'::jsonb,
  depth INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.plan_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.plan_nodes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_plan_nodes_plan ON public.plan_nodes(plan_id);
CREATE INDEX idx_plan_nodes_user ON public.plan_nodes(user_id);

-- memory_summaries: hierarchical consolidation
CREATE TABLE public.memory_summaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  level TEXT NOT NULL,
  summary TEXT NOT NULL,
  range_start TIMESTAMPTZ NOT NULL,
  range_end TIMESTAMPTZ NOT NULL,
  source_episode_count INTEGER NOT NULL DEFAULT 0,
  embedding extensions.vector(768),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.memory_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.memory_summaries FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_memory_summaries_user_level ON public.memory_summaries(user_id, level, range_end DESC);

-- causal_edges: causal graph
CREATE TABLE public.causal_edges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  cause TEXT NOT NULL,
  effect TEXT NOT NULL,
  strength NUMERIC NOT NULL DEFAULT 0.5,
  evidence_count INTEGER NOT NULL DEFAULT 1,
  domain TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.causal_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.causal_edges FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_causal_edges_user ON public.causal_edges(user_id);

-- collective_knowledge: anonymized shared wisdom
CREATE TABLE public.collective_knowledge (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  problem_pattern TEXT NOT NULL,
  solution_pattern TEXT NOT NULL,
  domain TEXT,
  success_count INTEGER NOT NULL DEFAULT 1,
  curated BOOLEAN NOT NULL DEFAULT false,
  embedding extensions.vector(768),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.collective_knowledge ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.collective_knowledge FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Public read curated" ON public.collective_knowledge FOR SELECT TO anon, authenticated USING (curated = true);

-- agent_marketplace
CREATE TABLE public.agent_marketplace (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'agent',
  manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
  install_count INTEGER NOT NULL DEFAULT 0,
  rating NUMERIC NOT NULL DEFAULT 0,
  published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_marketplace ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.agent_marketplace FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Public read published" ON public.agent_marketplace FOR SELECT TO anon, authenticated USING (published = true);

-- agent_installs
CREATE TABLE public.agent_installs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  marketplace_id UUID NOT NULL REFERENCES public.agent_marketplace(id) ON DELETE CASCADE,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, marketplace_id)
);
ALTER TABLE public.agent_installs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.agent_installs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- constitutions
CREATE TABLE public.constitutions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  rules TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.constitutions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.constitutions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_constitutions_user_active ON public.constitutions(user_id, active);

-- defi_strategies (simulation only, read-only DeFi)
CREATE TABLE public.defi_strategies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  chain TEXT NOT NULL DEFAULT 'polygon',
  strategy JSONB NOT NULL DEFAULT '{}'::jsonb,
  simulation_result JSONB DEFAULT '{}'::jsonb,
  approved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.defi_strategies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.defi_strategies FOR ALL TO service_role USING (true) WITH CHECK (true);

-- capability_scores: public leaderboard
CREATE TABLE public.capability_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  benchmark TEXT NOT NULL,
  score NUMERIC NOT NULL,
  max_score NUMERIC NOT NULL DEFAULT 100,
  model_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.capability_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.capability_scores FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Public read scores" ON public.capability_scores FOR SELECT TO anon, authenticated USING (true);
