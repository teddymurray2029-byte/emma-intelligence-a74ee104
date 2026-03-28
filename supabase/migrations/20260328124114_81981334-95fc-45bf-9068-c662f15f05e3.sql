
CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Default',
  key_hash text NOT NULL,
  key_prefix text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own api keys" ON public.api_keys
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can insert own api keys" ON public.api_keys
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own api keys" ON public.api_keys
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can delete own api keys" ON public.api_keys
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Service role can read all api keys" ON public.api_keys
  FOR SELECT TO service_role USING (true);
