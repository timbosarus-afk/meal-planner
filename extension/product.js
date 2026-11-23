// Runs on every Sainsbury's grocery page: /groceries/* (current site) and
// /gol-ui/* (old site, which now redirects to /groceries/).
//
// v0.7: Sainsbury's moved from /gol-ui/ to /groceries/ and renamed its
// buttons, so v0.6 never loaded. This version also replaces the one-at-a-time
// link panel with a side panel that walks through the week's list.
//
// Two jobs, only ever one at a time:
//
// 1. BASKET RUN. If the popup has started a run and this tab is on the
//    product the queue is waiting for, click Add, bump the quantity to the
//    number of packs needed, record the result, then go to the next product.
//    Products already in the basket are SKIPPED, so re-running never doubles up.
//
// 2. SIDE PANEL. Shows the week's shopping list with progress. "Get next"
//    searches Sainsbury's for the next unlinked item; "Link this" (under each
//    search result, or in the panel on a product page) links that product to
//    the item. Clicking Add on a search result while an item is active links
//    it too.
//
// The API still validates /gol-ui/product/ URLs, so links are saved in that
// form (same slug; Sainsbury's redirects it). Navigation uses /groceries/.

(() => {
  if (window.__mealPlannerProductScript) return;
  window.__mealPlannerProductScript = true;

  const SITE = 'https://www.sainsburys.co.uk';
  const CARD = '[data-testid="gw-product-card"]';
  const ADD_SELECTORS = [
    '[data-testid="gw-add-to-basket"]',
    '[data-testid="add-button"]',
    'button[aria-label^="Add" i][aria-label*="basket" i]'
  ];
  const OLD_INC_SELECTORS = ['[data-testid="pt-button-inc"]', '[data-testid="quantity-increment"]'];
  const QTY_SELECTORS = ['input[aria-label^="Quantity of" i]', '[data-testid="pt-quantity"]', '[data-testid="quantity"]'];
  const PRODUCT_RE = /\/(?:gol-ui|groceries)\/product\/([^/?#]+)/;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const productSlug = () => (location.pathname.match(PRODUCT_RE) || [])[1] || null;
  const slugFromHref = href => { try { return (new URL(href, SITE).pathname.match(PRODUCT_RE) || [])[1] || null; } catch { return null; } };
  const apiProductUrl = slug => `${SITE}/gol-ui/product/${slug}`;
  const pageUrl = url => String(url || '').replace('/gol-ui/product/', '/groceries/product/');
  const searchUrl = term => `${SITE}/groceries/search?searchTerm=${encodeURIComponent(term)}`;
  const isSearchPage = () => /\/groceries\/search/.test(location.pathname) || /\/gol-ui\/SearchResults\//.test(location.pathname);

  const visible = e => e.offsetParent !== null && !e.disabled;
  const inCard = e => !!(e.closest && e.closest(CARD));

  // On a product page the main product's controls are the ones NOT inside a
  // product card (cards are the "you might also like" carousels). With a
  // root (a card), search only inside it.
  function findIn(selectors, root) {
    for (const sel of selectors) {
      const el = [...(root || document).querySelectorAll(sel)].find(e => visible(e) && (root || !inCard(e)));
      if (el) return el;
    }
    return null;
  }

  function findIncrease(root) {
    const byLabel = [...(root || document).querySelectorAll('button')].find(b =>
      visible(b) && (root || !inCard(b)) &&
      /^increase quantity/i.test((b.getAttribute('aria-label') || b.textContent || '').trim()));
    return byLabel || findIn(OLD_INC_SELECTORS, root);
  }

  async function waitFor(fn, timeoutMs = 15000, stepMs = 300) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const v = fn();
      if (v) return v;
      await sleep(stepMs);
    }
    return null;
  }

  function readQty(root) {
    const el = findIn(QTY_SELECTORS, root);
    if (!el) return null;
    const n = parseInt(el.value ?? el.textContent, 10);
    return Number.isNaN(n) ? null : n;
  }

  // ---- Product details ----------------------------------------------------

  function productName() {
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const j = JSON.parse(s.textContent);
        const items = Array.isArray(j) ? j : (j['@graph'] || [j]);
        const p = items.find(x => x && (x['@type'] === 'Product' || (Array.isArray(x['@type']) && x['@type'].includes('Product'))));
        if (p?.name) return p.name.trim();
      } catch { /* ignore bad JSON-LD */ }
    }
    const h = document.querySelector('[data-testid="product-title"], [data-testid="pd-product-title"], h1');
    return h ? h.textContent.trim() : '';
  }

  // A search-result / carousel card -> { slug, name }
  function tileInfo(card) {
    const a = card.querySelector('a[href*="/product/"]');
    const slug = a && slugFromHref(a.getAttribute('href'));
    if (!slug) return null;
    const nameEl = card.querySelector('[data-testid="gw-product-name"]');
    const addBtn = card.querySelector('[data-testid="gw-add-to-basket"]');
    const fromAria = addBtn ? (addBtn.getAttribute('aria-label') || '').replace(/^Add\s+/i, '').replace(/\s+to basket$/i, '').trim() : '';
    const name = (nameEl && nameEl.textContent.trim()) || fromAria || (a.getAttribute('aria-label') || a.textContent || '').trim();
    return { slug, name };
  }

  // ---- Prices ---------------------------------------------------------------
  // Every product shows a shelf price (gw-product-retail-price) and, when
  // there's a Nectar offer, a Nectar price (gw-product-contextual-price).
  // Each element also holds the unit price ("85p85p / kg"), so take the first
  // money value. JSON-LD offers.price is the fallback.

  function parseMoney(text) {
    const m = String(text || '').match(/£\s?(\d+(?:\.\d{1,2})?)|(\d+)\s?p\b/);
    if (!m) return null;
    return m[1] ? Number(m[1]) : Number(m[2]) / 100;
  }

  // root = a product card; otherwise the main product on a page (doc can be a
  // fetched, parsed product page). Skips carousels and "bought together".
  function readPrices(root, doc = document) {
    const pick = sel => root
      ? root.querySelector(sel)
      : [...doc.querySelectorAll(sel)].find(e => !e.closest(CARD) && !e.closest('[data-testid="frequently-bought-together"]'));
    let price = parseMoney(pick('[data-testid="gw-product-retail-price"]')?.textContent);
    const nectarPrice = parseMoney(pick('[data-testid="gw-product-contextual-price"]')?.textContent);
    if (price == null && !root) {
      for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
        try {
          const offers = JSON.parse(s.textContent).offers;
          const o = Array.isArray(offers) ? offers[0] : offers;
          if (o?.price) { price = Number(o.price); break; }
        } catch { /* ignore */ }
      }
    }
    return { price: price ?? null, nectarPrice: nectarPrice ?? null };
  }

  const money = n => n == null ? '' : (n < 1 ? `${Math.round(n * 100)}p` : `£${n.toFixed(2)}`);
  const priceLabel = p => p.nectarPrice != null && p.nectarPrice !== p.price
    ? `${money(p.nectarPrice)} Nectar · ${money(p.price)}`
    : money(p.price ?? p.nectarPrice);

  async function sendPrices(apiUrl, prices) {
    const list = prices.filter(p => p.slug && (p.price != null || p.nectarPrice != null));
    if (!apiUrl || !list.length) return;
    await fetch(`${apiUrl}/api/product-links`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prices: list })
    }).catch(() => {});
  }

  // "Sainsbury's Red Onions x3" -> 3 each, "Whole Milk 2.27L" -> 2270 ml,
  // "Beef Mince 5% Fat 500g" -> 500 g, "Eggs 6 pack" -> 6 each.
  function guessPack(name) {
    const s = (name || '').toLowerCase();
    let m = s.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|l|ltr|litre)\b/);
    if (m) return toPack(Number(m[1]) * Number(m[2]), m[3]);
    m = s.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|l|ltr|litre)\b/);
    if (m) return toPack(Number(m[1]), m[2]);
    m = s.match(/\bx\s?(\d+)\b/) || s.match(/\b(\d+)\s*(?:pack|pk|per pack)\b/);
    if (m) return { size: Number(m[1]), unit: 'each' };
    return { size: 1, unit: 'each' };
  }

  function toPack(n, u) {
    switch (u) {
      case 'kg': return { size: n * 1000, unit: 'g' };
      case 'g': return { size: n, unit: 'g' };
      case 'l': case 'ltr': case 'litre': return { size: n * 1000, unit: 'ml' };
      case 'cl': return { size: n * 10, unit: 'ml' };
      default: return { size: n, unit: 'ml' };
    }
  }

  // ---- Basket run ---------------------------------------------------------

  async function getRun() {
    const { basketRun } = await chrome.storage.local.get('basketRun');
    return basketRun && basketRun.active ? basketRun : null;
  }

  function showRunBanner(text) {
    let el = document.getElementById('mp-run-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'mp-run-banner';
      el.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#1B4D3E;color:#fff;font:600 13px/1.3 -apple-system,"Segoe UI",sans-serif;padding:10px 14px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.25);display:flex;gap:10px;align-items:center;';
      const txt = document.createElement('span');
      txt.id = 'mp-run-text';
      const stop = document.createElement('button');
      stop.textContent = 'Stop';
      stop.style.cssText = 'background:#fff;color:#B3261E;border:0;border-radius:6px;padding:4px 8px;font-weight:700;cursor:pointer;';
      stop.onclick = async () => {
        const run = await getRun();
        if (run) { run.active = false; run.finishedAt = Date.now(); run.stopped = true; await chrome.storage.local.set({ basketRun: run }); }
        showRunBanner('Stopped.');
      };
      el.append(txt, stop);
      document.body.appendChild(el);
    }
    document.getElementById('mp-run-text').textContent = text;
  }

  async function addCurrentProduct(entry) {
    // Give the page a few seconds to render Add before deciding the product
    // is already in the basket (quantity stepper showing instead).
    const addBtn = await waitFor(() => findIn(ADD_SELECTORS), 4000);
    if (!addBtn) {
      if (findIncrease()) return { status: 'skipped', note: 'Already in basket' };
      const late = await waitFor(() => findIn(ADD_SELECTORS), 11000);
      if (!late) return { status: 'failed', note: 'No Add button (out of stock or page changed)' };
      return clickAndBump(late, entry);
    }
    return clickAndBump(addBtn, entry);
  }

  async function clickAndBump(addBtn, entry) {
    addBtn.click();
    let added = 1;

    for (let i = 1; i < entry.packs; i++) {
      const inc = await waitFor(() => findIncrease(), 8000);
      if (!inc) return { status: 'partial', note: `Added ${added} of ${entry.packs}, couldn't find + button`, added };
      await sleep(700); // let the previous basket update land first
      inc.click();
      added++;
    }

    await sleep(900);
    const qty = readQty();
    if (qty !== null && qty !== entry.packs) {
      return { status: 'partial', note: `Basket shows ${qty}, wanted ${entry.packs}`, added: qty };
    }
    return { status: 'added', added };
  }

  async function finishRun(run) {
    run.active = false;
    run.finishedAt = Date.now();
    await chrome.storage.local.set({ basketRun: run });

    const done = run.results.filter(r => r.status === 'added').length;
    const other = run.results.length - done;
    showRunBanner(`Done: ${done} added${other ? `, ${other} need a look (open the extension)` : ''}`);

    if (run.apiUrl && run.batchId && done) {
      fetch(`${run.apiUrl}/api/weekly-plan-shopping-list?id=${encodeURIComponent(run.batchId)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ordered' })
      }).catch(() => {});
    }

    const usedIds = run.results.filter(r => r.status === 'added' || r.status === 'partial').map(r => r.linkId);
    if (run.apiUrl && usedIds.length) {
      fetch(`${run.apiUrl}/api/product-links`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: usedIds })
      }).catch(() => {});
    }

    // Prices seen on each product page during the run keep costs current
    sendPrices(run.apiUrl, run.prices || []);
  }

  async function handleRun() {
    const run = await getRun();
    if (!run) return false;

    const entry = run.queue[run.index];
    if (!entry) { await finishRun(run); return true; }

    // Only act on the product the queue expects; anything else, steer back.
    // Give up on an item after a few attempts so a renamed product can't
    // trap the tab in a redirect loop.
    if (productSlug() !== entry.productSlug) {
      run.steer = (run.steer || 0) + 1;
      if (run.steer > 3) {
        run.results.push({ status: 'failed', note: "Couldn't open this product (it may have been renamed - re-link it)", linkId: entry.linkId, ingredientKey: entry.ingredientKey, productName: entry.productName, packs: entry.packs, productUrl: entry.productUrl });
        run.index += 1;
        run.steer = 0;
        await chrome.storage.local.set({ basketRun: run });
        const next = run.queue[run.index];
        if (!next) { await finishRun(run); return true; }
        location.href = pageUrl(next.productUrl);
        return true;
      }
      await chrome.storage.local.set({ basketRun: run });
      showRunBanner(`Basket run: heading to ${entry.productName || entry.ingredientKey}…`);
      location.href = pageUrl(entry.productUrl);
      return true;
    }

    showRunBanner(`Adding ${run.index + 1}/${run.queue.length}: ${entry.productName || entry.ingredientKey} x${entry.packs}`);
    const result = await addCurrentProduct(entry);

    // Re-read in case Stop was pressed while we were working
    const latest = await getRun();
    if (!latest) return true;

    latest.results.push({ ...result, linkId: entry.linkId, ingredientKey: entry.ingredientKey, productName: entry.productName, packs: entry.packs, productUrl: entry.productUrl });
    latest.prices = (latest.prices || []).concat({ slug: entry.productSlug, ...readPrices(null) });
    latest.index += 1;
    latest.steer = 0;
    await chrome.storage.local.set({ basketRun: latest });

    const next = latest.queue[latest.index];
    if (!next) { await finishRun(latest); return true; }

    await sleep(600);
    location.href = pageUrl(next.productUrl);
    return true;
  }

  // ---- Side panel: state --------------------------------------------------

  const S = { apiUrl: null, weeks: [], weekId: null, list: null, activeKey: null, collapsed: false, skipped: [], msg: '', msgOk: true, busy: false };
  let host = null;
  let root = null;

  async function api(path, opts) {
    const res = await fetch(`${S.apiUrl}${path}`, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  async function loadSaved() {
    const s = await chrome.storage.local.get(['apiUrl', 'selectedBatchId', 'linkingKey', 'panelCollapsed', 'panelSkipped', 'panelCache']);
    S.apiUrl = s.apiUrl || null;
    S.weekId = s.selectedBatchId || null;
    S.activeKey = s.linkingKey || null;
    S.collapsed = !!s.panelCollapsed;
    S.skipped = s.panelSkipped || [];
    if (s.panelCache && s.panelCache.weekId === S.weekId) {
      S.list = s.panelCache.list;
      S.weeks = s.panelCache.weeks || [];
    }
  }

  async function saveCache() {
    await chrome.storage.local.set({
      panelCache: { weekId: S.weekId, weeks: S.weeks, list: S.list },
      unlinkedKeys: (S.list?.unlinked || []).map(u => u.key)
    });
  }

  function setMsg(text, ok = true) { S.msg = text; S.msgOk = ok; }

  async function refresh() {
    if (!S.apiUrl) { render(); return; }
    try {
      S.weeks = await api('/api/weekly-plans');
      if (!S.weeks.some(w => w.id === S.weekId)) {
        const sent = S.weeks.find(w => w.status === 'sent');
        S.weekId = (sent || S.weeks[0] || {}).id || null;
        await chrome.storage.local.set({ selectedBatchId: S.weekId });
      }
      if (S.weekId) {
        const d = await api(`/api/weekly-plan-shopping-list?id=${encodeURIComponent(S.weekId)}`);
        S.list = {
          linked: (d.basket || []).map(b => ({ key: b.ingredientKey, productName: b.productName, productUrl: b.productUrl, productSlug: b.productSlug, items: b.items || [], price: b.price ?? null, nectarPrice: b.nectarPrice ?? null })),
          unlinked: (d.unlinked || []).map(u => ({ key: u.ingredientKey, items: u.items || [] }))
        };
      } else {
        S.list = { linked: [], unlinked: [] };
      }
      await saveCache();
    } catch (err) {
      setMsg(`Couldn't load the list: ${err.message}`, false);
    }
    render();
    injectCardButtons();
  }

  async function setActive(key, go) {
    S.activeKey = key || null;
    await chrome.storage.local.set({ linkingKey: S.activeKey });
    if (go && key) { location.href = searchUrl(key); return; }
    render();
    injectCardButtons();
  }

  // Next unlinked item that isn't the current one, preferring ones not skipped
  function nextKey() {
    const keys = (S.list?.unlinked || []).map(u => u.key).filter(k => k !== S.activeKey);
    return keys.find(k => !S.skipped.includes(k)) || keys[0] || null;
  }

  async function getNext() {
    const key = nextKey();
    if (!key) {
      setMsg('Everything on this list is linked.');
      await setActive(null);
      return;
    }
    setMsg('');
    await setActive(key, true);
  }

  async function skip() {
    if (S.activeKey && !S.skipped.includes(S.activeKey)) S.skipped.push(S.activeKey);
    await chrome.storage.local.set({ panelSkipped: S.skipped });
    await getNext();
  }

  async function alwaysHave() {
    const key = S.activeKey;
    if (!key) return;
    try {
      await api('/api/staples', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemName: key }) });
      S.list.unlinked = S.list.unlinked.filter(u => u.key !== key);
      await saveCache();
      await getNext();
    } catch (err) {
      setMsg(err.message, false);
      render();
    }
  }

  // Fetch every linked product's page in the background and save its price.
  // Same-origin fetch from Sainsbury's, so your Nectar prices come through.
  async function refreshPrices() {
    if (S.busy) return;
    S.busy = true;
    try {
      const links = await api('/api/product-links');
      const slugs = [...new Set(links.map(l => l.product_slug).filter(Boolean))];
      if (!slugs.length) { setMsg('Nothing linked yet.'); return; }
      const found = [];
      for (let i = 0; i < slugs.length; i++) {
        setMsg(`Updating prices ${i + 1} of ${slugs.length}…`);
        render();
        try {
          const html = await fetch(`${SITE}/groceries/product/${slugs[i]}`, { credentials: 'include' }).then(r => r.text());
          const p = readPrices(null, new DOMParser().parseFromString(html, 'text/html'));
          if (p.price != null || p.nectarPrice != null) found.push({ slug: slugs[i], ...p });
        } catch { /* skip this one */ }
        await sleep(400); // be gentle with Sainsbury's
      }
      await sendPrices(S.apiUrl, found);
      for (const l of S.list?.linked || []) {
        const p = found.find(f => f.slug === l.productSlug);
        if (p) { l.price = p.price; l.nectarPrice = p.nectarPrice; }
      }
      await saveCache();
      setMsg(`Updated ${found.length} of ${slugs.length} prices.`, found.length > 0);
    } catch (err) {
      setMsg(`Couldn't update prices: ${err.message}`, false);
    } finally {
      S.busy = false;
      render();
    }
  }

  async function linkProduct({ slug, name, packSize, packUnit, markUsed = false, prices = {} }) {
    const key = S.activeKey;
    if (!key) { setMsg('Pick an item from the list first.', false); render(); return; }
    if (!slug) { setMsg("Couldn't read this product's address.", false); render(); return; }
    if (S.busy) return;
    S.busy = true;
    setMsg('Linking…');
    render();
    try {
      const pack = (packSize && packUnit) ? { size: packSize, unit: packUnit } : guessPack(name);
      const data = await api('/api/product-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredientName: key, productUrl: apiProductUrl(slug), productName: name, packSize: pack.size, packUnit: pack.unit, defaultQty: 1, markUsed, price: prices.price ?? null, nectarPrice: prices.nectarPrice ?? null })
      });
      const L = S.list || { linked: [], unlinked: [] };
      const entry = L.unlinked.find(u => u.key === key) || L.linked.find(l => l.key === key) || { key, items: [] };
      L.unlinked = L.unlinked.filter(u => u.key !== key);
      L.linked = L.linked.filter(l => l.key !== key).concat({ key, items: entry.items, productName: name, productUrl: data.product_url, productSlug: slug, price: prices.price ?? null, nectarPrice: prices.nectarPrice ?? null });
      S.list = L;
      S.skipped = S.skipped.filter(k => k !== key);
      await chrome.storage.local.set({ panelSkipped: S.skipped });
      await saveCache();
      setMsg(`Linked "${key}" to ${name || slug}.`);
    } catch (err) {
      setMsg(err.message, false);
    }
    S.busy = false;
    render();
    injectCardButtons();
  }

  // ---- Side panel: UI -----------------------------------------------------

  const TICK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  const MINIMISE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>';

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }
    .panel { width: 300px; max-height: 72vh; display: flex; flex-direction: column; background: #fff; color: #1F2A1E; border: 1px solid #D5DCD0; border-radius: 14px; box-shadow: 0 10px 30px rgba(0,0,0,.18); overflow: hidden; font-size: 13px; }
    header { display: flex; align-items: center; justify-content: space-between; background: #1B4D3E; color: #fff; padding: 10px 12px; }
    .title { font-weight: 700; font-size: 14px; }
    .icon { background: none; border: 0; color: #fff; cursor: pointer; padding: 2px; display: flex; }
    .body { padding: 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
    select, input { width: 100%; padding: 6px 8px; border: 1px solid #C9D0C2; border-radius: 6px; font-size: 13px; background: #fff; color: inherit; margin-top: 2px; }
    .bar { height: 6px; background: #E6ECE3; border-radius: 99px; overflow: hidden; margin-bottom: 4px; }
    .bar span { display: block; height: 100%; background: #1B4D3E; transition: width .3s; }
    .sub { font-size: 11px; color: #6B7566; display: block; }
    .label { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #6B7566; }
    .key { font-size: 17px; font-weight: 700; color: #1B4D3E; }
    .active { display: flex; flex-direction: column; gap: 6px; background: #F4F8F2; border-radius: 10px; padding: 10px; }
    button { cursor: pointer; border-radius: 8px; font-weight: 700; font-size: 13px; padding: 8px 10px; border: 0; }
    button:disabled { opacity: .5; cursor: default; }
    .primary { background: #1B4D3E; color: #fff; width: 100%; }
    .secondary { background: #fff; color: #1B4D3E; border: 1.5px solid #1B4D3E; flex: 1; }
    .ghost { background: transparent; color: #6B7566; border: 1px solid #C9D0C2; font-weight: 600; }
    .row { display: flex; gap: 6px; }
    .prod { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid #DDE5D8; padding-top: 8px; }
    .pname { font-weight: 600; }
    .pack { display: flex; gap: 6px; }
    .pack label { flex: 1; font-size: 11px; color: #6B7566; }
    .hint { margin: 0; font-size: 12px; color: #4A5546; }
    .msg { font-size: 12px; padding: 6px 8px; border-radius: 6px; }
    .msg.ok { background: #DDEEE4; color: #1B4D3E; }
    .msg.err { background: #F9DEDC; color: #B3261E; }
    details summary { cursor: pointer; font-weight: 700; font-size: 12px; color: #4A5546; padding: 4px 0; }
    ul { list-style: none; margin: 4px 0 0; padding: 0; }
    li { padding: 6px 4px; border-bottom: 1px solid #EEF2EC; cursor: pointer; font-size: 12px; }
    li:hover { background: #F4F8F2; }
    li.on { font-weight: 700; color: #1B4D3E; }
    li.skipped { color: #9AA394; }
    li.done { display: flex; gap: 6px; align-items: flex-start; }
    .tick { color: #1B4D3E; flex: none; margin-top: 1px; }
    li.empty { color: #9AA394; cursor: default; }
    .textbtn { background: none; color: #6B7566; font-weight: 600; font-size: 12px; text-decoration: underline; padding: 0; align-self: flex-start; }
    .pill { background: #1B4D3E; color: #fff; border-radius: 999px; padding: 10px 16px; box-shadow: 0 6px 20px rgba(0,0,0,.2); }
  `;

  function fmtWeek(w) {
    const d = new Date(`${w.week_start_date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    return w.status === 'sent' ? `${d} (sent from phone)` : d;
  }

  function ensurePanel() {
    if (host && host.isConnected) return;
    host = document.createElement('div');
    host.id = 'mp-panel-host';
    host.style.cssText = 'position:fixed;z-index:2147483646;right:16px;bottom:16px;';
    root = host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);
  }

  function removePanel() {
    host?.remove();
    host = null;
    root = null;
    document.querySelectorAll('.mp-link-btn').forEach(b => b.remove());
  }

  function render() {
    if (!root) return;
    if (!S.apiUrl) {
      root.innerHTML = `<style>${CSS}</style><div class="panel"><header><span class="title">Meal planner</span></header><div class="body"><p class="hint">Open the extension popup and set the API URL first.</p></div></div>`;
      return;
    }
    const L = S.list || { linked: [], unlinked: [] };
    const done = L.linked.length;
    const total = done + L.unlinked.length;

    if (S.collapsed) {
      root.innerHTML = `<style>${CSS}</style><button class="pill" data-a="expand">Meal planner &middot; ${done}/${total} linked</button>`;
      bind();
      return;
    }

    const active = S.activeKey
      ? (L.unlinked.find(u => u.key === S.activeKey) || L.linked.find(l => l.key === S.activeKey) || { key: S.activeKey, items: [] })
      : null;
    const slug = productSlug();
    const linkedHere = slug ? L.linked.find(l => l.productSlug === slug) : null;

    let activeHtml;
    if (active) {
      let action;
      if (slug) {
        const name = productName();
        const p = guessPack(name);
        action = `<div class="prod">
            <div class="pname">${esc(name || slug)}</div>
            ${(() => { const pr = readPrices(null); return (pr.price != null || pr.nectarPrice != null) ? `<span class="sub">${esc(priceLabel(pr))}</span>` : ''; })()}
            ${linkedHere ? `<span class="sub">Currently linked to "${esc(linkedHere.key)}"</span>` : ''}
            <div class="pack">
              <label>Pack size<input id="ps" type="number" step="any" value="${esc(p.size)}"></label>
              <label>Unit<select id="pu">${['g', 'ml', 'each'].map(u => `<option${u === p.unit ? ' selected' : ''}>${u}</option>`).join('')}</select></label>
            </div>
            <button class="primary" data-a="link-page"${S.busy ? ' disabled' : ''}>Link to "${esc(active.key)}"</button>
          </div>`;
      } else if (isSearchPage()) {
        action = '<p class="hint">Click <b>Link this</b> under the product you want, or just <b>Add</b> it to your basket.</p>';
      } else {
        action = '<button class="primary" data-a="search">Search Sainsbury\'s for it</button>';
      }
      const showItems = active.items.length && !(active.items.length === 1 && active.items[0].toLowerCase() === active.key);
      activeHtml = `<div class="label">Now finding</div>
        <div class="key">${esc(active.key)}</div>
        ${showItems ? `<span class="sub">for: ${esc(active.items.join(', '))}</span>` : ''}
        ${action}
        <div class="row">
          <button class="secondary" data-a="next">Get next</button>
          <button class="ghost" data-a="skip">Skip</button>
          <button class="ghost" data-a="always" title="Always in the cupboard - leave off future lists">Always have</button>
        </div>`;
    } else if (L.unlinked.length) {
      activeHtml = `<button class="primary" data-a="next">Start linking (${L.unlinked.length} to go)</button>`;
    } else {
      activeHtml = '<p class="hint">Everything on this list is linked. Use <b>Add all to basket</b> in the extension popup.</p>';
    }

    const weekOpts = S.weeks.map(w => `<option value="${esc(w.id)}"${w.id === S.weekId ? ' selected' : ''}>${esc(fmtWeek(w))}</option>`).join('');
    const todo = L.unlinked.map(u =>
      `<li class="todo${u.key === S.activeKey ? ' on' : ''}${S.skipped.includes(u.key) ? ' skipped' : ''}" data-key="${esc(u.key)}">${esc(u.key)}${S.skipped.includes(u.key) ? ' <span class="sub" style="display:inline">(skipped)</span>' : ''}</li>`).join('');
    const linked = L.linked.map(l =>
      `<li class="done" data-url="${esc(l.productUrl || '')}"><span class="tick">${TICK}</span><span><span>${esc(l.key)}</span><span class="sub">${esc(l.productName || '')}${(l.price != null || l.nectarPrice != null) ? ` · ${esc(priceLabel(l))}` : ''}</span></span></li>`).join('');

    root.innerHTML = `<style>${CSS}</style>
      <div class="panel">
        <header><span class="title">Meal planner</span><button class="icon" data-a="collapse" title="Minimise">${MINIMISE}</button></header>
        <div class="body">
          ${S.weeks.length > 1 ? `<select id="week">${weekOpts}</select>` : ''}
          <div><div class="bar"><span style="width:${total ? Math.round(done / total * 100) : 0}%"></span></div><span class="sub">${done} of ${total} linked</span></div>
          <div class="active">${activeHtml}</div>
          ${S.msg ? `<div class="msg ${S.msgOk ? 'ok' : 'err'}">${esc(S.msg)}</div>` : ''}
          <details${!S.activeKey && L.unlinked.length ? ' open' : ''}><summary>Needs linking (${L.unlinked.length})</summary><ul>${todo || '<li class="empty">Nothing left</li>'}</ul></details>
          <details><summary>Linked (${L.linked.length})</summary><ul>${linked || '<li class="empty">None yet</li>'}</ul></details>
          <div class="row" style="gap:14px">
            <button class="textbtn" data-a="refresh">Refresh list</button>
            <button class="textbtn" data-a="prices"${S.busy ? ' disabled' : ''}>Update prices</button>
          </div>
        </div>
      </div>`;
    bind();
  }

  function bind() {
    root.querySelectorAll('[data-a]').forEach(el => el.addEventListener('click', async e => {
      e.preventDefault();
      const a = el.dataset.a;
      if (a === 'expand' || a === 'collapse') {
        S.collapsed = a === 'collapse';
        await chrome.storage.local.set({ panelCollapsed: S.collapsed });
        render();
        return;
      }
      if (a === 'next') return getNext();
      if (a === 'skip') return skip();
      if (a === 'always') return alwaysHave();
      if (a === 'search') { location.href = searchUrl(S.activeKey); return; }
      if (a === 'refresh') { setMsg(''); return refresh(); }
      if (a === 'prices') return refreshPrices();
      if (a === 'link-page') {
        return linkProduct({
          slug: productSlug(),
          name: productName(),
          packSize: Number(root.getElementById('ps')?.value) || null,
          packUnit: root.getElementById('pu')?.value,
          prices: readPrices(null)
        });
      }
    }));
    root.querySelectorAll('li.todo').forEach(li => li.addEventListener('click', () => { setMsg(''); setActive(li.dataset.key, true); }));
    root.querySelectorAll('li.done').forEach(li => li.addEventListener('click', () => { if (li.dataset.url) location.href = pageUrl(li.dataset.url); }));
    const wk = root.getElementById('week');
    if (wk) wk.addEventListener('change', async () => {
      S.weekId = wk.value;
      S.skipped = [];
      setMsg('');
      await chrome.storage.local.set({ selectedBatchId: S.weekId, panelSkipped: [] });
      refresh();
    });
  }

  // "Link this" button under every product card while an item is active
  function injectCardButtons() {
    if (!root || !S.activeKey) {
      document.querySelectorAll('.mp-link-btn').forEach(b => b.remove());
      return;
    }
    document.querySelectorAll(CARD).forEach(card => {
      const info = tileInfo(card);
      if (!info) return;
      let btn = card.querySelector('.mp-link-btn');
      if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mp-link-btn';
        btn.style.cssText = 'display:block;width:calc(100% - 16px);margin:8px;padding:8px;border:2px solid #1B4D3E;background:#fff;color:#1B4D3E;border-radius:6px;font:700 13px/1.2 -apple-system,"Segoe UI",sans-serif;cursor:pointer;';
        btn.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          const i = tileInfo(card);
          if (i) linkProduct({ slug: i.slug, name: i.name, prices: readPrices(card) });
        }, true);
        card.appendChild(btn);
      }
      const isLinked = !!S.list?.linked.find(l => l.key === S.activeKey && l.productSlug === info.slug);
      const label = isLinked ? `Linked to ${S.activeKey}` : `Link this to ${S.activeKey}`;
      if (btn.textContent !== label) btn.textContent = label; // only touch the DOM on change (MutationObserver)
    });
  }

  // Clicking Add on a search result while an item is active links it too
  document.addEventListener('click', async e => {
    const btn = e.target.closest && e.target.closest(ADD_SELECTORS.join(','));
    if (!btn || !S.activeKey || !root) return;
    if (await getRun()) return; // basket runs stamp last_used_at themselves
    const card = btn.closest(CARD);
    if (card && isSearchPage()) {
      const i = tileInfo(card);
      // Read prices now: once Add is clicked the card swaps to the quantity stepper
      const prices = readPrices(card);
      if (i) setTimeout(() => linkProduct({ slug: i.slug, name: i.name, markUsed: true, prices }), 300);
    } else if (!card && productSlug()) {
      const prices = readPrices(null);
      setTimeout(() => linkProduct({
        slug: productSlug(),
        name: productName(),
        packSize: Number(root?.getElementById('ps')?.value) || null,
        packUnit: root?.getElementById('pu')?.value,
        markUsed: true,
        prices
      }), 300);
    }
  }, true);

  // Keep in step with the popup (week picked, "Find" pressed, API URL set)
  chrome.storage.onChanged.addListener(changes => {
    if (!root) return;
    if (changes.apiUrl && changes.apiUrl.newValue !== S.apiUrl) { S.apiUrl = changes.apiUrl.newValue; refresh(); }
    if (changes.selectedBatchId && changes.selectedBatchId.newValue !== S.weekId) { S.weekId = changes.selectedBatchId.newValue; refresh(); }
    if (changes.linkingKey && (changes.linkingKey.newValue || null) !== S.activeKey) {
      S.activeKey = changes.linkingKey.newValue || null;
      render();
      injectCardButtons();
    }
  });

  // Results re-render as you scroll and filter: re-add buttons (throttled),
  // and re-attach the panel if the page wiped it.
  let injectTimer = null;
  new MutationObserver(() => {
    if (injectTimer) return;
    injectTimer = setTimeout(() => {
      injectTimer = null;
      if (root && host && !host.isConnected) document.body.appendChild(host);
      injectCardButtons();
    }, 400);
  }).observe(document.documentElement, { childList: true, subtree: true });

  // ---- Routing (SPA-aware) ------------------------------------------------

  let lastPath = null;
  let busy = false;
  let pending = false;

  async function onRoute() {
    if (busy) { pending = true; return; } // handle again once current pass ends
    busy = true;
    try {
      await sleep(800); // let the SPA render before acting
      if (await handleRun()) { removePanel(); return; }
      await loadSaved();
      ensurePanel();
      render();
      if (productSlug()) {
        await waitFor(() => productName(), 5000);
        render();
        // Visiting a linked product quietly refreshes its saved price
        const slug = productSlug();
        if ((S.list?.linked || []).some(l => l.productSlug === slug)) {
          const pr = await waitFor(() => { const p = readPrices(null); return (p.price != null || p.nectarPrice != null) ? p : null; }, 4000);
          if (pr) sendPrices(S.apiUrl, [{ slug, ...pr }]);
        }
      }
      injectCardButtons();
      refresh(); // background: cached list shows instantly, fresh one replaces it
    } finally {
      busy = false;
      if (pending) { pending = false; onRoute(); }
    }
  }

  setInterval(() => {
    if (location.pathname + location.search !== lastPath) {
      lastPath = location.pathname + location.search;
      onRoute();
    }
  }, 500);
})();
