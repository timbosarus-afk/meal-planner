// Vercel serverless function — POST { "url": "https://..." } to scrape a
// recipe and save it as a NEW recipe in Supabase. Optionally pass
// { "recipeId": "..." } to overwrite an existing recipe in place instead
// (used by "Replace with new import" on the recipe detail page — keeps a
// single recipe up to date rather than creating a duplicate).
//
// Requires env vars (set in Vercel dashboard):
//   ANTHROPIC_API_KEY — only used for sites without JSON-LD
//   SUPABASE_URL, SUPABASE_ANON_KEY — from the meal-planner Supabase project

const { scrapeAndSaveRecipe, scrapeAndUpdateRecipe } = require('../lib/scrape-recipe');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST with a JSON body: { "url": "..." }' });
    return;
  }

  const { url, recipeId } = req.body || {};

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Missing "url" in request body' });
    return;
  }

  try {
    const recipe = recipeId
      ? await scrapeAndUpdateRecipe(url, recipeId)
      : await scrapeAndSaveRecipe(url);
    res.status(200).json(recipe);
  } catch (err) {
    console.error('Scrape failed:', err);
    res.status(500).json({ error: err.message || 'Scrape failed' });
  }
};
