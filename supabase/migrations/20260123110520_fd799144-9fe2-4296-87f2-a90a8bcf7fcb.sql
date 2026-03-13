-- Create table to track device free scan usage (persists across reinstalls via device ID)
CREATE TABLE public.device_free_scans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id TEXT NOT NULL UNIQUE,
  used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  platform TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- No RLS needed - this is accessed via service role from edge function
-- The edge function handles all logic securely
ALTER TABLE public.device_free_scans ENABLE ROW LEVEL SECURITY;

-- Create index for fast lookups
CREATE INDEX idx_device_free_scans_device_id ON public.device_free_scans(device_id);