// Vercel serverless function — detail + status updates for one batch
// (internally still called a "weekly plan" in the schema/table names, but
// the UI now calls these "batches" since they're not tied to a calendar
// week — could be several a week, or span more than one).
// GET ?id=<planId> returns the batch plus its recipes (with ingredients and
// cooking steps) — this is what powers the "what am I cooking, how do I
// make it" view once a batch has been marked ordered, and the "what's in
// this batch" view while it's still being built up.
// PATCH ?id=<planId> with { status: 'ordered' } marks it ordered.
// POST ?id=<planId> with { recipeId, servingsOverride } adds a recipe to
// the batch, OR updates its servings if it's already in the batch (see
// upsert below — the per-recipe servings stepper on the batch detail
// screen calls this same endpoint).
// DELETE ?id=<planId> with { recipeId } removes a recipe from a batch. The
// caller (frontend) is responsible for warning the user first if the batch
// is already 'ordered' — this endpoint just performs the removal.

const { supabase } = require('../lib/db');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
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
        .select('recipe_id, servings_override, recipes(id, title, nickname, servings, source_url, steps, cook_time_minutes, image_url)')
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

  if (req.method === 'POST') {
    const { recipeId, servingsOverride } = req.body || {};
    if (!recipeId) { res.status(400).json({ error: 'Missing "recipeId" in request body' }); return; }

    // Upsert rather than plain insert: this endpoint doubles as "add a
    // recipe to the batch" (new row) and "update this recipe's servings
    // within the batch" (existing row) — the per-recipe servings stepper
    // on the batch detail screen calls this same endpoint for a recipe
    // that's already present, and needs the servings_override to actually
    // update rather than silently no-op on the unique constraint.
    const { data, error } = await supabase
      .from('weekly_plan_recipes')
      .upsert(
        { weekly_plan_id: id, recipe_id: recipeId, servings_override: servingsOverride || null },
        { onConflict: 'weekly_plan_id,recipe_id' }
      )
      .select()
      .single();

    if (error) { res.status(500).json({ error: error.message }); return; }
    res.status(200).json(data);
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

  if (req.method === 'DELETE') {
    const { recipeId } = req.body || {};
    if (!recipeId) { res.status(400).json({ error: 'Missing "recipeId" in request body' }); return; }

    const { error } = await supabase
      .from('weekly_plan_recipes')
      .delete()
      .eq('weekly_plan_id', id)
      .eq('recipe_id', recipeId);

    if (error) { res.status(500).json({ error: error.message }); return; }
    res.status(200).json({ removed: recipeId });
    return;
  }

  res.status(405).json({ error: 'Use GET, POST, PATCH, or DELETE' });
};
