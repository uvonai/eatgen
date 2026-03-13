-- Add display_name column to profiles table for storing user's name
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS display_name TEXT;