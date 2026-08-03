// Vercel serverless function — GET list of all saved recipes.
// Returns lightweight summaries (no ingredients/steps) for picking from — use
// GET /api/recipes/:id (not built yet, add if needed) for full detail.

const { supabase } = require('../lib/db');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Use GET' });
    return;
  }

  const { data, error } = await supabase
    .from('recipes')
    .select('id, title, source_url, servings, prep_time_minutes, cook_time_minutes, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(200).json(data);
};
