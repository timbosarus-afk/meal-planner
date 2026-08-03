// Vercel serverless function — POST { "url": "https://..." } to scrape a recipe
// AND save it to Supabase in one step.
//
// Requires env vars (set in Vercel dashboard):
//   ANTHROPIC_API_KEY — only used for sites without JSON-LD
//   SUPABASE_URL, SUPABASE_ANON_KEY — from the meal-planner Supabase project

const { scrapeAndSaveRecipe } = require('../lib/scrape-recipe');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST with a JSON body: { "url": "..." }' });
    return;
  }

  const { url } = req.body || {};

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Missing "url" in request body' });
    return;
  }

  try {
    const recipe = await scrapeAndSaveRecipe(url);
    res.status(200).json(recipe);
  } catch (err) {
    console.error('Scrape failed:', err);
    res.status(500).json({ error: err.message || 'Scrape failed' });
  }
};
