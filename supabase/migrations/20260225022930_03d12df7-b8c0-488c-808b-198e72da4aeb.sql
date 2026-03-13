-- Drop the push_subscriptions updated_at trigger
DROP TRIGGER IF EXISTS update_push_subscriptions_updated_at ON public.push_subscriptions;

-- Drop the trigger function
DROP FUNCTION IF EXISTS public.update_push_subscriptions_updated_at();

-- Drop the push_subscriptions table
DROP TABLE IF EXISTS public.push_subscriptions;

-- Drop pg_cron and pg_net extensions (only used for notifications)
DROP EXTENSION IF EXISTS pg_cron;
DROP EXTENSION IF EXISTS pg_net;