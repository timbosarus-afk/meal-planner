const test = require('node:test');
const assert = require('node:assert/strict');
const { computePlan, trolleyAdjustments, norm } = require('../extension/syncplan');

const basket = [
  { ingredientKey: 'onion', productName: "Sainsbury's Onions 1kg", packs: 1 },
  { ingredientKey: 'cod', productName: "Sainsbury's Skinless & Boneless Cod Fillets 360g", packs: 2 },
  { ingredientKey: 'lemon', productName: 'Stamford Street Co. 4 x Unwaxed Lemons', packs: 1 },
  { ingredientKey: 'chorizo', productName: "Sainsbury's Spanish Chorizo Ring 225g", packs: 1 }
];
const allLinks = [...basket.map(b => ({ product_name: b.productName })), { product_name: 'Yutaka Japanese Rice Vinegar 150ml' }];
const trolley = [
  { name: "Sainsbury's Onions 1kg", qty: 1 },
  { name: "Sainsbury's Skinless & Boneless Cod Fillets 360g", qty: 1 },
  { name: 'Stamford Street Co. 4 x Unwaxed Lemons', qty: 2 },
  { name: 'Yutaka Japanese Rice Vinegar 150ml', qty: 1 },
  { name: 'Birthday cake from the weekend', qty: 1 }
];

test('norm ignores case, punctuation and &', () => {
  assert.equal(norm("Sainsbury's Skinless & Boneless"), 'sainsbury s skinless and boneless');
});

test('plan splits into ok / add / more / fewer / extras / ignored', () => {
  const p = computePlan({ basket, allLinks, trolley });
  assert.deepEqual(p.ok.map(x => x.key), ['onion']);
  assert.deepEqual(p.add.map(x => x.key), ['chorizo']);
  assert.deepEqual(p.more.map(x => [x.key, x.delta]), [['cod', 1]]);
  assert.deepEqual(p.fewer.map(x => [x.key, x.delta]), [['lemon', 1]]);
  assert.deepEqual(p.extras.map(x => x.name), ['Yutaka Japanese Rice Vinegar 150ml']);   // linked, not on this week's list
  assert.deepEqual(p.ignored.map(x => x.name), ['Birthday cake from the weekend']);      // never touched
});

test('adjustments fix quantities; extras only removed when ticked', () => {
  const p = computePlan({ basket, allLinks, trolley });
  assert.deepEqual(trolleyAdjustments(p), [
    { name: "Sainsbury's Skinless & Boneless Cod Fillets 360g", target: 2 },
    { name: 'Stamford Street Co. 4 x Unwaxed Lemons', target: 1 }
  ]);
  assert.deepEqual(trolleyAdjustments(p, ['Yutaka Japanese Rice Vinegar 150ml']).slice(-1), [
    { name: 'Yutaka Japanese Rice Vinegar 150ml', target: 0 }
  ]);
});

test('empty trolley means everything is added', () => {
  const p = computePlan({ basket, allLinks, trolley: [] });
  assert.equal(p.add.length, 4);
  assert.equal(trolleyAdjustments(p).length, 0);
});
