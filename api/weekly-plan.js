// Vercel serverless function — detail + status updates for one weekly plan.
// GET ?id=<planId> returns the plan plus its recipes (with ingredients and
// cooking steps) — this is what powers the "what am I cooking, how do I
// make it" view once a plan has been marked ordered.
// PATCH ?id=<planId> with { status: 'ordered' } marks it ordered.

const { supabase } = require('../lib/db');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { id } = req.query;
  if (!id) { res.status(400).json({ error: 'Missing "id" query param' }); return; }

  if (req.method === 'GET') {
    try {
      const { data: plan, error: planError } = await supabase
        .from('weekly_plans').select('*').eq('id', id).single();
      if (planError) throw new Error(planError.message);

      const { data: planRecipes, error: prError } = await supabase
        .from('weekly_plan_recipes')
        .select('recipe_id, servings_override, recipes(id, title, servings, source_url, steps, cook_time_minutes)')
        .eq('weekly_plan_id', id);
      if (prError) throw new Error(prError.message);

      const recipeIds = planRecipes.map(pr => pr.recipe_id);
      const { data: ingredients, error: ingError } = await supabase
        .from('recipe_ingredients')
        .select('recipe_id, quantity, unit, item, notes')
        .in('recipe_id', recipeIds.length ? recipeIds : ['00000000-0000-0000-0000-000000000000']);
      if (ingError) throw new Error(ingError.message);

      const recipes = planRecipes.map(pr => ({
        ...pr.recipes,
        servingsOverride: pr.servings_override,
        ingredients: ingredients.filter(i => i.recipe_id === pr.recipe_id)
      }));

      res.status(200).json({ ...plan, recipes });
    } catch (err) {
      console.error('Failed to load plan:', err);
      res.status(500).json({ error: err.message });
    }
    return;
  }

  if (req.method === 'PATCH') {
    const { status } = req.body || {};
    if (!status) { res.status(400).json({ error: 'Missing "status" in request body' }); return; }

    const { data, error } = await supabase
      .from('weekly_plans').update({ status }).eq('id', id).select().single();

    if (error) { res.status(500).json({ error: error.message }); return; }
    res.status(200).json(data);
    return;
  }

  res.status(405).json({ error: 'Use GET or PATCH' });
};
