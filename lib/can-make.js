// "What can I make": compares every saved recipe against the pantry.
//   now  - every core ingredient is in the house (optional/swappable may be missing)
//   one  - exactly one core ingredient missing
//   two  - exactly two core ingredients missing
// Also handles tapping an ingredient's role (core/optional/swappable).
const { supabase } = require('./db');
const { ingredientKey } = require('./ingredient-key');

const ASSUMED = ['water', 'salt', 'pepper', 'salt and pepper', 'black pepper', 'ice'];
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function canMake() {
  const [{ data: recipes, error: e1 }, { data: ings, error: e2 }, { data: pantry, error: e3 }] = await Promise.all([
    supabase.from('recipes').select('id, title, nickname, image_url, servings'),
    supabase.from('recipe_ingredients').select('id, recipe_id, item, notes, role, position').order('position'),
    supabase.from('pantry_items').select('ingredient_key, item_name, quantity, unit')
  ]);
  if (e1 || e2 || e3) throw new Error((e1 || e2 || e3).message);

  const keys = [...new Set([...pantry.map(p => p.ingredient_key), ...ASSUMED])].filter(Boolean);
  const res = keys.map(k => new RegExp(`(^|[^a-z])${esc(k)}([^a-z]|$)`));
  const have = key => keys.includes(key) || res.some(re => re.test(key));

  const out = recipes.map(r => {
    const mine = ings.filter(i => i.recipe_id === r.id);
    const missingCore = [], missingOther = [];
    let haveCount = 0;
    for (const i of mine) {
      const ok = have(ingredientKey(i.item));
      if (ok) { haveCount++; continue; }
      const entry = { id: i.id, item: i.item, role: i.role || 'core' };
      (entry.role === 'core' ? missingCore : missingOther).push(entry);
    }
    const tier = missingCore.length === 0 ? 'now' : missingCore.length === 1 ? 'one' : missingCore.length === 2 ? 'two' : 'far';
    return { id: r.id, title: r.nickname || r.title, image_url: r.image_url, tier, haveCount, total: mine.length, missingCore, missingOther };
  });
  const order = { now: 0, one: 1, two: 2, far: 3 };
  out.sort((a, b) => order[a.tier] - order[b.tier] || b.haveCount - a.haveCount);
  return { results: out.filter(r => r.tier !== 'far'), pantryCount: pantry.length, recipeCount: recipes.length };
}

async function setRole(ingredientId, role) {
  if (!['core', 'optional', 'swappable'].includes(role)) throw new Error('Bad role');
  const { data, error } = await supabase.from('recipe_ingredients').update({ role }).eq('id', ingredientId).select('id, role').single();
  if (error) throw new Error(error.message);
  return data;
}

module.exports = { canMake, setRole };
