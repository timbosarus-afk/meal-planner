// Vercel serverless function for the persistent staples list.
// GET  -> list all staples
// POST { "itemName": "olive oil" } -> add one
// DELETE { "id": "..." } -> remove one (for proactive management, not just
// reactive "always have" taps from a generated shopping list)

const { supabase } = require('../lib/db');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('staples').select('*').order('item_name');
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.status(200).json(data);
    return;
  }

  if (req.method === 'POST') {
    const { itemName } = req.body || {};
    if (!itemName || typeof itemName !== 'string') {
      res.status(400).json({ error: 'Missing "itemName" in request body' });
      return;
    }

    const { data, error } = await supabase
      .from('staples')
      .insert({ item_name: itemName.toLowerCase().trim() })
      .select()
      .single();

    // Unique constraint violation (already a staple) is fine, not an error
    if (error && error.code !== '23505') { res.status(500).json({ error: error.message }); return; }
    res.status(200).json(data || { item_name: itemName.toLowerCase().trim() });
    return;
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) { res.status(400).json({ error: 'Missing "id" in request body' }); return; }

    const { error } = await supabase.from('staples').delete().eq('id', id);
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.status(200).json({ deleted: id });
    return;
  }

  res.status(405).json({ error: 'Use GET, POST, or DELETE' });
};
