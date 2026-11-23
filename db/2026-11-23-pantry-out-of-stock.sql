-- Pantry check: "No" on an always-have item sets this; the shopping list adds
-- it until the week is marked ordered (which clears it). Applied via MCP.
alter table public.pantry_items add column if not exists out_of_stock boolean not null default false;
