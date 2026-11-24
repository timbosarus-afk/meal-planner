// Vercel serverless function — ingredients queued for product linking.
// GET                                   -> queue, oldest first
// GET ?all=1                            -> every unlinked ingredient across ALL
//                                          recipes (always-have pantry items left
//                                          out), most-used first, for bulk linking
// GET ?sizes=1                          -> linked ingredients where even the smallest
//                                          linked pack is well over what any recipe
//                                          needs (e.g. 1kg cream for 200ml) - worth
//                                          linking a smaller size too
// POST { ingredientName | ingredientKey }      -> add one (already queued is fine)
// POST { items: [ingredientName, ...] }        -> add several
// DELETE { ingredientKey | ingredientName | id } -> remove one (e.g. once linked)
// Keys are normalised with lib/ingredient-key.js, same as product_links.

const { supabase } = require('../lib/db');
const { ingredientKey, toBase } = require('../lib/ingredient-key');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

// Things nobody buys
const NEVER_BUY = new Set(['water', 'boiling water', 'cold water', 'warm water', 'hot water', 'ice', 'salt and pepper']);

async function allUnlinked() {
  const [ings, links, pantry, recipes, queue] = await Promise.all([
    supabase.from('recipe_ingredients').select('recipe_id, item'),
    supabase.from('product_links').select('ingredient_key'),
    supabase.from('pantry_items').select('ingredient_key, kind'),
    supabase.from('recipes').select('id, title, nickname'),
    supabase.from('link_queue').select('ingredient_key')
  ]);
  for (const r of [ings, links, pantry, recipes, queue]) if (r.error) throw new Error(r.error.message);

  const linked = new Set(links.data.map(l => l.ingredient_key));
  // Always-have keys also match as a whole word ("salt" covers "sea salt"),
  // same rule as the shopping list
  const always = pantry.data.filter(p => p.kind === 'always').map(p => p.ingredient_key).filter(Boolean);
  const esc = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const alwaysRes = always.map(k => new RegExp(`(^|[^a-z])${esc(k)}([^a-z]|$)`));
  const isAlways = key => alwaysRes.some(re => re.test(key));
  const queued = new Set(queue.data.map(q => q.ingredient_key));
  const nameOf = Object.fromEntries(recipes.data.map(r => [r.id, (r.nickname && r.nickname.trim()) || r.title]));

  const byKey = {};
  for (const ing of ings.data) {
    const key = ingredientKey(ing.item);
    if (!key || linked.has(key) || NEVER_BUY.has(key) || isAlways(key)) continue;
    const e = (byKey[key] ||= { ingredientKey: key, items: new Set(), recipes: new Set() });
    e.items.add(ing.item);
    if (nameOf[ing.recipe_id]) e.recipes.add(nameOf[ing.recipe_id]);
  }
  return Object.values(byKey)
    .map(e => ({ ingredientKey: e.ingredientKey, items: [...e.items], recipes: [...e.recipes].sort(), queued: queued.has(e.ingredientKey) }))
    .sort((a, b) => (b.queued - a.queued) || (b.recipes.length - a.recipes.length) || a.ingredientKey.localeCompare(b.ingredientKey));
}

// Keeps for ages, so a big pack isn't waste
const KEEPS = /\b(rice|pasta|penne|spaghetti|linguine|rigatoni|fusilli|tagliatelle|noodle|couscous|flour|sugar|oil|sauce|vinegar|stock|lentil|oat|breadcrumb|panko|frozen|bean|chickpea|tin|tinned|chopped tomato|tomato puree|passata|dal|honey|salt)\b/;
const HOUSEHOLD_SERVINGS = 3; // 2 adults + toddler

async function needsSmallerSize() {
  const [ings, links, recipes] = await Promise.all([
    supabase.from('recipe_ingredients').select('recipe_id, item, quantity, unit'),
    supabase.from('product_links').select('ingredient_key, pack_size, pack_unit, product_name'),
    supabase.from('recipes').select('id, title, nickname, servings')
  ]);
  for (const r of [ings, links, recipes]) if (r.error) throw new Error(r.error.message);

  const linksByKey = {};
  for (const l of links.data) (linksByKey[l.ingredient_key] ||= []).push(l);
  const recipeById = Object.fromEntries(recipes.data.map(r => [r.id, r]));

  // Biggest single-recipe need per ingredient and unit, at household servings
  const need = {};
  for (const ing of ings.data) {
    const key = ingredientKey(ing.item);
    if (!key || !linksByKey[key] || KEEPS.test(key)) continue;
    const r = recipeById[ing.recipe_id];
    const scale = r?.servings ? HOUSEHOLD_SERVINGS / r.servings : 1;
    const base = ing.quantity == null ? null : toBase(Number(ing.quantity) * scale, ing.unit);
    if (!base || (base.unit !== 'g' && base.unit !== 'ml')) continue;
    const e = (need[key] ||= {});
    const u = (e[base.unit] ||= { amount: 0, recipes: new Set() });
    u.amount = Math.max(u.amount, base.amount);
    if (r) u.recipes.add((r.nickname && r.nickname.trim()) || r.title);
  }

  const out = [];
  for (const [key, units] of Object.entries(need)) {
    for (const [unit, n] of Object.entries(units)) {
      const sizes = linksByKey[key].filter(l => (l.pack_unit || '').toLowerCase() === unit && Number(l.pack_size) > 0);
      if (!sizes.length) continue;
      const smallest = sizes.sort((a, b) => a.pack_size - b.pack_size)[0];
      const size = Number(smallest.pack_size);
      // Worth it when the smallest pack is at least double the biggest need
      // and you'd have a decent amount left over
      if (size >= 2 * n.amount && size - n.amount >= 150) {
        out.push({
          ingredientKey: key,
          recipes: [...n.recipes].sort(),
          need: { amount: Math.round(n.amount), unit },
          smallest: { size, unit, name: smallest.product_name },
          ratio: Math.round(size / n.amount * 10) / 10
        });
      }
    }
  }
  return out.sort((a, b) => b.ratio - a.ratio);
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  try {
    if (req.method === 'GET' && req.query.sizes) {
      return res.status(200).json(await needsSmallerSize());
    }

    if (req.method === 'GET' && req.query.all) {
      return res.status(200).json(await allUnlinked());
    }

    if (req.method === 'GET') {
      const { data, error } = await supabase.from('link_queue').select('*').order('created_at');
      if (error) throw new Error(error.message);
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const names = Array.isArray(body.items) ? body.items : [body.ingredientKey || body.ingredientName];
      const keys = [...new Set(names.map(n => ingredientKey(n)).filter(Boolean))];
      if (!keys.length) return res.status(400).json({ error: 'Send "ingredientName", "ingredientKey" or "items"' });
      const { data, error } = await supabase.from('link_queue')
        .upsert(keys.map(k => ({ ingredient_key: k })), { onConflict: 'ingredient_key', ignoreDuplicates: true })
        .select();
      if (error) throw new Error(error.message);
      return res.status(200).json({ queued: keys, added: (data || []).length });
    }

    if (req.method === 'DELETE') {
      const { id, ingredientKey: k, ingredientName } = req.body || {};
      let q = supabase.from('link_queue').delete();
      if (id) q = q.eq('id', id);
      else if (k || ingredientName) q = q.eq('ingredient_key', ingredientKey(k || ingredientName));
      else return res.status(400).json({ error: 'Send "ingredientKey", "ingredientName" or "id"' });
      const { data, error } = await q.select();
      if (error) throw new Error(error.message);
      return res.status(200).json({ deleted: (data || []).length });
    }

    res.status(405).json({ error: 'Use GET, POST or DELETE' });
  } catch (err) {
    console.error('link-queue failed:', err);
    res.status(500).json({ error: err.message });
  }
};
