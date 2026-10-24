// Vercel serverless function — GET list of all saved recipes.
// Returns lightweight summaries (image_url for the Recipes tab gallery,
// nickname for shorter display names) — use GET /api/recipe?id=... for
// full detail with ingredients/steps.

const { supabase } = require('../lib/db');
const reparseIngredients = require('../lib/reparse-ingredients');
const { canMake, setRole } = require('../lib/can-make');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // Maintenance tool: GET previews, POST applies (see lib/reparse-ingredients.js)
  if (req.query && req.query.action === 'reparse') return reparseIngredients(req, res);

  const action = req.query && req.query.action;
  try {
    if (action === 'can-make' && req.method === 'GET') return res.status(200).json(await canMake());
    if (action === 'set-role' && req.method === 'POST') {
      const { ingredientId, role } = req.body || {};
      if (!ingredientId || !['core', 'optional', 'swappable'].includes(role)) return res.status(400).json({ error: 'Need ingredientId and role (core, optional or swappable)' });
      return res.status(200).json(await setRole(ingredientId, role));
    }
  } catch (err) {
    console.error('recipes action failed:', err);
    return res.status(500).json({ error: err.message });
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Use GET' });
    return;
  }

  const { data, error } = await supabase
    .from('recipes')
    .select('id, title, nickname, source_url, servings, prep_time_minutes, cook_time_minutes, image_url, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(200).json(data);
};
