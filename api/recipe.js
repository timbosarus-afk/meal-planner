// Vercel serverless function — GET ?id=<recipeId> returns full recipe
// detail: ingredients, steps, image, timings. Powers the Recipes tab's
// detail view, including live portion scaling (done client-side using
// the original `servings` value returned here).
// PATCH ?id=<recipeId> with { nickname } and/or { imageUrl } updates the
// short display name and/or the photo — imageUrl is set after a direct
// upload to Supabase Storage (see the recipe-images bucket) rather than
// a scraped URL, so you can attach your own photo to a manually-imported
// or pasted recipe.

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

  res.status(405).json({ error: 'Use GET or PATCH' });
};
