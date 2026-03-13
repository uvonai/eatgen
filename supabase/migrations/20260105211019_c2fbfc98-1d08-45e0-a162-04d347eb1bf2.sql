-- Create storage bucket for food images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'food-images',
  'food-images',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload their own images
CREATE POLICY "Users can upload their own food images"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'food-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow public read access to food images
CREATE POLICY "Public read access to food images"
ON storage.objects
FOR SELECT
USING (bucket_id = 'food-images');

-- Allow users to update their own images
CREATE POLICY "Users can update their own food images"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'food-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to delete their own images
CREATE POLICY "Users can delete their own food images"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'food-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);