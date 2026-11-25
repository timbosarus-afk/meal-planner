// Works out what to change in the Sainsbury's trolley so it matches this week's
// shopping list. Pure functions (no DOM, no network) so they can be unit tested
// from lib/syncplan.test.js. Loaded by popup.html as a plain script and by node.
//
// Only products Tim has linked are ever touched. A trolley row that matches no
// linked product is left alone and just counted as "ignored".
(function (root) {
  const norm = s => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();

  // Find the trolley row for a product name: exact first, then one name containing the other.
  function findRow(rows, name) {
    const n = norm(name);
    if (!n) return null;
    return rows.find(r => r.n === n) || rows.find(r => r.n.includes(n) || n.includes(r.n)) || null;
  }

  // basket: [{ linkId, ingredientKey, productName, productUrl, productSlug, packs, items }]
  // allLinks: every product_links row ({ product_name })
  // trolley: [{ name, qty }]
  function computePlan({ basket = [], allLinks = [], trolley = [] }) {
    const rows = trolley.map(t => ({ ...t, n: norm(t.name), used: false }));
    const plan = { ok: [], add: [], more: [], fewer: [], extras: [], ignored: [] };

    for (const b of basket) {
      const row = findRow(rows, b.productName);
      const want = Number(b.packs) || 1;
      const have = row ? row.qty : 0;
      if (row) row.used = true;
      const base = { key: b.ingredientKey, name: b.productName, want, have, entry: b };
      if (!row || have === 0) plan.add.push(base);
      else if (have < want) plan.more.push({ ...base, delta: want - have, trolleyName: row.name });
      else if (have > want) plan.fewer.push({ ...base, delta: have - want, trolleyName: row.name });
      else plan.ok.push(base);
    }

    const linked = allLinks.map(l => norm(l.product_name || l.productName)).filter(Boolean);
    for (const r of rows) {
      if (r.used) continue;
      const isLinked = linked.some(n => n === r.n || n.includes(r.n) || r.n.includes(n));
      (isLinked ? plan.extras : plan.ignored).push({ name: r.name, have: r.qty });
    }
    return plan;
  }

  // Changes to make on the trolley page itself: [{ name, target }]
  // `removeNames` are extras the user ticked for removal.
  function trolleyAdjustments(plan, removeNames = []) {
    return [
      ...plan.more.map(p => ({ name: p.trolleyName, target: p.want })),
      ...plan.fewer.map(p => ({ name: p.trolleyName, target: p.want })),
      ...plan.extras.filter(e => removeNames.includes(e.name)).map(e => ({ name: e.name, target: 0 }))
    ];
  }

  const api = { norm, findRow, computePlan, trolleyAdjustments };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.syncPlan = api;
})(typeof window !== 'undefined' ? window : globalThis);
