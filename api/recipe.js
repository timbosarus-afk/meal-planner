// Vercel serverless function — GET ?id=<recipeId> returns full recipe
// detail: ingredients, steps, image, timings. Powers the Recipes tab's
// detail view, including live portion scaling (done client-side using
// the original `servings` value returned here).
// PATCH ?id=<recipeId> with { nickname, imageUrl, rating, ratingNotes, lastCooked } updates the
// short display name and/or the photo — imageUrl is set after a direct
// upload to Supabase Storage (see the recipe-images bucket) rather than
// a scraped URL, so you can attach your own photo to a manually-imported
// or pasted recipe.
// DELETE ?id=<recipeId> removes the recipe entirely — also removes it from
// any batches it's currently sitting in (the frontend is responsible for
// warning about this before calling, since it's the same recipe row either
// way and there's no separate "in use" check needed here).

const { supabase } = require('../lib/db');
const { alwaysMatcher, recipeCost, groupLinks } = require('../lib/costs');

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
        .select('id, quantity, unit, item, notes, position, role')
        .eq('recipe_id', id)
        .order('position');
      if (ingError) throw new Error(ingError.message);

      // Cost at the recipe's own servings (the app scales the total with its
      // servings stepper; per serving doesn't change). Each ingredient also
      // gets linked / alwaysHave flags for the "Not linked yet" list.
      const [{ data: links }, { data: always }] = await Promise.all([
        supabase.from('product_links').select('ingredient_key, pack_size, pack_unit, price, nectar_price'),
        supabase.from('pantry_items').select('item_name').eq('kind', 'always')
      ]);
      const c = recipeCost({
        ingredients,
        linksByKey: groupLinks(links),
        isAlways: alwaysMatcher((always || []).map(a => a.item_name)),
        baseServings: recipe.servings, targetServings: recipe.servings
      });
      const withFlags = ingredients.map((i, k) => ({ ...i, ingredientKey: c.lines[k].key, linked: c.lines[k].linked, alwaysHave: c.lines[k].alwaysHave, cost: c.lines[k].cost }));
      res.status(200).json({ ...recipe, ingredients: withFlags, cost: { total: c.total, perServing: c.perServing, servings: c.servings, notPriced: c.notPriced, full: c.full } });
    } catch (err) {
      console.error('Failed to load recipe detail:', err);
      res.status(500).json({ error: err.message });
    }
    return;
  }

  if (req.method === 'PATCH') {
    const { nickname, imageUrl, rating, ratingNotes, lastCooked } = req.body || {};
    const updates = {};
    if (nickname !== undefined) updates.nickname = nickname ? nickname.trim() : null;
    if (imageUrl !== undefined) updates.image_url = imageUrl;
    if (rating !== undefined) {
      const r = rating === null ? null : Math.round(Number(rating));
      if (r !== null && !(r >= 1 && r <= 5)) { res.status(400).json({ error: 'rating must be 1-5 or null' }); return; }
      updates.rating = r;
    }
    if (ratingNotes !== undefined) updates.rating_notes = ratingNotes ? String(ratingNotes).trim() : null;
    if (lastCooked !== undefined) updates.last_cooked = lastCooked || null; // 'YYYY-MM-DD'
    if (!Object.keys(updates).length) { res.status(400).json({ error: 'Nothing to update' }); return; }

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
