# Meal Planner - Redesign Plan (Nov 2026)

## Context
The app's job is now **cooking and shopping**. Claude (via a Claude skill + the Supabase connector) handles finding meals, writing recipes into Supabase, tracking likes/dislikes in `meal_preferences`, curating shopping lists and updating the pantry. Remove anything in the app that calls the paid Claude API.

Supabase project: `phesmbmeeblrqmviikca` (also hosts the family wishlist and BlizzCon tables - do not touch those).

## 0. Migrate to React + Vite
- Move the front end from the single `public/index.html` to React + Vite (same stack as Tim's other apps).
- Keep `api/`, `db/`, `lib/`, `extension/` and the existing Supabase schema working.
- Mobile-first PWA, keep the green/white colour scheme. Design inspired by Tim's Japan holiday app.

## 1. Navigation
- Bottom bar with proper icons (e.g. lucide-react), no emojis; active tab in the app green.
- Customisable bottom bar: choose tabs in Settings; everything else on a "More" page.
- Default tabs: This Week, Recipes, Shopping, More. More holds Pantry, What can I make?, Settings.

## 2. This Week (main page, replaces "Batches")
- Shows all meals in the selected `weekly_plans` week; tap one to cook.
- Small week dropdown at the top to view past weeks.
- Clear delete option for old weeks.
- Show extra lunch portions (`weekly_plan_recipes.servings_override`) e.g. "+ lunch tomorrow".

## 3. Recipe page
- Two tabs: **Ingredients** (get everything out first) and **How to Cook**.
- Remove "Import a recipe" (recipes come from Claude now).
- Photo: keep "Add photo". When no photo, show a "Search Google" button that opens `https://www.google.com/search?tbm=isch&q=<recipe title>` in Safari.
- Respect new `recipes` columns: rating, rating_notes, cuisine, tags (incl. `lunch-friendly`), last_cooked, source.
- Quick rating (thumbs / 1-5) after cooking, saved to `recipes.rating`.

## 4. Cook mode (How to Cook tab)
- One step per screen, large text, next/back.
- Detect times in step text ("simmer for 20 mins", "1 hr 15 mins").
- Primary timer button opens an Apple Shortcut that starts a real iPhone Clock timer:
  `shortcuts://run-shortcut?name=Cook%20Timer&input=text&text=<minutes>`
  (Tim creates a "Cook Timer" shortcut: takes text input as minutes -> Start Timer.)
- Secondary in-app countdown, visual only (iOS pauses web apps in background).
- Mark `last_cooked` when finished.

## 5. Shopping
- Week dropdown (e.g. "Monday 23 November").
- Show Claude's curated list from a new `shopping_list_items` table when present, else fall back to the current generated list.
  - Columns: id, weekly_plan_id, item, quantity, unit, pack_note, section, position, checked, source, created_at.
- "Send to Sainsbury's" button (existing extension flow). Leave room for other retailers later; Sainsbury's only for now.
- Remove the paid AI sort.

## 6. Extension
- When a product is added to the basket, upsert into `product_links` (ingredient_key, product_url, product_slug, product_name, pack_size, pack_unit, last_used_at) so Claude can use real products/pack sizes.

## 7. Pantry & What can I make?
- Pantry page reads/edits `pantry_items` (Claude fills it via natural language). Remove the paid AI pantry parsing.
- What can I make?: match pantry items to recipe ingredients, show recipes he can make or is one ingredient away from (no AI call needed).

## 8. Settings
- Bottom bar tab picker.
- Planning reminder: web push (same approach as the BlizzCon app), daily by default, choose days and time.

## Ground rules
- Work on a branch; do not push to main or deploy without Tim saying "push".
- Never pause/restore the Supabase project.
- Ask before destructive DB changes; back up before data migrations.
