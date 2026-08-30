// Vercel serverless function — marks an item as "already have this week"
// for ONE specific plan. Unlike /api/staples (permanent, applies to every
// future week), this is scoped to weekly_plan_id and naturally resets —
// next week's plan is a new row, so old exclusions never carry over.
// DELETE undoes one (in case of a mis-tap — nothing was recoverable before).

const { supabase } = require('../lib/db');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (req.method === 'POST') {
    const { planId, itemName } = req.body || {};
    if (!planId || !itemName) { res.status(400).json({ error: 'Missing "planId" or "itemName"' }); return; }

    const { data, error } = await supabase
      .from('weekly_plan_exclusions')
      .insert({ weekly_plan_id: planId, item_name: itemName })
      .select()
      .single();

    // Unique constraint violation (already excluded) is fine — treat as success
    if (error && error.code !== '23505') { res.status(500).json({ error: error.message }); return; }
    res.status(200).json(data || { weekly_plan_id: planId, item_name: itemName });
    return;
  }

  if (req.method === 'DELETE') {
    const { planId, itemName } = req.body || {};
    if (!planId || !itemName) { res.status(400).json({ error: 'Missing "planId" or "itemName"' }); return; }

    const { error } = await supabase
      .from('weekly_plan_exclusions')
      .delete()
      .eq('weekly_plan_id', planId)
      .eq('item_name', itemName);

    if (error) { res.status(500).json({ error: error.message }); return; }
    res.status(200).json({ undone: itemName });
    return;
  }

  res.status(405).json({ error: 'Use POST or DELETE' });
};
