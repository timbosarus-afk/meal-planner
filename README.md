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
