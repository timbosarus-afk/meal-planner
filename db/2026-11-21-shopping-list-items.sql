-- Claude's curated shopping list for a week. When a week has rows here the
-- app shows them instead of the auto-generated list. Additive only.
-- RLS off to match the other meal planner tables (single-user app, anon key).
create table if not exists public.shopping_list_items (
  id             uuid primary key default gen_random_uuid(),
  weekly_plan_id uuid not null references public.weekly_plans(id) on delete cascade,
  item           text not null,
  quantity       numeric,
  unit           text,
  pack_note      text,                 -- e.g. "buy the 500g pack"
  section        text,                 -- e.g. "Fruit & Veg"
  position       integer not null default 0,
  checked        boolean not null default false,
  source         text not null default 'claude',
  created_at     timestamptz not null default now()
);
create index if not exists shopping_list_items_plan_idx on public.shopping_list_items (weekly_plan_id, position);
