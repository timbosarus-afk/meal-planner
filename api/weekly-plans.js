// Vercel serverless function — a batch (internally still the "weekly_plans"
// table). GET lists all batches (most recent first). POST creates a new
// batch: { recipes: [{ recipeId, servingsOverride }], servingsTarget } —
// status starts as 'planning'. Also accepts the older { recipeIds: [...] }
// shape (no per-recipe servings) for backward compatibility.

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

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('weekly_plans')
      .select('*')
      .order('week_start_date', { ascending: false });

    if (error) { res.status(500).json({ error: error.message }); return; }
    res.status(200).json(data);
    return;
  }

  if (req.method === 'POST') {
    const { recipes, recipeIds, servingsTarget = 2, weekStartDate } = req.body || {};

    // Normalise both input shapes into [{ recipeId, servingsOverride }]
    const recipeEntries = Array.isArray(recipes)
      ? recipes
      : (Array.isArray(recipeIds) ? recipeIds.map(id => ({ recipeId: id, servingsOverride: null })) : []);

    if (!recipeEntries.length) {
      res.status(400).json({ error: 'Missing or empty "recipes"/"recipeIds"' });
      return;
    }

    try {
      const { data: plan, error: planError } = await supabase
        .from('weekly_plans')
        .insert({
          week_start_date: weekStartDate || new Date().toISOString().slice(0, 10),
          servings_target: servingsTarget,
          status: 'planning'
        })
        .select()
        .single();

      if (planError) throw new Error(planError.message);

      const planRecipeRows = recipeEntries.map(r => ({
        weekly_plan_id: plan.id,
        recipe_id: r.recipeId,
        servings_override: r.servingsOverride || null
      }));
      const { error: recipesError } = await supabase.from('weekly_plan_recipes').insert(planRecipeRows);
      if (recipesError) throw new Error(recipesError.message);

      res.status(200).json(plan);
    } catch (err) {
      console.error('Failed to create batch:', err);
      res.status(500).json({ error: err.message });
    }
    return;
  }

  res.status(405).json({ error: 'Use GET or POST' });
};
