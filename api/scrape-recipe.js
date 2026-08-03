// Vercel serverless function — POST { "url": "https://..." } to scrape a recipe.
//
// Requires ANTHROPIC_API_KEY set in Vercel project env vars (Settings > Environment
// Variables) — only used when a site doesn't have JSON-LD and we fall back to
// Claude parsing the page text.

const { scrapeRecipe } = require('../lib/scrape-recipe');

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
    const recipe = await scrapeRecipe(url);
    res.status(200).json(recipe);
  } catch (err) {
    console.error('Scrape failed:', err);
    res.status(500).json({ error: err.message || 'Scrape failed' });
  }
};
