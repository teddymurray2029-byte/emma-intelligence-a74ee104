CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  name text NOT NULL DEFAULT 'Untitled Project',
  description text DEFAULT '',
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  github_repo text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.projects FOR ALL TO service_role USING (true) WITH CHECK (true);