# meal-planner

Replaces HelloFresh / Green Chef. Import recipes from any URL, pick your meals for the
week, get a consolidated shopping list, order via a browser extension on Tesco/Sainsbury's.

## Status

**Phase 1 (in progress):** recipe importer

- `lib/scrape-recipe.js` — core scraping logic
  - Tries schema.org/Recipe JSON-LD first (works for most WordPress food blogs, Waitrose, etc.)
  - Falls back to Claude parsing the raw page text if no JSON-LD is found
  - Flags pages that need a headless browser (`needsBrowser: true`) — JS-rendered SPAs
    like Sainsbury's recipe pages serve an empty shell until client JS runs, so neither
    JSON-LD extraction nor text-based Claude parsing can see anything useful. Not solved yet.
- `api/scrape-recipe.js` — Vercel serverless function wrapping the above

**Not started yet:**

- Ingredient consolidation across multiple recipes (merging quantities/units)
- Weekly meal picker UI (mobile-first)
- Supabase schema (recipes, ingredients, staples, weekly_plan)
- Portion scaling
- Pantry staples exclusion (reactive "already have this" + persistent staples list)
- Chrome extension for Tesco/Sainsbury's basket automation (PC only)
- Headless-browser fallback for JS-rendered recipe sites

## Local setup

```bash
npm install
cp .env.example .env.local   # add your Anthropic API key
vercel dev                    # requires Vercel CLI: npm i -g vercel
```

## Testing the scraper

```bash
curl -X POST http://localhost:3000/api/scrape-recipe \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.mygreekdish.com/recipe/mousakas/"}'
```

Known-good test URLs (static HTML, JSON-LD path):
- https://www.mygreekdish.com/recipe/mousakas/
- https://www.waitrose.com/ecom/recipe/mexican-style-prawn-salad

Known-bad test URL (JS-rendered SPA, will return `needsBrowser: true`):
- https://www.sainsburys.co.uk/gol-ui/recipes/fish-finger-tacos

## Data Claude writes (via the Supabase connector)
| Table | What the app does with it |
|---|---|
| `recipes` (+ `recipe_ingredients`) | Recipes list/page. Uses `rating`, `rating_notes`, `cuisine`, `tags` (`lunch-friendly` is highlighted), `last_cooked`, `source` |
| `weekly_plans` / `weekly_plan_recipes` | This Week. `servings_override - servings_target` = extra lunch portions. `status`: `planning` → `sent` (Send to Sainsbury's) → `ordered` (extension finished) |
| `shopping_list_items` | Claude's curated list for a week; when present it replaces the generated list. `section` groups, `position` orders, `pack_note` shows under the item, `checked` is ticked in the app |
| `pantry_items` | Pantry page and What can I make? (`kind`: `stock` / `always` / `want`) |
| `product_links` | Written by the extension when a product is added to the basket: real Sainsbury's products and pack sizes |
| `meal_preferences` | Claude only; not shown in the app |

## Planning reminder
- Edge function `supabase/functions/meal-planning-reminder` (deployed, `verify_jwt` off), called every 15 min by
  pg_cron job `meal-planning-reminder` (`db/2026-11-21-meal-reminders.sql`)
- Reuses the project's `VAPID_*` edge function secrets (shared with the BlizzCon app)
- Settings in `app_settings`: `meal_reminder_enabled`, `meal_reminder_days`, `meal_reminder_time`, `meal_reminder_tz`
- iPhone: push only works from the Home Screen app (iOS 16.4+)

## Cook Timer shortcut (iPhone)
Create a Shortcut named **Cook Timer**: *Receive Text input* → *Start Timer for (Shortcut Input) minutes*.
The cook mode timer button opens `shortcuts://run-shortcut?name=Cook%20Timer&input=text&text=<minutes>`.
