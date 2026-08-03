// Vercel serverless function — POST { "recipeIds": [...], "servingsTarget": 2 }
// Returns a consolidated shopping list: ingredients merged across all
// selected recipes, scaled to your target portions, with staples excluded.
//
// NOT done yet: pack-size rounding (e.g. rounding 137g up to a 250g pack),
// unit conversion between differently-worded quantities of the same
// ingredient (e.g. "2 onions" + "150g onion" won't merge — different units).
// Good enough to shop from by eye for now; refine once real usage shows
// which mismatches actually come up.

const { supabase } = require('../lib/db');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST with a JSON body: { "recipeIds": [...], "servingsTarget": 2 }' });
    return;
  }

  const { recipeIds, servingsTarget = 2 } = req.body || {};

  if (!Array.isArray(recipeIds) || recipeIds.length === 0) {
    res.status(400).json({ error: 'Missing or empty "recipeIds" array in request body' });
    return;
  }

  try {
    const [{ data: recipes, error: recipesError }, { data: ingredients, error: ingredientsError }, { data: staples, error: staplesError }] = await Promise.all([
      supabase.from('recipes').select('id, title, servings').in('id', recipeIds),
      supabase.from('recipe_ingredients').select('recipe_id, quantity, unit, item, notes').in('recipe_id', recipeIds),
      supabase.from('staples').select('item_name')
    ]);

    if (recipesError) throw new Error(recipesError.message);
    if (ingredientsError) throw new Error(ingredientsError.message);
    if (staplesError) throw new Error(staplesError.message);

    const recipeById = Object.fromEntries(recipes.map(r => [r.id, r]));
    const stapleNames = staples.map(s => s.item_name.toLowerCase());

    const isStaple = (itemName) => {
      const lower = itemName.toLowerCase();
      return stapleNames.some(staple => lower.includes(staple) || staple.includes(lower));
    };

    // Merge key: same item name + same unit. Different units for the same
    // ingredient (e.g. "2 onions" vs "150g onion") deliberately stay separate
    // lines rather than guessing a conversion.
    const consolidated = {};
    const excludedStaples = new Set();

    for (const ing of ingredients) {
      if (isStaple(ing.item)) {
        excludedStaples.add(ing.item);
        continue;
      }

      const recipe = recipeById[ing.recipe_id];
      const scale = recipe?.servings ? servingsTarget / recipe.servings : 1;
      const scaledQuantity = ing.quantity !== null ? Math.round(ing.quantity * scale * 100) / 100 : null;

      const key = `${ing.item.toLowerCase()}|${ing.unit || ''}`;

      if (!consolidated[key]) {
        consolidated[key] = {
          item: ing.item,
          unit: ing.unit,
          quantity: 0,
          hasQuantity: false,
          sourceRecipes: new Set()
        };
      }

      if (scaledQuantity !== null) {
        consolidated[key].quantity += scaledQuantity;
        consolidated[key].hasQuantity = true;
      }
      consolidated[key].sourceRecipes.add(recipe?.title || 'Unknown recipe');
    }

    const shoppingList = Object.values(consolidated)
      .map(entry => ({
        item: entry.item,
        unit: entry.unit,
        quantity: entry.hasQuantity ? Math.round(entry.quantity * 100) / 100 : null,
        usedIn: [...entry.sourceRecipes]
      }))
      .sort((a, b) => a.item.localeCompare(b.item));

    res.status(200).json({
      servingsTarget,
      recipeCount: recipes.length,
      shoppingList,
      excludedAsStaples: [...excludedStaples]
    });
  } catch (err) {
    console.error('Shopping list generation failed:', err);
    res.status(500).json({ error: err.message || 'Failed to generate shopping list' });
  }
};
