const test = require('node:test');
const assert = require('node:assert/strict');
const { packPrice, alwaysMatcher, weekServings, weekCost, recipeCost } = require('./costs');

test('packPrice prefers Nectar, falls back to shelf price, handles both shapes', () => {
  assert.equal(packPrice({ price: 2, nectar_price: 1.5 }), 1.5);
  assert.equal(packPrice({ price: 2, nectar_price: null }), 2);
  assert.equal(packPrice({ price: '2.50', nectarPrice: null }), 2.5);
  assert.equal(packPrice({ price: 2, nectarPrice: 1.25 }), 1.25);
  assert.equal(packPrice({ price: null, nectar_price: null }), null);
  assert.equal(packPrice(null), null);
});

test('alwaysMatcher matches whole words only', () => {
  const isAlways = alwaysMatcher(['salt', 'olive oil', 'chopped tomatoes']);
  assert.equal(isAlways('salt'), true);
  assert.equal(isAlways('sea salt'), true);
  assert.equal(isAlways('unsalted butter'), false);
  assert.equal(isAlways('olive oil'), true);
  assert.equal(isAlways('chopped tomato'), true);
  assert.equal(isAlways('onion'), false);
});

test('weekServings counts overrides (lunch portions) and falls back to target', () => {
  assert.equal(weekServings([{ servings_override: 5 }, { servings_override: null }, {}], 3), 11);
  assert.equal(weekServings([], 3), 0);
});

test('weekCost sums whole packs at the till and counts unpriced lines', () => {
  const r = weekCost({
    basket: [
      { packs: 2, price: 1.0, nectarPrice: 0.85 }, // 1.70
      { packs: 1, price: 3.5, nectarPrice: null }, // 3.50
      { packs: 1, price: null, nectarPrice: null } // not priced
    ],
    unlinked: [{ ingredientKey: 'pandan leaf' }, { ingredientKey: 'curry leaf' }],
    servings: 4
  });
  assert.equal(r.total, 5.2);
  assert.equal(r.perServing, 1.3);
  assert.equal(r.notPriced, 3);
  assert.equal(r.priced, 2);
});

test('weekCost with no servings gives no per-serving figure', () => {
  assert.equal(weekCost({ basket: [{ packs: 1, price: 2 }], servings: 0 }).perServing, null);
});

test('recipeCost: scaled qty / pack size x pack price, matching units', () => {
  const linksByKey = {
    'beef mince': { pack_size: 500, pack_unit: 'g', price: 4, nectar_price: 3.5 },
    'onion': { pack_size: 3, pack_unit: 'each', price: 0.9 },
    'coconut milk': { pack_size: 400, pack_unit: 'ml', price: 1.2 },
    'rice': { pack_size: 1000, pack_unit: 'g', price: 2 }
  };
  const r = recipeCost({
    ingredients: [
      { id: 1, item: 'beef mince', quantity: 500, unit: 'g' },   // 3.50 @ 3 servings
      { id: 2, item: 'onion', quantity: 1, unit: null },          // 0.30
      { id: 3, item: 'coconut milk', quantity: 400, unit: 'ml' }, // 1.20
      { id: 4, item: 'rice', quantity: 0.3, unit: 'kg' }          // 0.60 (kg -> g)
    ],
    linksByKey, baseServings: 3, targetServings: 3
  });
  assert.equal(r.total, 5.6);
  assert.equal(r.perServing, 1.87);
  assert.equal(r.notPriced, 0);
  assert.deepEqual(r.lines.map(l => l.cost), [3.5, 0.3, 1.2, 0.6]);
});

test('recipeCost scales with servings; per serving stays the same', () => {
  const linksByKey = { 'beef mince': { pack_size: 500, pack_unit: 'g', price: 4 } };
  const ingredients = [{ id: 1, item: 'beef mince', quantity: 300, unit: 'g' }];
  const a = recipeCost({ ingredients, linksByKey, baseServings: 3, targetServings: 3 });
  const b = recipeCost({ ingredients, linksByKey, baseServings: 3, targetServings: 6 });
  assert.equal(a.total, 2.4);
  assert.equal(b.total, 4.8);
  assert.equal(a.perServing, b.perServing);
});

test('recipeCost excludes always-have items and counts what cannot be priced', () => {
  const linksByKey = {
    'olive oil': { pack_size: 500, pack_unit: 'ml', price: 5 },
    'saffron': { pack_size: 4, pack_unit: 'each', price: 0.5 },         // recipe says pinch
    'stock': { pack_size: 500, pack_unit: 'ml', price: null, nectar_price: null },
    'parsley': { pack_size: 30, pack_unit: 'g', price: 0.7 }
  };
  const r = recipeCost({
    ingredients: [
      { id: 1, item: 'olive oil', quantity: 2, unit: 'tbsp' }, // always-have: excluded
      { id: 2, item: 'saffron', quantity: 3, unit: 'pinch' },  // unit mismatch
      { id: 3, item: 'stock', quantity: 300, unit: 'ml' },     // no price
      { id: 4, item: 'pandan leaf', quantity: 2, unit: null }, // no link
      { id: 5, item: 'parsley', quantity: null, unit: null }   // no quantity
    ],
    linksByKey, isAlways: alwaysMatcher(['olive oil']), baseServings: 2, targetServings: 2
  });
  assert.equal(r.total, 0);
  assert.equal(r.notPriced, 4);
  assert.deepEqual(r.lines.map(l => l.reason), [null, 'unit mismatch', 'no price', 'no link', 'no quantity']);
  assert.equal(r.lines[0].alwaysHave, true);
  assert.equal(r.lines[0].linked, true);
});

test('recipeCost converts tbsp to ml against an ml pack', () => {
  const r = recipeCost({
    ingredients: [{ id: 1, item: 'soy sauce', quantity: 2, unit: 'tbsp' }], // 30ml
    linksByKey: { 'soy sauce': { pack_size: 150, pack_unit: 'ml', price: 1.5 } },
    baseServings: 2, targetServings: 2
  });
  assert.equal(r.total, 0.3);
});

test('recipeCost converts each <-> g with typical weights', () => {
  const { recipeCost } = require('./costs');
  const links = {
    onion: [{ pack_size: 1000, pack_unit: 'g', price: 0.95 }],
    'white cabbage': [{ pack_size: 1, pack_unit: 'each', price: 0.9 }],
    garlic: [{ pack_size: 1, pack_unit: 'each', price: 0.5 }]
  };
  const r = recipeCost({
    ingredients: [
      { item: '1 onion', quantity: 2, unit: null },
      { item: 'white cabbage', quantity: 450, unit: 'g' },
      { item: 'garlic', quantity: 5, unit: 'cloves' }
    ],
    linksByKey: links, baseServings: 2, targetServings: 2
  });
  assert.equal(r.notPriced, 0);
  assert.equal(r.lines[0].cost, 0.28); // 300g of a 1kg £0.95 bag
  assert.equal(r.lines[1].cost, 0.45); // half a cabbage
  assert.equal(r.lines[2].cost, 0.25); // 25g of a 50g bulb
});

test('recipeCost prices fillets and thighs sold by weight', () => {
  const { recipeCost } = require('./costs');
  const r = recipeCost({
    ingredients: [
      { item: 'salmon fillets', quantity: 3, unit: null },
      { item: 'pak choi', quantity: 2, unit: 'heads' }
    ],
    linksByKey: { 'salmon fillet': [{ pack_size: 240, pack_unit: 'g', price: 3.59 }], 'pak choi': [{ pack_size: 250, pack_unit: 'g', price: 1.55 }] },
    baseServings: 3, targetServings: 3
  });
  assert.equal(r.lines[0].cost, 5.39); // 360g of a 240g pack
  assert.equal(r.notPriced, 0);
  assert.equal(r.lines[1].cost, 1.55); // 2 heads = 250g
});
