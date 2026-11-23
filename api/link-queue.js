// Vercel serverless function — ingredients queued for product linking.
// GET                                   -> queue, oldest first
// POST { ingredientName | ingredientKey }      -> add one (already queued is fine)
// POST { items: [ingredientName, ...] }        -> add several
// DELETE { ingredientKey | ingredientName | id } -> remove one (e.g. once linked)
// Keys are normalised with lib/ingredient-key.js, same as product_links.

const { supabase } = require('../lib/db');
const { ingredientKey } = require('../lib/ingredient-key');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('link_queue').select('*').order('created_at');
      if (error) throw new Error(error.message);
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const names = Array.isArray(body.items) ? body.items : [body.ingredientKey || body.ingredientName];
      const keys = [...new Set(names.map(n => ingredientKey(n)).filter(Boolean))];
      if (!keys.length) return res.status(400).json({ error: 'Send "ingredientName", "ingredientKey" or "items"' });
      const { data, error } = await supabase.from('link_queue')
        .upsert(keys.map(k => ({ ingredient_key: k })), { onConflict: 'ingredient_key', ignoreDuplicates: true })
        .select();
      if (error) throw new Error(error.message);
      return res.status(200).json({ queued: keys, added: (data || []).length });
    }

    if (req.method === 'DELETE') {
      const { id, ingredientKey: k, ingredientName } = req.body || {};
      let q = supabase.from('link_queue').delete();
      if (id) q = q.eq('id', id);
      else if (k || ingredientName) q = q.eq('ingredient_key', ingredientKey(k || ingredientName));
      else return res.status(400).json({ error: 'Send "ingredientKey", "ingredientName" or "id"' });
      const { data, error } = await q.select();
      if (error) throw new Error(error.message);
      return res.status(200).json({ deleted: (data || []).length });
    }

    res.status(405).json({ error: 'Use GET, POST or DELETE' });
  } catch (err) {
    console.error('link-queue failed:', err);
    res.status(500).json({ error: err.message });
  }
};
