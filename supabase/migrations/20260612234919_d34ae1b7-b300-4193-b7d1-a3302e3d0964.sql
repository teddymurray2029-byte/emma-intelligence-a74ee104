
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any prior schedule with the same name
SELECT cron.unschedule('emma-auto-improve-15m')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'emma-auto-improve-15m');

SELECT cron.schedule(
  'emma-auto-improve-15m',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://lckpqjkvwvqpfymhmqgb.supabase.co/functions/v1/emma-auto-improve',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxja3Bxamt2d3ZxcGZ5bWhtcWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2ODM1NzUsImV4cCI6MjA5MDI1OTU3NX0.wRXmZechd8bONEUJqozsD1C9xMxoak2BsbqJJw2DBFg"}'::jsonb,
    body := jsonb_build_object('trigger','cron','ts', now())
  ) AS request_id;
  $$
);
