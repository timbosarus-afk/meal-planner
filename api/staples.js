// Vercel serverless function for the persistent staples list.
// GET  -> list all staples
// POST { "itemName": "olive oil" } -> add one

const { supabase } = require('../lib/db');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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

    if (error) { res.status(500).json({ error: error.message }); return; }
    res.status(200).json(data);
    return;
  }

  res.status(405).json({ error: 'Use GET or POST' });
};
