-- Create table for push notification tokens and user preferences
CREATE TABLE public.push_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  push_token TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'unknown', -- 'ios', 'android', 'web'
  timezone_offset INTEGER NOT NULL DEFAULT 0, -- Minutes offset from UTC (e.g., -330 for IST)
  timezone_name TEXT, -- Optional: 'Asia/Kolkata', 'America/New_York', etc.
  notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  first_push_sent BOOLEAN NOT NULL DEFAULT false,
  last_morning_push TIMESTAMP WITH TIME ZONE,
  last_lunch_push TIMESTAMP WITH TIME ZONE,
  last_evening_push TIMESTAMP WITH TIME ZONE,
  last_night_push TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, push_token)
);

-- Enable Row Level Security
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can view their own subscriptions
CREATE POLICY "Users can view their own push subscriptions"
ON public.push_subscriptions
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own subscriptions
CREATE POLICY "Users can create their own push subscriptions"
ON public.push_subscriptions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own subscriptions
CREATE POLICY "Users can update their own push subscriptions"
ON public.push_subscriptions
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own subscriptions
CREATE POLICY "Users can delete their own push subscriptions"
ON public.push_subscriptions
FOR DELETE
USING (auth.uid() = user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_push_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_push_subscriptions_updated_at
BEFORE UPDATE ON public.push_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_push_subscriptions_updated_at();

-- Create index for efficient timezone-based queries
CREATE INDEX idx_push_subscriptions_timezone ON public.push_subscriptions(timezone_offset);
CREATE INDEX idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);
CREATE INDEX idx_push_subscriptions_enabled ON public.push_subscriptions(notifications_enabled) WHERE notifications_enabled = true;