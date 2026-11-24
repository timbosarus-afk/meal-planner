// Several pack sizes linked to one ingredient: choosePacks picks the cheapest
// mix that covers the need, and recipeCost uses the best price per unit.
const test = require('node:test');
const assert = require('node:assert');
const { choosePacks } = require('./ingredient-key');
const { recipeCost } = require('./costs');

const cream = [
  { id: 'big', pack_size: 1000, pack_unit: 'ml', price: 3.6 },
  { id: 'small', pack_size: 300, pack_unit: 'ml', price: 1.5 },
  { id: 'mid', pack_size: 600, pack_unit: 'ml', price: 2.4 }
];
const pick = (needs, links) => choosePacks(needs, links).map(x => `${x.packs}x${x.link.id}`).sort().join(' ');

test('small need gets the small pack, not the 1kg', () => {
  assert.strictEqual(pick([{ quantity: 200, unit: 'ml' }], cream), '1xsmall');
});

test('lines are summed before choosing', () => {
  assert.strictEqual(pick([{ quantity: 300, unit: 'ml' }, { quantity: 250, unit: 'ml' }], cream), '1xmid');
});

test('mixes sizes when that is cheapest', () => {
  const chicken = [{ id: '1kg', pack_size: 1000, pack_unit: 'g', nectar_price: 5.5, price: 6.5 }, { id: '300g', pack_size: 300, pack_unit: 'g', price: 2.5 }];
  assert.strictEqual(pick([{ quantity: 1200, unit: 'g' }], chicken), '1x1kg 1x300g');
  assert.strictEqual(pick([{ quantity: 1800, unit: 'g' }], chicken), '2x1kg');
});

test('without prices, least left over wins', () => {
  const noPrice = cream.map(c => ({ ...c, price: null }));
  assert.strictEqual(pick([{ quantity: 200, unit: 'ml' }], noPrice), '1xsmall');
});

test('uncomparable units fall back to the first size linked', () => {
  const garlic = [{ id: 'single', pack_size: 1, pack_unit: 'each', created_at: '2026-02-01' }, { id: 'four', pack_size: 4, pack_unit: 'each', created_at: '2026-01-01' }];
  assert.strictEqual(pick([{ quantity: 3, unit: 'cloves' }], garlic), '1xfour');
});

test('single link behaves as before', () => {
  assert.strictEqual(pick([{ quantity: 1200, unit: 'g' }], [{ id: 'kg', pack_size: 1000, pack_unit: 'g' }]), '2xkg');
});

test('recipeCost uses the best price per unit across sizes', () => {
  const c = recipeCost({ ingredients: [{ id: 1, item: 'double cream', quantity: 200, unit: 'ml' }], linksByKey: { 'double cream': cream }, baseServings: 3, targetServings: 3 });
  // 1kg at £3.60 is 0.36p/ml - cheapest per ml -> 200ml = 72p
  assert.strictEqual(c.total, 0.72);
  assert.strictEqual(c.notPriced, 0);
});
