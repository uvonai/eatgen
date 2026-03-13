-- Premium daily scan tracking for fair-use rate limiting
-- Tracks daily scan count per premium user with timezone-aware dates

CREATE TABLE public.premium_daily_scans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  scan_date DATE NOT NULL,
  scan_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT unique_user_date UNIQUE (user_id, scan_date)
);

-- Enable RLS
ALTER TABLE public.premium_daily_scans ENABLE ROW LEVEL SECURITY;

-- Users can view their own scan counts
CREATE POLICY "Users can view own premium scan counts"
ON public.premium_daily_scans
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own scan counts (upsert handled by edge function with service role)
CREATE POLICY "Users can insert own premium scan counts"
ON public.premium_daily_scans
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own scan counts
CREATE POLICY "Users can update own premium scan counts"
ON public.premium_daily_scans
FOR UPDATE
USING (auth.uid() = user_id);

-- Create index for fast lookups by user and date
CREATE INDEX idx_premium_daily_scans_user_date ON public.premium_daily_scans (user_id, scan_date DESC);

-- Trigger for updated_at
CREATE TRIGGER update_premium_daily_scans_updated_at
BEFORE UPDATE ON public.premium_daily_scans
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();