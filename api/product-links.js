// Vercel serverless function — ingredient -> Sainsbury's product links.
// GET                      -> all links (optionally ?key=red%20onion for one)
// POST { ingredientName | ingredientKey, productUrl, productName,
//        packSize, packUnit, defaultQty }  -> create or replace the link
// PATCH { ids: [...] }     -> stamp last_used_at (called after a basket run)
// DELETE { id }            -> remove a link (re-link from scratch)

const { supabase } = require('../lib/db');
const { ingredientKey } = require('../lib/ingredient-key');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

// Accepts any Sainsbury's product URL and pulls out the slug, which is the
// stable bit (query strings and tracking params get dropped).
function parseProductUrl(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)sainsburys\.co\.uk$/.test(u.hostname)) return null;
    const m = u.pathname.match(/\/gol-ui\/product\/([^/?#]+)/);
    if (!m) return null;
    return { slug: m[1], cleanUrl: `https://www.sainsburys.co.uk/gol-ui/product/${m[1]}` };
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (req.method === 'GET') {
    let query = supabase.from('product_links').select('*').order('ingredient_key');
    if (req.query.key) query = query.eq('ingredient_key', ingredientKey(req.query.key));
    const { data, error } = await query;
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.status(200).json(data);
    return;
  }

  if (req.method === 'POST') {
    const { ingredientName, ingredientKey: givenKey, productUrl, productName, packSize, packUnit, defaultQty } = req.body || {};
    const key = ingredientKey(givenKey || ingredientName);
    if (!key) { res.status(400).json({ error: 'Missing "ingredientName" or "ingredientKey"' }); return; }

    const parsed = parseProductUrl(productUrl);
    if (!parsed) { res.status(400).json({ error: 'productUrl must be a sainsburys.co.uk /gol-ui/product/ URL' }); return; }

    const allowedUnits = ['g', 'ml', 'each'];
    const row = {
      ingredient_key: key,
      product_url: parsed.cleanUrl,
      product_slug: parsed.slug,
      product_name: productName || null,
      pack_size: packSize ? Number(packSize) : null,
      pack_unit: allowedUnits.includes(packUnit) ? packUnit : null,
      default_qty: Math.max(1, parseInt(defaultQty, 10) || 1)
    };

    const { data, error } = await supabase
      .from('product_links')
      .upsert(row, { onConflict: 'ingredient_key' })
      .select()
      .single();
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.status(200).json(data);
    return;
  }

  if (req.method === 'PATCH') {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) { res.status(400).json({ error: 'Missing "ids" array' }); return; }
    const { error } = await supabase
      .from('product_links')
      .update({ last_used_at: new Date().toISOString() })
      .in('id', ids);
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.status(200).json({ updated: ids.length });
    return;
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) { res.status(400).json({ error: 'Missing "id" in request body' }); return; }
    const { error } = await supabase.from('product_links').delete().eq('id', id);
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.status(200).json({ deleted: id });
    return;
  }

  res.status(405).json({ error: 'Use GET, POST, PATCH or DELETE' });
};
