// Vercel serverless function — re-runs the ingredient parser over saved
// recipes, so parser improvements apply to old imports too.
//
// GET  ?dryRun=1             -> preview: every row's before/after, nothing written
// POST { recipeId? }         -> apply (one recipe, or all if omitted)
//
// Rows with a raw_line are re-parsed from scratch. Older rows (imported
// before raw_line existed) get a line rebuilt from their stored fields,
// which is saved as raw_line so later re-parses start from the same text.

const { supabase } = require('../lib/db');
const { parseIngredientLine } = require('../lib/parse-ingredient');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

function reconstructLine(row) {
  return [row.quantity ?? '', row.unit ?? '', row.item ?? '']
    .join(' ').replace(/\s+/g, ' ').trim() + (row.notes ? `, ${row.notes}` : '');
}

// One code path for everything (raw line -> parser), so running this twice
// is a no-op. Old rows get a line rebuilt from their stored fields first.
function reparseRow(row) {
  const raw = row.raw_line || reconstructLine(row);
  const next = parseIngredientLine(raw);
  return {
    quantity: next.quantity,
    unit: next.unit,
    item: next.item,
    notes: next.notes,
    raw_line: raw
  };
}

const sameQty = (a, b) => (a == null && b == null) || (a != null && b != null && Number(a) === Number(b));
const same = (a, b) =>
  sameQty(a.quantity, b.quantity) &&
  (a.unit || null) === (b.unit || null) &&
  a.item === b.item &&
  (a.notes || null) === (b.notes || null);

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const recipeId = req.method === 'POST' ? (req.body || {}).recipeId : req.query.recipeId;
  const dryRun = req.method === 'GET';
  if (req.method !== 'GET' && req.method !== 'POST') { res.status(405).json({ error: 'Use GET (preview) or POST (apply)' }); return; }

  try {
    let query = supabase.from('recipe_ingredients').select('id, recipe_id, position, quantity, unit, item, notes, raw_line').order('recipe_id').order('position');
    if (recipeId) query = query.eq('recipe_id', recipeId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const changes = rows
      .map(row => ({ id: row.id, before: { quantity: row.quantity, unit: row.unit, item: row.item, notes: row.notes }, after: reparseRow(row), hadRaw: !!row.raw_line }))
      .filter(c => !same(c.before, c.after) || !c.hadRaw);

    if (dryRun) {
      res.status(200).json({ dryRun: true, total: rows.length, changing: changes.length, changes });
      return;
    }

    // Small personal dataset, so row-by-row updates are fine and keep
    // failures isolated to the row that failed.
    const failed = [];
    for (const c of changes) {
      const { error: upErr } = await supabase.from('recipe_ingredients').update(c.after).eq('id', c.id);
      if (upErr) failed.push({ id: c.id, error: upErr.message });
    }

    res.status(200).json({ total: rows.length, updated: changes.length - failed.length, failed });
  } catch (err) {
    console.error('Re-parse failed:', err);
    res.status(500).json({ error: err.message });
  }
};
