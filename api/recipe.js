// Vercel serverless function — GET ?id=<recipeId> returns full recipe
// detail: ingredients, steps, image, timings. Powers the Recipes tab's
// detail view, including live portion scaling (done client-side using
// the original `servings` value returned here).
// PATCH ?id=<recipeId> with { nickname } and/or { imageUrl } updates the
// short display name and/or the photo — imageUrl is set after a direct
// upload to Supabase Storage (see the recipe-images bucket) rather than
// a scraped URL, so you can attach your own photo to a manually-imported
// or pasted recipe.
// DELETE ?id=<recipeId> removes the recipe entirely — also removes it from
// any batches it's currently sitting in (the frontend is responsible for
// warning about this before calling, since it's the same recipe row either
// way and there's no separate "in use" check needed here).

const { supabase } = require('../lib/db');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, OPTIONS');
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
      const { data: recipe, error: recipeError } = await supabase
        .from('recipes').select('*').eq('id', id).single();
      if (recipeError) throw new Error(recipeError.message);

      const { data: ingredients, error: ingError } = await supabase
        .from('recipe_ingredients')
        .select('id, quantity, unit, item, notes, position')
        .eq('recipe_id', id)
        .order('position');
      if (ingError) throw new Error(ingError.message);

      res.status(200).json({ ...recipe, ingredients });
    } catch (err) {
      console.error('Failed to load recipe detail:', err);
      res.status(500).json({ error: err.message });
    }
    return;
  }

  if (req.method === 'PATCH') {
    const { nickname, imageUrl } = req.body || {};
    const updates = {};
    if (nickname !== undefined) updates.nickname = nickname ? nickname.trim() : null;
    if (imageUrl !== undefined) updates.image_url = imageUrl;

    const { data, error } = await supabase
      .from('recipes')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) { res.status(500).json({ error: error.message }); return; }
    res.status(200).json(data);
    return;
  }

  if (req.method === 'DELETE') {
    try {
      // Remove from any batches first (FK would otherwise block deleting
      // the recipe while it's still referenced), then its ingredients,
      // then the recipe itself.
      await supabase.from('weekly_plan_recipes').delete().eq('recipe_id', id);
      await supabase.from('recipe_ingredients').delete().eq('recipe_id', id);
      const { error } = await supabase.from('recipes').delete().eq('id', id);
      if (error) throw new Error(error.message);

      res.status(200).json({ deleted: id });
    } catch (err) {
      console.error('Failed to delete recipe:', err);
      res.status(500).json({ error: err.message });
    }
    return;
  }

  res.status(405).json({ error: 'Use GET, PATCH, or DELETE' });
};
