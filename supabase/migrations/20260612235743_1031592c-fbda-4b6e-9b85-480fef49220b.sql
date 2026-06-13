
CREATE POLICY "deny_all_cron_secrets" ON public.cron_secrets AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
