-- Several pack sizes per ingredient (e.g. 300ml and 600ml double cream).
-- One row per (ingredient, product); the shopping list picks the cheapest mix
-- that covers the week's need (lib/ingredient-key.js choosePacks).
-- Applied via MCP in two steps so linking never broke during the deploy:
--   1. add the new constraint (before deploying the API)
--   2. drop the old one-per-ingredient constraint (after deploying)
alter table public.product_links
  add constraint product_links_ingredient_product_key unique (ingredient_key, product_slug);
alter table public.product_links
  drop constraint if exists product_links_ingredient_key_key;
