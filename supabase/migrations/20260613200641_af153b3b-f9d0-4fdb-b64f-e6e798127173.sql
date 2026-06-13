CREATE TABLE public.physics_inventions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT,
  hypothesis TEXT,
  mechanism TEXT,
  equations TEXT,
  predictions TEXT,
  applications TEXT,
  novelty_score NUMERIC,
  source TEXT DEFAULT 'cron',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT ON public.physics_inventions TO anon, authenticated;
GRANT ALL ON public.physics_inventions TO service_role;
ALTER TABLE public.physics_inventions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view inventions" ON public.physics_inventions FOR SELECT USING (true);
CREATE INDEX idx_physics_inventions_created ON public.physics_inventions(created_at DESC);