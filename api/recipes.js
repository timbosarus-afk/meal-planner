// Vercel serverless function — GET list of all saved recipes.
// Returns lightweight summaries (now including image_url for the Recipes
// tab gallery) — use GET /api/recipe?id=... for full detail with
// ingredients/steps.

const { supabase } = require('../lib/db');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Use GET' });
    return;
  }

  const { data, error } = await supabase
    .from('recipes')
    .select('id, title, source_url, servings, prep_time_minutes, cook_time_minutes, image_url, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(200).json(data);
};
