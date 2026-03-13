
-- 1. Make food-images bucket private
UPDATE storage.buckets SET public = false WHERE id = 'food-images';

-- 2. Remove public read policies
DROP POLICY IF EXISTS "Public read access to food images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view food images" ON storage.objects;

-- 3. Add owner-only read policy
CREATE POLICY "Users can view own food images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'food-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- 4. Add RLS policies for device_free_scans (accessed by edge functions with service role,
-- but having explicit policies is better than none)
CREATE POLICY "Service role manages device scans"
ON public.device_free_scans FOR ALL
USING (true)
WITH CHECK (true);
