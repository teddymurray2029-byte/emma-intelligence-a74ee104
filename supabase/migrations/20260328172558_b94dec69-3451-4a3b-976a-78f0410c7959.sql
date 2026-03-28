
CREATE TABLE public.usage_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL,
  user_id text,
  messages_used integer NOT NULL DEFAULT 0,
  tokens_used integer NOT NULL DEFAULT 0,
  ip_addresses text[] DEFAULT '{}',
  is_paid boolean NOT NULL DEFAULT false,
  stripe_customer_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(fingerprint)
);

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text,
  fingerprint text,
  email text,
  stripe_session_id text UNIQUE,
  stripe_customer_id text,
  amount integer NOT NULL DEFAULT 1200,
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.fingerprint_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_fingerprint text NOT NULL,
  linked_fingerprint text NOT NULL,
  link_type text NOT NULL DEFAULT 'ip_match',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(primary_fingerprint, linked_fingerprint)
);

ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fingerprint_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.usage_tracking FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.payments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.fingerprint_links FOR ALL TO service_role USING (true) WITH CHECK (true);
