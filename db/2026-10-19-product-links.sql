-- Ingredient -> Sainsbury's product links.
-- One row per canonical ingredient key. Once a link exists, the extension
-- adds that exact product to the basket instead of searching for it.
--
-- RLS is left off to match the other meal planner tables (single-user app,
-- API uses the anon key). See the security note in the handover.

create table if not exists public.product_links (
  id            uuid primary key default gen_random_uuid(),
  ingredient_key text not null unique,          -- normalised, e.g. 'red onion'
  product_url   text not null,                  -- full Sainsbury's product page URL
  product_slug  text not null,                  -- path segment after /gol-ui/product/
  product_name  text,                           -- as shown on Sainsbury's
  pack_size     numeric,                        -- e.g. 500 (g), 1 (l), 3 (each)
  pack_unit     text,                           -- 'g' | 'ml' | 'each' | null
  default_qty   integer not null default 1,     -- used when units can't be compared
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create index if not exists product_links_slug_idx on public.product_links (product_slug);
