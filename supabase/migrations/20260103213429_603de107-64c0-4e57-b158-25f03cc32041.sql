-- Create a public bucket for app assets like videos
INSERT INTO storage.buckets (id, name, public)
VALUES ('app-assets', 'app-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to read from the bucket (public videos)
CREATE POLICY "Public read access for app assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'app-assets');

-- Allow authenticated users to upload (for admin purposes)
CREATE POLICY "Authenticated users can upload app assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'app-assets' AND auth.role() = 'authenticated');