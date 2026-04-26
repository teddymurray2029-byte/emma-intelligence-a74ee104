-- 1. Payments table: add explicit restrictive policies for authenticated/anon to deny direct access.
-- All payment access goes through service-role edge functions. Users must never read payments directly
-- because the table contains emails, Stripe IDs, and amounts.
DROP POLICY IF EXISTS "Block authenticated direct access to payments" ON public.payments;
CREATE POLICY "Block authenticated direct access to payments"
ON public.payments
AS RESTRICTIVE
FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);

-- 2. Storage: tighten chat-uploads bucket.
-- This project uses Clerk auth (text user_id), not Supabase auth.uid(). Keep the bucket private at the
-- API level by removing the broad public SELECT policy and only allowing service-role access. Public
-- file delivery should go through signed URLs generated server-side.

-- Make bucket private (no anonymous listing/reading)
UPDATE storage.buckets SET public = false WHERE id = 'chat-uploads';

-- Drop any overly permissive policies on chat-uploads
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (qual ILIKE '%chat-uploads%' OR with_check ILIKE '%chat-uploads%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- Service role retains full access via existing default; no public/anon/authenticated policies.
-- Edge functions use the service-role key to upload and to mint signed URLs for downloads.
