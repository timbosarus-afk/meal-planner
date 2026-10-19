// Runs on every Sainsbury's gol-ui page (the site is a SPA, so clicking from
// search results into a product doesn't trigger a fresh content-script
// injection — we watch the URL ourselves instead).
//
// Two jobs, only ever one at a time:
//
// 1. BASKET RUN. If the popup has started a run and this tab is on the
//    product the queue is waiting for, click Add, bump the quantity to the
//    number of packs needed, record the result, then navigate to the next
//    product. If the product is already in the basket we SKIP it rather
//    than adding more on top, so re-running a batch never doubles up.
//
// 2. LINK PANEL. On any other product page, show a small floating panel to
//    link this product to an ingredient from the current list. Pack size is
//    guessed from the product title and is editable before saving.

(() => {
  if (window.__mealPlannerProductScript) return;
  window.__mealPlannerProductScript = true;

  const ADD_SELECTORS = ['[data-testid="add-button"]', 'button[aria-label^="Add" i][aria-label*="basket" i]'];
  // Selectors for the + button once a product is in the basket. Sainsbury's
  // has changed these before, so several candidates — this is the bit most
  // likely to need tuning after the first real test.
  const INC_SELECTORS = [
    '[data-testid="pt-button-inc"]',
    '[data-testid="quantity-increment"]',
    'button[aria-label*="increase" i]',
    'button[aria-label*="add one" i]',
    'button[aria-label*="one more" i]'
  ];
  const QTY_SELECTORS = ['[data-testid="pt-quantity"]', '[data-testid="quantity"]', 'input[aria-label*="quantity" i]'];

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const productSlug = () => (location.pathname.match(/\/gol-ui\/product\/([^/?#]+)/) || [])[1] || null;

  function findFirst(selectors, root = document) {
    for (const sel of selectors) {
      const el = [...root.querySelectorAll(sel)].find(e => e.offsetParent !== null && !e.disabled);
      if (el) return el;
    }
    return null;
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

  function readQty(root = document) {
    const el = findFirst(QTY_SELECTORS, root);
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
    const h1 = document.querySelector('[data-testid="pd-product-title"], h1');
    return h1 ? h1.textContent.trim() : '';
  }

  // "Sainsbury's Red Onions x3" -> 3 each, "Whole Milk 2.27L" -> 2270 ml,
  // "Beef Mince 5% Fat 500g" -> 500 g, "Eggs 6 pack" -> 6 each.
  function guessPack(name) {
    const s = name.toLowerCase();
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
      el.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#1B4D3E;color:#fff;font:600 13px/1.3 -apple-system,sans-serif;padding:10px 14px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.25);display:flex;gap:10px;align-items:center;';
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

  // The main product's buy box. Scoping to it stops "+" buttons in the
  // "you might also like" carousel being mistaken for ours.
  function buyBox() {
    return document.querySelector('[data-testid="pd-buy-box"], [data-testid="pd-add-to-trolley"], [data-testid="product-details"], main') || document;
  }

  async function addCurrentProduct(entry) {
    // Give the page a few seconds to render the Add button before deciding
    // the product is already in the basket (stepper showing instead).
    const addBtn = await waitFor(() => findFirst(ADD_SELECTORS, buyBox()), 4000);
    if (!addBtn) {
      if (findFirst(INC_SELECTORS, buyBox())) return { status: 'skipped', note: 'Already in basket' };
      const late = await waitFor(() => findFirst(ADD_SELECTORS, buyBox()), 11000);
      if (!late) return { status: 'failed', note: 'No Add button (out of stock or page changed)' };
      return clickAndBump(late, entry);
    }
    return clickAndBump(addBtn, entry);
  }

  async function clickAndBump(addBtn, entry) {
    // Remember where the button lives: the stepper replaces it in place
    const area = addBtn.closest('[data-testid*="product"], [class*="product"]') || addBtn.parentElement?.parentElement || buyBox();
    addBtn.click();
    let added = 1;

    for (let i = 1; i < entry.packs; i++) {
      const inc = await waitFor(() => findFirst(INC_SELECTORS, area) || findFirst(INC_SELECTORS, buyBox()), 8000);
      if (!inc) return { status: 'partial', note: `Added ${added} of ${entry.packs}, couldn't find + button`, added };
      await sleep(700); // let the previous basket update land first
      inc.click();
      added++;
    }

    await sleep(900);
    const qty = readQty(area) ?? readQty(buyBox());
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

    const usedIds = run.results.filter(r => r.status === 'added' || r.status === 'partial').map(r => r.linkId);
    if (run.apiUrl && usedIds.length) {
      fetch(`${run.apiUrl}/api/product-links`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: usedIds })
      }).catch(() => {});
    }
  }

  async function handleRun() {
    const run = await getRun();
    if (!run) return false;

    const entry = run.queue[run.index];
    if (!entry) { await finishRun(run); return true; }

    // Only act on the product the queue expects; anything else, steer back.
    if (productSlug() !== entry.productSlug) {
      showRunBanner(`Basket run: heading to ${entry.productName || entry.ingredientKey}…`);
      location.href = entry.productUrl;
      return true;
    }

    showRunBanner(`Adding ${run.index + 1}/${run.queue.length}: ${entry.productName || entry.ingredientKey} x${entry.packs}`);
    const result = await addCurrentProduct(entry);

    // Re-read in case Stop was pressed while we were working
    const latest = await getRun();
    if (!latest) return true;

    latest.results.push({ ...result, linkId: entry.linkId, ingredientKey: entry.ingredientKey, productName: entry.productName, packs: entry.packs, productUrl: entry.productUrl });
    latest.index += 1;
    await chrome.storage.local.set({ basketRun: latest });

    const next = latest.queue[latest.index];
    if (!next) { await finishRun(latest); return true; }

    await sleep(600);
    location.href = next.productUrl;
    return true;
  }

  // ---- Link panel ---------------------------------------------------------

  function removePanel() {
    document.getElementById('mp-link-panel')?.remove();
  }

  async function showLinkPanel() {
    removePanel();
    const { apiUrl, unlinkedKeys = [], linkingKey, linkPanelCollapsed } = await chrome.storage.local.get(['apiUrl', 'unlinkedKeys', 'linkingKey', 'linkPanelCollapsed']);
    if (!apiUrl) return;

    const name = productName();
    const pack = guessPack(name);
    const slug = productSlug();

    const panel = document.createElement('div');
    panel.id = 'mp-link-panel';
    panel.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;width:280px;background:#FFF8F0;color:#1F2A1E;border:2px solid #1B4D3E;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.2);font:13px/1.35 -apple-system,sans-serif;';

    const header = document.createElement('div');
    header.style.cssText = 'background:#1B4D3E;color:#fff;padding:8px 10px;font-weight:700;display:flex;justify-content:space-between;align-items:center;border-radius:9px 9px 0 0;cursor:pointer;';
    header.innerHTML = '<span>🔗 Link to meal planner</span><span id="mp-toggle"></span>';
    panel.appendChild(header);

    const body = document.createElement('div');
    body.style.cssText = 'padding:10px;display:flex;flex-direction:column;gap:8px;';

    const prod = document.createElement('div');
    prod.style.cssText = 'font-weight:600;';
    prod.textContent = name || slug;
    body.appendChild(prod);

    // Ingredient picker: unlinked items from the current list, plus free text
    const ingLabel = document.createElement('label');
    ingLabel.textContent = 'Ingredient';
    ingLabel.style.cssText = 'font-size:11px;color:#6B7566;';
    const ingInput = document.createElement('input');
    ingInput.setAttribute('list', 'mp-unlinked');
    ingInput.placeholder = 'e.g. red onion';
    ingInput.value = linkingKey || '';
    ingInput.style.cssText = 'width:100%;box-sizing:border-box;padding:6px;border:1px solid #C9D0C2;border-radius:6px;font-size:13px;';
    const dl = document.createElement('datalist');
    dl.id = 'mp-unlinked';
    unlinkedKeys.forEach(k => { const o = document.createElement('option'); o.value = k; dl.appendChild(o); });
    ingLabel.append(ingInput, dl);
    body.appendChild(ingLabel);

    const packRow = document.createElement('div');
    packRow.style.cssText = 'display:flex;gap:6px;align-items:end;';
    packRow.innerHTML = `
      <label style="font-size:11px;color:#6B7566;flex:1">Pack size
        <input id="mp-pack-size" type="number" step="any" value="${pack.size}" style="width:100%;box-sizing:border-box;padding:6px;border:1px solid #C9D0C2;border-radius:6px;font-size:13px;">
      </label>
      <label style="font-size:11px;color:#6B7566;flex:1">Unit
        <select id="mp-pack-unit" style="width:100%;padding:6px;border:1px solid #C9D0C2;border-radius:6px;font-size:13px;">
          <option value="g">g</option><option value="ml">ml</option><option value="each">each</option>
        </select>
      </label>
      <label style="font-size:11px;color:#6B7566;width:62px" title="Packs to add when the recipe amount can't be compared (e.g. '2 cloves')">Default
        <input id="mp-default-qty" type="number" min="1" value="1" style="width:100%;box-sizing:border-box;padding:6px;border:1px solid #C9D0C2;border-radius:6px;font-size:13px;">
      </label>`;
    body.appendChild(packRow);

    const save = document.createElement('button');
    save.textContent = 'Save link';
    save.style.cssText = 'background:#1B4D3E;color:#fff;border:0;border-radius:8px;padding:8px;font-weight:700;cursor:pointer;font-size:13px;';
    const status = document.createElement('div');
    status.style.cssText = 'font-size:12px;color:#6B7566;min-height:16px;';
    body.append(save, status);
    panel.appendChild(body);
    document.body.appendChild(panel);
    panel.querySelector('#mp-pack-unit').value = pack.unit;

    const setCollapsed = (c) => {
      body.style.display = c ? 'none' : 'flex';
      panel.querySelector('#mp-toggle').textContent = c ? '▴' : '▾';
      panel.style.width = c ? 'auto' : '280px';
    };
    // Auto-expand when we arrived here from "Find" in the popup
    setCollapsed(linkingKey ? false : !!linkPanelCollapsed);
    header.onclick = async () => {
      const c = body.style.display !== 'none';
      setCollapsed(c);
      await chrome.storage.local.set({ linkPanelCollapsed: c });
    };

    save.onclick = async () => {
      const ingredientName = ingInput.value.trim();
      if (!ingredientName) { status.textContent = 'Pick or type an ingredient first.'; return; }
      save.disabled = true;
      status.textContent = 'Saving…';
      try {
        const res = await fetch(`${apiUrl}/api/product-links`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ingredientName,
            productUrl: location.href,
            productName: name,
            packSize: panel.querySelector('#mp-pack-size').value,
            packUnit: panel.querySelector('#mp-pack-unit').value,
            defaultQty: panel.querySelector('#mp-default-qty').value
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Save failed');

        const { unlinkedKeys: keys = [] } = await chrome.storage.local.get('unlinkedKeys');
        await chrome.storage.local.set({
          unlinkedKeys: keys.filter(k => k !== data.ingredient_key),
          linkingKey: null
        });
        status.style.color = '#1B4D3E';
        status.textContent = `✓ Linked to "${data.ingredient_key}"`;
      } catch (err) {
        status.style.color = '#B3261E';
        status.textContent = err.message;
      } finally {
        save.disabled = false;
      }
    };
  }

  // ---- Routing (SPA-aware) ------------------------------------------------

  let lastPath = null;
  let busy = false;
  let pending = false;

  async function onRoute() {
    if (busy) { pending = true; return; } // handle again once current pass ends
    busy = true;
    try {
      // Wait for the SPA to render something product-ish before acting
      await sleep(800);
      if (await handleRun()) { removePanel(); return; }
      if (productSlug()) await showLinkPanel();
      else removePanel();
    } finally {
      busy = false;
      if (pending) { pending = false; onRoute(); }
    }
  }

  setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      onRoute();
    }
  }, 500);
})();
