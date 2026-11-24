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

// Typical weight in grams of one "each" of common items, so a recipe that says
// "1 onion" can be priced against a 1kg bag, and "200g cabbage" against a whole
// cabbage. Rough on purpose: it only has to be fair to the nearest few pence.
const EACH_GRAMS = {
  'onion': 150, 'red onion': 150, 'shallot': 40, 'spring onion': 15,
  'carrot': 100, 'leek': 200, 'potato': 200, 'egg': 60,
  'green chilli': 10, 'red chilli': 10, 'garlic': 50, // garlic = one bulb
  'white cabbage': 900, 'red pepper': 150, 'pepper': 150, 'tomato': 120,
  'cucumber': 350, 'aubergine': 300, 'lemon': 100, 'lime': 70,
  'little gem lettuce': 130, 'frozen paratha': 80, 'tortilla wrap': 60, 'pitta bread': 60,
  'salmon fillet': 120, 'chicken thigh': 140, 'chicken breast': 175, 'pak choi': 125, 'king prawn': 10
};
const CLOVE_GRAMS = 5;

// Express a recipe amount in the unit a pack is sold in, using the table above.
// amount: { amount, unit } from toBase (or null for cloves). Returns same shape or null.
function convertAmount(amount, key, packUnit, rawUnit, rawQty) {
  const each = EACH_GRAMS[key];
  const clove = /^cloves?$/i.test((rawUnit || '').trim());
  if (clove && key === 'garlic') {
    const grams = rawQty * CLOVE_GRAMS;
    return packUnit === 'g' ? { amount: grams, unit: 'g' } : packUnit === 'each' ? { amount: grams / each, unit: 'each' } : null;
  }
  // "2 heads", "3 fillets", "1 piece" count as eachs
  if (!amount && /^(heads?|fillets?|pieces?|thighs?|breasts?)$/i.test((rawUnit || '').trim())) amount = { amount: rawQty, unit: 'each' };
  if (!amount || !each || amount.unit === packUnit) return amount;
  if (amount.unit === 'each' && packUnit === 'g') return { amount: amount.amount * each, unit: 'g' };
  if (amount.unit === 'g' && packUnit === 'each') return { amount: amount.amount / each, unit: 'each' };
  return amount;
}

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
// linksByKey: { [ingredient_key]: product_links row, or an array of them (several sizes) }
// isAlways: fn(itemName) -> bool (from alwaysMatcher)
// baseServings: what the quantities are written for; targetServings: what you're cooking
function recipeCost({ ingredients = [], linksByKey = {}, isAlways = () => false, baseServings, targetServings }) {
  const base = num(baseServings) || null;
  const target = num(targetServings) || base;
  const scale = base && target ? target / base : 1;
  let total = 0, notPriced = 0;
  const lines = ingredients.map(i => {
    const key = ingredientKey(i.item) || String(i.item || '').toLowerCase();
    // One or several linked sizes; a meal's fair share uses the best price per unit
    const links = [].concat(linksByKey[key] || []);
    const line = { id: i.id, key, linked: links.length > 0, alwaysHave: false, cost: null, reason: null };
    if (isAlways(i.item)) { line.alwaysHave = true; return line; }
    if (!links.length) { line.reason = 'no link'; notPriced++; return line; }
    const pricedLinks = links.filter(l => packPrice(l) !== null);
    if (!pricedLinks.length) { line.reason = 'no price'; notPriced++; return line; }
    const qty = num(i.quantity);
    const raw = qty === null ? null : toBase(qty * scale, i.unit);
    // Try each linked size in its own unit, converting each <-> g where we know the weight
    let best = null;
    if (qty !== null) {
      for (const l of pricedLinks) {
        const size = num(l.pack_size);
        if (!size) continue;
        const a = convertAmount(raw, key, (l.pack_unit || '').toLowerCase(), i.unit, qty * scale);
        if (!a || a.unit !== (l.pack_unit || '').toLowerCase()) continue;
        const c = a.amount * (packPrice(l) / size);
        if (best === null || c < best) best = c;
      }
    }
    if (best === null) {
      line.reason = qty === null ? 'no quantity' : 'unit mismatch'; notPriced++; return line;
    }
    line.cost = round2(best);
    total += best;
    return line;
  });
  total = round2(total);
  return { total, perServing: target ? round2(total / target) : null, servings: target, notPriced, lines };
}

// product_links rows -> { [ingredient_key]: [rows] } (several sizes per ingredient)
function groupLinks(links) {
  const out = {};
  for (const l of links || []) (out[l.ingredient_key] ||= []).push(l);
  return out;
}

module.exports = { packPrice, alwaysMatcher, weekServings, weekCost, recipeCost, groupLinks, round2 };
