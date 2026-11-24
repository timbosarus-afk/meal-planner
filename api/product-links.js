// Vercel serverless function — ingredient -> Sainsbury's product links.
// GET                      -> all links (optionally ?key=red%20onion for one)
// POST { ingredientName | ingredientKey, productUrl, productName,
//        packSize, packUnit, defaultQty, markUsed?, price?, nectarPrice? }
//                          -> create or replace the link
//        (markUsed: true also stamps last_used_at; sent when added to basket)
// PATCH { ids: [...] }     -> stamp last_used_at (called after a basket run)
// PATCH { prices: [{ slug, price, nectarPrice }] }
//                          -> update saved prices for every link to that product
//                             (from link time, basket runs, product page visits
//                             and the panel's "Update prices")
// DELETE { id }            -> remove a link (re-link from scratch)

const { supabase } = require('../lib/db');
const { ingredientKey } = require('../lib/ingredient-key');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

// Accepts any Sainsbury's product URL (old /gol-ui/ or current /groceries/)
// and pulls out the slug, which is the stable bit. Stored in the /gol-ui/
// form for consistency with existing rows; Sainsbury's redirects it.
function parseProductUrl(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)sainsburys\.co\.uk$/.test(u.hostname)) return null;
    const m = u.pathname.match(/\/(?:gol-ui|groceries)\/product\/([^/?#]+)/);
    if (!m) return null;
    return { slug: m[1], cleanUrl: `https://www.sainsburys.co.uk/gol-ui/product/${m[1]}` };
  } catch {
    return null;
  }
}

// Money in pounds, 2dp, or null if missing/invalid
function toPrice(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n < 10000 ? Math.round(n * 100) / 100 : null;
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
    const { ingredientName, ingredientKey: givenKey, productUrl, productName, packSize, packUnit, defaultQty, markUsed, price, nectarPrice } = req.body || {};
    const key = ingredientKey(givenKey || ingredientName);
    if (!key) { res.status(400).json({ error: 'Missing "ingredientName" or "ingredientKey"' }); return; }

    const parsed = parseProductUrl(productUrl);
    if (!parsed) { res.status(400).json({ error: 'productUrl must be a sainsburys.co.uk product URL' }); return; }

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
    // Sent by the extension when the product was just added to the basket
    if (markUsed) row.last_used_at = new Date().toISOString();
    // Only touch prices when the caller read one, so re-linking without a
    // price doesn't wipe a good saved price
    const p = toPrice(price);
    const np = toPrice(nectarPrice);
    if (p !== null || np !== null) {
      row.price = p;
      row.nectar_price = np;
      row.price_updated_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('product_links')
      .upsert(row, { onConflict: 'ingredient_key' })
      .select()
      .single();
    if (error) { res.status(500).json({ error: error.message }); return; }
    // Linked now, so it no longer needs to wait in the app's link queue
    await supabase.from('link_queue').delete().eq('ingredient_key', key);
    res.status(200).json(data);
    return;
  }

  if (req.method === 'PATCH') {
    const { ids, prices } = req.body || {};

    if (Array.isArray(prices)) {
      const now = new Date().toISOString();
      let updated = 0;
      for (const item of prices.slice(0, 500)) {
        const slug = typeof item?.slug === 'string' ? item.slug : null;
        const p = toPrice(item?.price);
        const np = toPrice(item?.nectarPrice);
        if (!slug || (p === null && np === null)) continue;
        const { data, error } = await supabase
          .from('product_links')
          .update({ price: p, nectar_price: np, price_updated_at: now })
          .eq('product_slug', slug)
          .select('id');
        if (error) { res.status(500).json({ error: error.message }); return; }
        updated += (data || []).length;
      }
      res.status(200).json({ updated });
      return;
    }

    if (!Array.isArray(ids) || !ids.length) { res.status(400).json({ error: 'Send "ids" or "prices"' }); return; }
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
