
-- Fix: Replace overly permissive device_free_scans policy with no-access policy
-- (Edge functions use service role which bypasses RLS)
DROP POLICY IF EXISTS "Service role manages device scans" ON public.device_free_scans;

-- Block all direct access - only service role (which bypasses RLS) should access this table
CREATE POLICY "No direct access to device scans"
ON public.device_free_scans FOR SELECT
USING (false);
