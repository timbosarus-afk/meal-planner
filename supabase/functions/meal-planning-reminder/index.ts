// Planning reminder for the meal planner. Called every 15 min by pg_cron
// (db/2026-11-21-meal-reminders.sql). Sends one web push per chosen day at the
// chosen local time, telling you whether next week has been planned yet.
//
// Settings live in app_settings:
//   meal_reminder_enabled  'true' | 'false'      (default true)
//   meal_reminder_days     JSON array, 0=Sun..6=Sat (default every day)
//   meal_reminder_time     'HH:MM' local          (default '18:00')
//   meal_reminder_tz       IANA zone              (default 'Europe/London')
//   meal_reminder_last_sent 'YYYY-MM-DD'          (written here, stops repeats)
//
// POST { test: true, endpoint } sends a test push to that one saved device.
// Reuses the project's VAPID_* secrets (shared with the BlizzCon app).
// verify_jwt is off (cron has no user auth); a cron call is idempotent per day
// and a test only reaches an endpoint that is already subscribed.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:example@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, authorization, apikey' } });

function localParts(tz: string, d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
    .formatToParts(d).map(x => [x.type, x.value]));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute), dow };
}

// Monday of next week, as YYYY-MM-DD, relative to a local date
function nextMonday(localDate: string, dow: number) {
  const d = new Date(localDate + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + ((8 - dow) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

async function message(local: { date: string; dow: number }) {
  const monday = nextMonday(local.date, local.dow);
  const { data: plans } = await supabase.from('weekly_plans').select('id, week_start_date').gte('week_start_date', local.date).order('week_start_date');
  const nice = new Date(monday + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const upcoming = (plans ?? []).find(p => p.week_start_date >= local.date);
  if (!upcoming) return { title: 'Time to plan meals', body: `Nothing planned for the week of ${nice} yet. Ask Claude to plan it.` };
  const { count } = await supabase.from('weekly_plan_recipes').select('id', { count: 'exact', head: true }).eq('weekly_plan_id', upcoming.id);
  return { title: 'Meals are planned', body: `${count ?? 0} meals lined up. Check the shopping list before you order.` };
}

async function sendAll(subs: { id: string; subscription: unknown }[], payload: object) {
  let sent = 0; const stale: string[] = [];
  for (const s of subs) {
    try { await webpush.sendNotification(s.subscription as webpush.PushSubscription, JSON.stringify(payload)); sent++; }
    catch (err) { const code = (err as { statusCode?: number })?.statusCode; if (code === 404 || code === 410) stale.push(s.id); else console.error('push failed', code, err); }
  }
  if (stale.length) await supabase.from('meal_push_subscriptions').delete().in('id', stale);
  return { sent, removed: stale.length };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return json({});
  const body = await req.json().catch(() => ({}));
  const { data: rows } = await supabase.from('app_settings').select('key, value').like('key', 'meal_reminder_%');
  const s = Object.fromEntries((rows ?? []).map(r => [r.key, r.value]));
  const tz = s.meal_reminder_tz || 'Europe/London';
  const local = localParts(tz);

  if (body.test) {
    if (!body.endpoint) return json({ error: 'endpoint required' }, 400);
    const { data: subs } = await supabase.from('meal_push_subscriptions').select('id, subscription').eq('endpoint', body.endpoint);
    if (!subs?.length) return json({ error: 'This device is not subscribed' }, 404);
    const msg = await message(local);
    return json(await sendAll(subs, { ...msg, title: `Test: ${msg.title}` }));
  }

  if (s.meal_reminder_enabled === 'false') return json({ skipped: 'disabled' });
  let days: number[] = [0, 1, 2, 3, 4, 5, 6];
  try { const d = JSON.parse(s.meal_reminder_days ?? 'null'); if (Array.isArray(d)) days = d; } catch { /* default */ }
  const [hh, mm] = (s.meal_reminder_time || '18:00').split(':').map(Number);
  const due = hh * 60 + mm;
  if (!days.includes(local.dow)) return json({ skipped: 'not a reminder day', local });
  if (local.minutes < due || local.minutes >= due + 60) return json({ skipped: 'not time', local });
  if (s.meal_reminder_last_sent === local.date) return json({ skipped: 'already sent today' });

  const { data: subs } = await supabase.from('meal_push_subscriptions').select('id, subscription');
  if (!subs?.length) return json({ skipped: 'no subscriptions' });
  await supabase.from('app_settings').upsert({ key: 'meal_reminder_last_sent', value: local.date });
  return json(await sendAll(subs, await message(local)));
});
