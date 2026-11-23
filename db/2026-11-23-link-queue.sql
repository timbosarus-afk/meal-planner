-- Ingredients waiting to be linked to a Sainsbury's product. Filled from the
-- recipe page ("Queue for linking"); Claude adds the queue to the extension's
-- Sainsbury's panel. RLS off like the other meal planner tables. Applied via MCP.
create table if not exists public.link_queue (
  id             uuid primary key default gen_random_uuid(),
  ingredient_key text not null unique,
  created_at     timestamptz not null default now()
);
