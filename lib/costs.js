// Cost maths shared by the API (shopping list, weekly plan, recipe).
// Pure functions only: no DB access, so they're easy to unit test
// (lib/costs.test.js, run with `npm test`).
//
// Pack price = Nectar price when there is one, else the shelf price.
//
// Two different questions:
//   weekCost   - what you pay at the till: whole packs from the basket.
//   recipeCost - what a meal uses: scaled qty / pack size x pack price,
//                so 250g of a 500g £2 pack is £1.
const { ingredientKey, toBase } = require('./ingredient-key');

const round2 = n => Math.round(n * 100) / 100;
const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

// Accepts a product_links row (nectar_price/price) or a basket entry (nectarPrice/price)
function packPrice(link) {
  if (!link) return null;
  const nectar = num(link.nectarPrice !== undefined ? link.nectarPrice : link.nectar_price);
  if (nectar !== null) return nectar;
  return num(link.price);
}

// Always-have matcher: the item's key equals a pantry key, or contains it as a
// whole word ("salt" covers "sea salt", never "unsalted butter").
function alwaysMatcher(pantryNames) {
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const keys = [...new Set((pantryNames || []).map(n => ingredientKey(n) || String(n || '').toLowerCase()).filter(Boolean))];
  const res = keys.map(k => new RegExp(`(^|[^a-z])${esc(k)}([^a-z]|$)`));
  return itemName => {
    const key = ingredientKey(itemName) || String(itemName || '').toLowerCase();
    return keys.includes(key) || res.some(re => re.test(key));
  };
}

// Total servings cooked across the week: each recipe's servings_override,
// else the week's servings_target (so lunch portions count).
function weekServings(planRecipes, servingsTarget) {
  return (planRecipes || []).reduce((n, pr) => n + (num(pr.servings_override ?? pr.servingsOverride) || num(servingsTarget) || 0), 0);
}

// basket: [{ packs, price, nectarPrice }], unlinked: [...] (each counts as not priced)
function weekCost({ basket = [], unlinked = [], servings = 0 }) {
  let total = 0, priced = 0, notPriced = unlinked.length;
  for (const b of basket) {
    const p = packPrice(b);
    if (p === null) { notPriced++; continue; }
    total += p * (num(b.packs) || 1);
    priced++;
  }
  total = round2(total);
  return { total, perServing: servings > 0 ? round2(total / servings) : null, priced, notPriced, servings };
}

// ingredients: [{ id, item, quantity, unit }]
// linksByKey: { [ingredient_key]: product_links row }
// isAlways: fn(itemName) -> bool (from alwaysMatcher)
// baseServings: what the quantities are written for; targetServings: what you're cooking
function recipeCost({ ingredients = [], linksByKey = {}, isAlways = () => false, baseServings, targetServings }) {
  const base = num(baseServings) || null;
  const target = num(targetServings) || base;
  const scale = base && target ? target / base : 1;
  let total = 0, notPriced = 0;
  const lines = ingredients.map(i => {
    const key = ingredientKey(i.item) || String(i.item || '').toLowerCase();
    const link = linksByKey[key] || null;
    const line = { id: i.id, key, linked: !!link, alwaysHave: false, cost: null, reason: null };
    if (isAlways(i.item)) { line.alwaysHave = true; return line; }
    if (!link) { line.reason = 'no link'; notPriced++; return line; }
    const price = packPrice(link);
    if (price === null) { line.reason = 'no price'; notPriced++; return line; }
    const qty = num(i.quantity);
    const amount = qty === null ? null : toBase(qty * scale, i.unit);
    const packSize = num(link.pack_size);
    if (!amount || !packSize || amount.unit !== (link.pack_unit || '').toLowerCase()) {
      line.reason = qty === null ? 'no quantity' : 'unit mismatch'; notPriced++; return line;
    }
    line.cost = round2(amount.amount / packSize * price);
    total += amount.amount / packSize * price;
    return line;
  });
  total = round2(total);
  return { total, perServing: target ? round2(total / target) : null, servings: target, notPriced, lines };
}

module.exports = { packPrice, alwaysMatcher, weekServings, weekCost, recipeCost, round2 };
