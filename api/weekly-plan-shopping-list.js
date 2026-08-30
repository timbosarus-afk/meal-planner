// Vercel serverless function — consolidated shopping list for ONE batch
// (as opposed to the older /api/shopping-list, which takes ad-hoc
// recipeIds and has no memory of a batch). This version excludes BOTH:
//   - permanent staples (the `staples` table — salt, pepper, etc, never shop for these)
//   - this batch's own "already have" taps (`weekly_plan_exclusions` — resets
//     every batch since it's tied to a specific weekly_plan_id)
// That's the two-tier exclusion: "always have" (permanent) vs "already have
// this batch" (one-off, doesn't carry over).
//
// Each item also gets a rough category (Fruit & Veg, Meat & Fish, etc.) via
// keyword matching, so the list can be grouped/collapsed by section rather
// than shown as one flat alphabetical block. This is a heuristic, same
// spirit as the ingredient-line parser — imperfect at the edges (e.g. plain
// "pepper" defaults to veg since bell peppers are far more common in recipe
// ingredient lists than the ground spice), refine based on real mismatches
// rather than trying to enumerate every case up front.
//
// "usedIn" now prefers each recipe's nickname over its (often long, scraped)
// title, so a shopping list line doesn't end up captioned with an entire
// blog-post title.

const { supabase } = require('../lib/db');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

const CATEGORY_KEYWORDS = [
  ['Herbs & Spices', ['salt', 'black pepper', 'ground pepper', 'peppercorn', 'cumin', 'paprika', 'cinnamon', 'oregano', 'thyme', 'rosemary', 'bay leaf', 'chilli flake', 'chili flake', 'nutmeg', 'cardamom', 'turmeric', 'coriander seed', 'cayenne', 'garam masala', 'mixed spice', 'vanilla extract', 'basil', 'parsley', 'mint', 'dill', 'sage', 'tarragon']],
  ['Meat & Fish', ['chicken', 'beef', 'pork', 'lamb', 'mince', 'bacon', 'sausage', 'turkey', 'fish', 'salmon', 'prawn', 'shrimp', 'cod', 'tuna', 'ham', 'chorizo', 'anchovy', 'steak']],
  ['Dairy & Eggs', ['milk', 'cheese', 'butter', 'cream', 'yogurt', 'yoghurt', 'egg', 'mozzarella', 'parmesan', 'feta', 'mascarpone', 'ricotta', 'buttermilk']],
  ['Bakery', ['bread', 'bun', 'baguette', 'tortilla', 'pitta', 'pita', 'naan', 'bagel', 'croissant', 'brioche']],
  ['Store Cupboard', ['rice', 'pasta', 'flour', 'sugar', 'olive oil', 'vegetable oil', 'sunflower oil', 'vinegar', 'tin ', 'tinned', 'canned', 'stock cube', 'stock pot', 'passata', 'ketchup', 'mustard', 'honey', 'jam', 'cereal', 'oats', 'lentil', 'chickpea', 'noodle', 'soy sauce', 'fish sauce', 'worcestershire', 'breadcrumb', 'cornflour', 'baking powder', 'baking soda', 'yeast']],
  ['Frozen', ['frozen', 'ice cream', 'peas (frozen']],
  ['Fruit & Veg', ['onion', 'garlic', 'tomato', 'potato', 'carrot', 'pepper', 'lettuce', 'spinach', 'cucumber', 'courgette', 'aubergine', 'eggplant', 'mushroom', 'apple', 'banana', 'lemon', 'lime', 'avocado', 'broccoli', 'cauliflower', 'celery', 'ginger', 'chilli', 'chili', 'kale', 'leek', 'sweetcorn', 'corn', 'squash', 'pumpkin', 'beetroot', 'radish', 'spring onion', 'shallot', 'orange', 'berry', 'berries', 'grape', 'pear', 'peach', 'mango', 'pineapple', 'melon']]
];

function categorise(itemName) {
  const lower = itemName.toLowerCase();
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some(k => lower.includes(k))) return category;
  }
  return 'Other';
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Use GET' }); return; }

  const { id: planId } = req.query;
  if (!planId) { res.status(400).json({ error: 'Missing "id" query param' }); return; }

  try {
    const { data: plan, error: planError } = await supabase
      .from('weekly_plans').select('*').eq('id', planId).single();
    if (planError) throw new Error(planError.message);

    const { data: planRecipes, error: prError } = await supabase
      .from('weekly_plan_recipes')
      .select('recipe_id, servings_override, recipes(id, title, nickname, servings)')
      .eq('weekly_plan_id', planId);
    if (prError) throw new Error(prError.message);

    const recipeIds = planRecipes.map(pr => pr.recipe_id);

    const [{ data: ingredients, error: ingError }, { data: staples, error: staplesError }, { data: exclusions, error: exclError }] = await Promise.all([
      supabase.from('recipe_ingredients').select('recipe_id, quantity, unit, item, notes').in('recipe_id', recipeIds.length ? recipeIds : ['00000000-0000-0000-0000-000000000000']),
      supabase.from('staples').select('item_name'),
      supabase.from('weekly_plan_exclusions').select('item_name').eq('weekly_plan_id', planId)
    ]);
    if (ingError) throw new Error(ingError.message);
    if (staplesError) throw new Error(staplesError.message);
    if (exclError) throw new Error(exclError.message);

    const stapleNames = staples.map(s => s.item_name.toLowerCase());
    const excludedThisWeek = new Set(exclusions.map(e => e.item_name.toLowerCase()));

    const isStaple = (itemName) => {
      const lower = itemName.toLowerCase();
      return stapleNames.some(s => lower.includes(s) || s.includes(lower));
    };

    const recipeById = Object.fromEntries(planRecipes.map(pr => [pr.recipe_id, { ...pr.recipes, servingsOverride: pr.servings_override }]));
    const displayName = (recipe) => (recipe?.nickname && recipe.nickname.trim()) ? recipe.nickname : (recipe?.title || 'Unknown recipe');

    const consolidated = {};
    const excludedAsStaples = new Set();
    const excludedAsAlreadyHave = new Set();

    for (const ing of ingredients) {
      const recipe = recipeById[ing.recipe_id];
      const targetServings = recipe?.servingsOverride || plan.servings_target;
      const scale = recipe?.servings ? targetServings / recipe.servings : 1;

      if (isStaple(ing.item)) { excludedAsStaples.add(ing.item); continue; }
      if (excludedThisWeek.has(ing.item.toLowerCase())) { excludedAsAlreadyHave.add(ing.item); continue; }

      const scaledQuantity = ing.quantity !== null ? Math.round(ing.quantity * scale * 100) / 100 : null;
      const key = `${ing.item.toLowerCase()}|${ing.unit || ''}`;

      if (!consolidated[key]) {
        consolidated[key] = { item: ing.item, unit: ing.unit, quantity: 0, hasQuantity: false, sourceRecipes: new Set() };
      }
      if (scaledQuantity !== null) {
        consolidated[key].quantity += scaledQuantity;
        consolidated[key].hasQuantity = true;
      }
      consolidated[key].sourceRecipes.add(displayName(recipe));
    }

    const shoppingList = Object.values(consolidated)
      .map(entry => ({
        item: entry.item,
        unit: entry.unit,
        quantity: entry.hasQuantity ? Math.round(entry.quantity * 100) / 100 : null,
        usedIn: [...entry.sourceRecipes],
        category: categorise(entry.item)
      }))
      .sort((a, b) => a.category.localeCompare(b.category) || a.item.localeCompare(b.item));

    res.status(200).json({
      planId,
      servingsTarget: plan.servings_target,
      status: plan.status,
      recipeCount: planRecipes.length,
      shoppingList,
      excludedAsStaples: [...excludedAsStaples],
      excludedAsAlreadyHave: [...excludedAsAlreadyHave]
    });
  } catch (err) {
    console.error('Failed to build plan shopping list:', err);
    res.status(500).json({ error: err.message });
  }
};
