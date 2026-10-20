// Vercel serverless function — consolidated shopping list for ONE batch
// (as opposed to the older /api/shopping-list, which takes ad-hoc
// recipeIds and has no memory of a batch).
//
// Two-tier exclusion, but they now behave differently on purpose:
//   - permanent staples (the `staples` table) are pulled OUT of the main
//     list entirely and returned as their own `staples` array, so they're
//     still visible as a reminder ("you may not actually have this one
//     this week") instead of silently vanishing.
//   - this batch's own "already have" taps (`weekly_plan_exclusions`) no
//     longer remove the item from the list at all — the item stays in its
//     category with a `gotIt: true` flag, so ticking it is a visible
//     checkmark in place rather than the item disappearing/moving.
//
// Each item also gets a rough category (Fruit & Veg, Meat & Fish, etc.) via
// keyword matching, so the list can be grouped/collapsed by section rather
// than shown as one flat alphabetical block. This is a heuristic, same
// spirit as the ingredient-line parser — imperfect at the edges (e.g. plain
// "pepper" defaults to veg since bell peppers are far more common in recipe
// ingredient lists than the ground spice), refine based on real mismatches
// rather than trying to enumerate every case up front.
//
// "usedIn" prefers each recipe's nickname over its (often long, scraped)
// title, so a shopping list line doesn't end up captioned with an entire
// blog-post title.
//
// Product links (Oct 2026): every item now carries a normalised
// `ingredientKey`. Items whose key has a row in `product_links` are grouped
// into a `basket` array (one entry per linked ingredient, with the number of
// packs to add, summed across every line that maps to it before rounding up).
// Items still needing a link come back in `unlinked`. "Got it" items are left
// out of both — you already have them.

const { supabase } = require('../lib/db');
const { ingredientKey, packsNeeded } = require('../lib/ingredient-key');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

const CATEGORY_KEYWORDS = [
  ['Herbs & Spices', ['salt', 'black pepper', 'ground pepper', 'peppercorn', 'cumin', 'paprika', 'cinnamon', 'oregano', 'thyme', 'rosemary', 'bay leaf', 'chilli flake', 'chili flake', 'nutmeg', 'cardamom', 'turmeric', 'coriander seed', 'cayenne', 'garam masala', 'mixed spice', 'vanilla extract', 'basil', 'parsley', 'mint', 'dill', 'sage', 'tarragon', 'allspice', 'italian herb', 'mixed herb', 'herbes de provence', 'chilli powder', 'chili powder', 'curry powder', 'five spice', 'za\'atar', 'sumac', 'fennel seed', 'mustard seed', 'clove (ground)', 'ground ginger', 'coriander', 'chives']],
  ['Meat & Fish', ['chicken', 'beef', 'pork', 'lamb', 'mince', 'bacon', 'sausage', 'turkey', 'fish', 'salmon', 'prawn', 'shrimp', 'cod', 'tuna', 'ham', 'chorizo', 'anchovy', 'steak']],
  ['Dairy & Eggs', ['milk', 'cheese', 'butter', 'cream', 'yogurt', 'yoghurt', 'egg', 'mozzarella', 'parmesan', 'feta', 'mascarpone', 'ricotta', 'buttermilk']],
  ['Bakery', ['bread', 'bun', 'baguette', 'tortilla', 'pitta', 'pita', 'naan', 'bagel', 'croissant', 'brioche']],
  ['Store Cupboard', ['chopped tomato', 'tomato purée', 'tomato puree', 'pasta sauce', 'coconut milk', 'wine', 'linguine', 'spaghetti', 'penne', 'fusilli', 'tagliatelle', 'lasagne', 'lasagna', 'macaroni', 'orzo', 'couscous', 'stock', 'gravy', 'pesto', 'curry paste', 'harissa', 'sriracha', 'mayonnaise', 'tahini', 'peanut butter', 'beans', 'rice', 'pasta', 'flour', 'sugar', 'olive oil', 'vegetable oil', 'sunflower oil', 'vinegar', 'tin ', 'tinned', 'canned', 'stock cube', 'stock pot', 'passata', 'ketchup', 'mustard', 'honey', 'jam', 'cereal', 'oats', 'lentil', 'chickpea', 'noodle', 'soy sauce', 'fish sauce', 'worcestershire', 'breadcrumb', 'cornflour', 'baking powder', 'baking soda', 'yeast']],
  ['Frozen', ['frozen', 'ice cream', 'peas (frozen']],
  ['Fruit & Veg', ['onion', 'garlic', 'tomato', 'potato', 'carrot', 'pepper', 'lettuce', 'spinach', 'cucumber', 'courgette', 'aubergine', 'eggplant', 'mushroom', 'apple', 'banana', 'lemon', 'lime', 'avocado', 'broccoli', 'cauliflower', 'celery', 'ginger', 'chilli', 'chili', 'kale', 'leek', 'sweetcorn', 'corn', 'squash', 'pumpkin', 'beetroot', 'radish', 'spring onion', 'shallot', 'orange', 'berry', 'berries', 'grape', 'pear', 'peach', 'mango', 'pineapple', 'melon']]
];

// You can't buy 0.4 of an egg: count units round up (with a little
// tolerance so 2.02 cloves stays 2), weights/volumes round to whole g/ml.
function roundForShopping(q, unit) {
  if (unit === 'g' || unit === 'ml') return Math.max(1, Math.round(q));
  return Math.max(1, Math.ceil(q - 0.05));
}

// Keywords must start a word: "salt" matches "sea salt" but not "unsalted"
const startsWord = (text, k) => text === k || text.startsWith(k) || text.includes(' ' + k) || text.includes('/' + k);

function categorise(itemName) {
  const lower = itemName.toLowerCase();
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some(k => startsWord(lower, k.trim()))) return category;
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

    const [
      { data: ingredients, error: ingError },
      { data: staples, error: staplesError },
      { data: exclusions, error: exclError },
      { data: links, error: linksError }
    ] = await Promise.all([
      supabase.from('recipe_ingredients').select('recipe_id, quantity, unit, item, notes').in('recipe_id', recipeIds.length ? recipeIds : ['00000000-0000-0000-0000-000000000000']),
      supabase.from('staples').select('item_name'),
      supabase.from('weekly_plan_exclusions').select('item_name').eq('weekly_plan_id', planId),
      supabase.from('product_links').select('*')
    ]);
    if (ingError) throw new Error(ingError.message);
    if (staplesError) throw new Error(staplesError.message);
    if (exclError) throw new Error(exclError.message);
    // Don't fail the whole list if the links table is missing/unreachable —
    // the list still works, it just won't have basket data.
    if (linksError) console.error('product_links lookup failed:', linksError.message);

    const linkByKey = Object.fromEntries((links || []).map(l => [l.ingredient_key, l]));

    const stapleNames = staples.map(s => s.item_name.toLowerCase());
    const excludedThisWeek = new Set(exclusions.map(e => e.item_name.toLowerCase()));

    // Staples match on the normalised ingredient key, so "tomato purée
    // (paste)" covers "tomato purée" and "lasagna sheets" covers "lasagne
    // sheets". A staple key also matches as a whole word inside a longer
    // item ("salt" covers "salt and pepper") but never mid-word ("salt"
    // must not catch "unsalted butter").
    const escapeRe = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const stapleKeys = [...new Set(stapleNames.map(n => ingredientKey(n)).filter(Boolean))];
    const stapleRes = stapleKeys.map(k => new RegExp(`(^|[^a-z])${escapeRe(k)}([^a-z]|$)`));
    const isStaple = (itemName) => {
      const key = ingredientKey(itemName);
      return stapleKeys.includes(key) || stapleRes.some(re => re.test(key));
    };

    const recipeById = Object.fromEntries(planRecipes.map(pr => [pr.recipe_id, { ...pr.recipes, servingsOverride: pr.servings_override }]));
    const displayName = (recipe) => (recipe?.nickname && recipe.nickname.trim()) ? recipe.nickname : (recipe?.title || 'Unknown recipe');

    const consolidated = {};
    const stapleItems = new Set();

    for (const ing of ingredients) {
      const recipe = recipeById[ing.recipe_id];
      const targetServings = recipe?.servingsOverride || plan.servings_target;
      const scale = recipe?.servings ? targetServings / recipe.servings : 1;

      // Staples are pulled out entirely — they get their own section below,
      // not folded into the main shopping math.
      if (isStaple(ing.item)) { stapleItems.add(ing.item); continue; }

      // "Got it" no longer excludes — the item stays in the normal
      // consolidated list (still summed/scaled), just flagged so the
      // frontend can show it ticked in place.
      const scaledQuantity = ing.quantity !== null ? Math.round(ing.quantity * scale * 100) / 100 : null;
      // Consolidate on the normalised ingredient key + unit, so "garlic" (2
      // cloves) and "garlic cloves" (3) become one line of 5 cloves.
      const iKey = ingredientKey(ing.item) || ing.item.toLowerCase();
      const key = `${iKey}|${ing.unit || ''}`;

      if (!consolidated[key]) {
        consolidated[key] = { item: ing.item, unit: ing.unit, quantity: 0, hasQuantity: false, sourceRecipes: new Set(), names: new Set(), iKey };
      }
      // Show the shortest name seen ("garlic" over "garlic cloves")
      if (ing.item.length < consolidated[key].item.length) consolidated[key].item = ing.item;
      consolidated[key].names.add(ing.item.toLowerCase());
      if (scaledQuantity !== null) {
        consolidated[key].quantity += scaledQuantity;
        consolidated[key].hasQuantity = true;
      }
      consolidated[key].sourceRecipes.add(displayName(recipe));
    }

    const shoppingList = Object.values(consolidated)
      .map(entry => {
        const iKey = entry.iKey;
        return {
          item: entry.item,
          unit: entry.unit,
          quantity: entry.hasQuantity ? roundForShopping(entry.quantity, entry.unit) : null,
          usedIn: [...entry.sourceRecipes],
          category: categorise(entry.item),
          gotIt: excludedThisWeek.has(entry.item.toLowerCase()) || [...entry.names].some(n => excludedThisWeek.has(n)),
          ingredientKey: iKey,
          linked: !!linkByKey[iKey]
        };
      })
      .sort((a, b) => a.category.localeCompare(b.category) || a.item.localeCompare(b.item));

    // Group still-needed items by ingredient key: linked keys become basket
    // entries (packs summed across all matching lines), the rest are unlinked.
    const byKey = {};
    for (const it of shoppingList) {
      if (it.gotIt || !it.ingredientKey) continue;
      (byKey[it.ingredientKey] ||= []).push(it);
    }

    const basket = [];
    const unlinked = [];
    for (const [iKey, items] of Object.entries(byKey)) {
      const link = linkByKey[iKey];
      if (link) {
        basket.push({
          linkId: link.id,
          ingredientKey: iKey,
          productUrl: link.product_url,
          productSlug: link.product_slug,
          productName: link.product_name,
          packSize: link.pack_size,
          packUnit: link.pack_unit,
          packs: packsNeeded(items.map(i => ({ quantity: i.quantity, unit: i.unit })), link),
          items: items.map(i => i.item)
        });
      } else {
        unlinked.push({ ingredientKey: iKey, items: items.map(i => i.item) });
      }
    }
    basket.sort((a, b) => a.ingredientKey.localeCompare(b.ingredientKey));
    unlinked.sort((a, b) => a.ingredientKey.localeCompare(b.ingredientKey));

    res.status(200).json({
      planId,
      servingsTarget: plan.servings_target,
      status: plan.status,
      recipeCount: planRecipes.length,
      shoppingList,
      staples: [...stapleItems].sort(),
      basket,
      unlinked
    });
  } catch (err) {
    console.error('Failed to build plan shopping list:', err);
    res.status(500).json({ error: err.message });
  }
};
