// Pantry CRUD. Mounted on /api/staples (kept at that path so the old
// front-end keeps working and we stay inside the 12-function Vercel cap).
//   GET                      -> all pantry items (?kind=always|stock optional)
//   POST { itemName, kind?, section?, quantity?, unit? } -> upsert one
//   POST { items:[{item,quantity,unit,section}], mode:'add'|'stocktake' } -> bulk
//   PATCH { id, quantity?, unit?, section?, kind?, itemName? }
//   DELETE { id }
const { supabase } = require('./db');
const { ingredientKey } = require('./ingredient-key');
const { guessSection, ALL_SECTIONS, ALWAYS_SECTIONS } = require('./pantry-sections');

const clean = s => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');
const num = v => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));

function toRow(it, kind) {
  const name = clean(it.item || it.itemName || it.item_name);
  const validSection = ALL_SECTIONS.includes(it.section) ? it.section : null;
  let k = it.kind || (validSection ? (ALWAYS_SECTIONS.includes(validSection) ? 'always' : 'stock') : kind) || 'always';
  const section = k === 'want' ? 'Next order' : (validSection || guessSection(name, k));
  return { item_name: name, ingredient_key: ingredientKey(name) || name, section, kind: k, quantity: k === 'always' ? null : num(it.quantity), unit: k === 'always' ? null : (it.unit || null), updated_at: new Date().toISOString() };
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      let q = supabase.from('pantry_items').select('*').order('item_name');
      if (req.query && req.query.kind) q = q.eq('kind', req.query.kind);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      if (Array.isArray(body.items)) {
        const mode = body.mode === 'stocktake' ? 'stocktake' : 'add';
        const rows = body.items.map(i => toRow(i, 'stock')).filter(r => r.item_name);
        const { data: existing, error: e1 } = await supabase.from('pantry_items').select('*');
        if (e1) throw new Error(e1.message);
        const byKey = new Map(existing.map(r => [r.ingredient_key, r]));
        const out = [];
        for (const r of rows) {
          const cur = byKey.get(r.ingredient_key);
          if (cur && cur.kind === 'always' && r.kind !== 'always') continue; // always-have items are never overwritten by a stocktake
          if (cur && mode === 'add' && cur.quantity != null && r.quantity != null && (cur.unit || null) === (r.unit || null)) {
            r.quantity = Number(cur.quantity) + Number(r.quantity);
          }
          out.push(r);
        }
        if (out.length) {
          const { error } = await supabase.from('pantry_items').upsert(out, { onConflict: 'ingredient_key' });
          if (error) throw new Error(error.message);
        }
        if (mode === 'stocktake') {
          const keep = new Set(rows.map(r => r.ingredient_key));
          const stale = existing.filter(r => r.kind === 'stock' && !keep.has(r.ingredient_key)).map(r => r.id);
          if (stale.length) {
            const { error } = await supabase.from('pantry_items').delete().in('id', stale);
            if (error) throw new Error(error.message);
          }
        }
        return res.status(200).json({ saved: out.length, mode });
      }
      const name = body.itemName;
      if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Missing "itemName" in request body' });
      const row = toRow({ ...body, item: name }, body.kind || 'always');
      const { data, error } = await supabase.from('pantry_items').upsert(row, { onConflict: 'ingredient_key' }).select().single();
      if (error) throw new Error(error.message);
      return res.status(200).json(data);
    }

    if (req.method === 'PATCH') {
      const { id, ...rest } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Missing "id"' });
      const upd = { updated_at: new Date().toISOString() };
      if (rest.quantity !== undefined) upd.quantity = num(rest.quantity);
      if (rest.unit !== undefined) upd.unit = rest.unit || null;
      if (rest.section && ALL_SECTIONS.includes(rest.section)) upd.section = rest.section;
      if (['always','stock','want'].includes(rest.kind)) upd.kind = rest.kind;
      if (rest.itemName) { upd.item_name = clean(rest.itemName); upd.ingredient_key = ingredientKey(upd.item_name) || upd.item_name; }
      const { data, error } = await supabase.from('pantry_items').update(upd).eq('id', id).select().single();
      if (error) throw new Error(error.message);
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Missing "id" in request body' });
      const { error } = await supabase.from('pantry_items').delete().eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ deleted: id });
    }

    res.status(405).json({ error: 'Use GET, POST, PATCH, or DELETE' });
  } catch (err) {
    console.error('pantry failed:', err);
    res.status(500).json({ error: err.message });
  }
};
