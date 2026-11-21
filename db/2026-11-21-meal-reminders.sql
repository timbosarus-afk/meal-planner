-- Planning reminder (web push). Applied via the Supabase MCP tools.
-- Subscriptions for this app only (BlizzCon has its own table).
create table if not exists public.meal_push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  endpoint     text not null unique,
  subscription jsonb not null,
  created_at   timestamptz not null default now()
);

-- Every 15 minutes; the function decides whether a reminder is due
-- (app_settings: meal_reminder_enabled / _days / _time / _tz / _last_sent).
-- To stop: select cron.unschedule('meal-planning-reminder');
select cron.schedule(
  'meal-planning-reminder',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://phesmbmeeblrqmviikca.supabase.co/functions/v1/meal-planning-reminder',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);
