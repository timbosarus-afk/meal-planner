// Vercel serverless function — GET list of all saved recipes.
// Returns lightweight summaries (image_url for the Recipes tab gallery,
// nickname for shorter display names) plus a rough cost per recipe at its own
// servings ({ total, perServing, notPriced }) — use GET /api/recipe?id=...
// for full detail with ingredients/steps.

const { supabase } = require('../lib/db');
const reparseIngredients = require('../lib/reparse-ingredients');
const { canMake, setRole } = require('../lib/can-make');
const { alwaysMatcher, recipeCost, groupLinks } = require('../lib/costs');

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
    .select('id, title, nickname, source_url, servings, prep_time_minutes, cook_time_minutes, image_url, created_at, rating, cuisine, tags, last_cooked, source')
    .order('created_at', { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  // Cost per recipe ("what it uses"), same maths as the recipe page. If this
  // part fails the list still loads, just without prices.
  try {
    const [ings, links, always] = await Promise.all([
      supabase.from('recipe_ingredients').select('recipe_id, quantity, unit, item'),
      supabase.from('product_links').select('ingredient_key, pack_size, pack_unit, price, nectar_price'),
      supabase.from('pantry_items').select('item_name').eq('kind', 'always')
    ]);
    for (const r of [ings, links, always]) if (r.error) throw new Error(r.error.message);
    const linksByKey = groupLinks(links.data);
    const isAlways = alwaysMatcher(always.data.map(a => a.item_name));
    const byRecipe = {};
    for (const i of ings.data) (byRecipe[i.recipe_id] ||= []).push(i);
    for (const r of data) {
      const c = recipeCost({ ingredients: byRecipe[r.id] || [], linksByKey, isAlways, baseServings: r.servings, targetServings: r.servings });
      r.cost = { total: c.total, perServing: c.perServing, servings: c.servings, notPriced: c.notPriced };
    }
  } catch (err) {
    console.error('recipe costs failed:', err.message);
  }

  res.status(200).json(data);
};
