-- Pantry: "always have" (kind='always') replaces the old staples list,
-- "have right now" (kind='stock') is the fridge/freezer/cupboard stocktake.
create table if not exists pantry_items (
  id uuid primary key default gen_random_uuid(),
  item_name text not null,
  ingredient_key text not null,
  section text not null default 'Other',
  kind text not null default 'always' check (kind in ('always','stock')),
  quantity numeric,
  unit text,
  updated_at timestamptz not null default now(),
  unique (ingredient_key)
);
alter table recipe_ingredients add column if not exists role text not null default 'core' check (role in ('core','optional','swappable'));
-- staples table is left untouched as a backup; rows copied by the migration script.

insert into pantry_items (item_name, ingredient_key, section, kind) values
('cinnamon','cinnamon','Spices & Herbs','always'),
('chopped tomatoes','chopped tomato','Baking & Dry Goods','always'),
('dried italian herbs','italian herb','Spices & Herbs','always'),
('dry red wine','dry red wine','Oils, Sauces & Condiments','always'),
('lasagna sheets','lasagna sheet','Baking & Dry Goods','always'),
('salt','salt','Spices & Herbs','always'),
('sugar','sugar','Baking & Dry Goods','always'),
('tomato paste','tomato puree','Oils, Sauces & Condiments','always'),
('vegetable oil','vegetable oil','Oils, Sauces & Condiments','always')
on conflict (ingredient_key) do nothing;

-- 'want' = extras added from "What can I make" for the next order
alter table pantry_items drop constraint if exists pantry_items_kind_check;
alter table pantry_items add constraint pantry_items_kind_check check (kind in ('always','stock','want'));

-- Default roles for existing recipes (new imports use lib/ingredient-role.js)
update recipe_ingredients set role='swappable' where id in ('27a85aef-061f-44bc-994a-c35825fe1c74','53b64602-ff17-4853-bef6-61d8fd61a629','ba2eb633-306b-4caa-ab16-95c25fcb57cc','ed8a442f-8e4c-4b55-b745-9ada0ff8b7c1','0f610067-e2b5-4599-8980-9abb6bfa9ee9');
update recipe_ingredients set role='optional' where id='9c6cd7fd-b9e1-4cf5-b202-5e982b3717a6';
