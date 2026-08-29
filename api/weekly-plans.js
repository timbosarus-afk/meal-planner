// Vercel serverless function — the weekly plan itself (not just an ad-hoc
// shopping list). GET lists all plans (most recent first). POST creates a
// new plan: { recipeIds, servingsTarget } — status starts as 'planning'.

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
    const { recipeIds, servingsTarget = 2, weekStartDate } = req.body || {};

    if (!Array.isArray(recipeIds) || recipeIds.length === 0) {
      res.status(400).json({ error: 'Missing or empty "recipeIds" array' });
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

      const planRecipeRows = recipeIds.map(recipeId => ({ weekly_plan_id: plan.id, recipe_id: recipeId }));
      const { error: recipesError } = await supabase.from('weekly_plan_recipes').insert(planRecipeRows);
      if (recipesError) throw new Error(recipesError.message);

      res.status(200).json(plan);
    } catch (err) {
      console.error('Failed to create weekly plan:', err);
      res.status(500).json({ error: err.message });
    }
    return;
  }

  res.status(405).json({ error: 'Use GET or POST' });
};
