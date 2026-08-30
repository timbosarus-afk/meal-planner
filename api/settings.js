// Vercel serverless function — simple key/value app settings.
// GET returns { default_servings } (and any other keys stored).
// PUT { key, value } sets one setting.

const { supabase } = require('../lib/db');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('app_settings').select('*');
    if (error) { res.status(500).json({ error: error.message }); return; }
    const settings = Object.fromEntries(data.map(row => [row.key, row.value]));
    res.status(200).json(settings);
    return;
  }

  if (req.method === 'PUT') {
    const { key, value } = req.body || {};
    if (!key) { res.status(400).json({ error: 'Missing "key" in request body' }); return; }

    const { data, error } = await supabase
      .from('app_settings')
      .upsert({ key, value: String(value) })
      .select()
      .single();

    if (error) { res.status(500).json({ error: error.message }); return; }
    res.status(200).json(data);
    return;
  }

  res.status(405).json({ error: 'Use GET or PUT' });
};
