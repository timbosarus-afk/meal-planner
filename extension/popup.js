// v0.7: Sainsbury's moved to /groceries/. Linking now happens in the side
// panel on Sainsbury's itself ("Get next" / "Link this"); "Find" here still
// works and opens the panel on that item.
//
// v0.6: weeks (weekly_plans). A week sent from the phone is preselected; a
// finished basket run marks it ordered. Adding a product yourself auto-links it.
//
// v0.5: batch-based. Pick a batch, see which items are linked to a known
// Sainsbury's product (ready to add) and which still need linking.
//
// "Add all to basket" hands a queue to product.js, which walks the shopping
// tab through each product page, clicks Add and bumps the quantity. State
// lives in chrome.storage.local, so the popup closing mid-run is fine.

const $ = id => document.getElementById(id);
const apiUrlInput = $('apiUrl');
const statusEl = $('status');
const batchSelect = $('batchSelect');

let currentList = null;

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

async function getApiUrl() {
  const { apiUrl } = await chrome.storage.local.get('apiUrl');
  if (apiUrl) apiUrlInput.value = apiUrl;
  return apiUrl || null;
}

apiUrlInput.addEventListener('change', async () => {
  const url = apiUrlInput.value.trim().replace(/\/$/, '');
  await chrome.storage.local.set({ apiUrl: url });
  loadBatches();
});

// Reuse one dedicated shopping tab (same as v0.4)
async function openInShoppingTab(url) {
  url = String(url || '').replace('/gol-ui/product/', '/groceries/product/');
  const { shoppingTabId } = await chrome.storage.local.get('shoppingTabId');
  if (shoppingTabId) {
    try { await chrome.tabs.update(shoppingTabId, { url, active: true }); return; } catch { /* closed */ }
  }
  const tab = await chrome.tabs.create({ url });
  await chrome.storage.local.set({ shoppingTabId: tab.id });
}

// ---- Batches --------------------------------------------------------------

async function loadBatches() {
  const apiUrl = await getApiUrl();
  if (!apiUrl) { batchSelect.innerHTML = '<option>Set the API URL first</option>'; return; }

  try {
    const res = await fetch(`${apiUrl}/api/weekly-plans`);
    const batches = await res.json();
    if (!res.ok) throw new Error(batches.error || 'Failed to load batches');
    if (!batches.length) { batchSelect.innerHTML = '<option>No batches yet</option>'; return; }

    const { selectedBatchId } = await chrome.storage.local.get('selectedBatchId');
    batchSelect.innerHTML = batches.map(b => {
      const d = new Date(b.week_start_date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
      const st = b.status === 'sent' ? 'sent from phone' : b.status;
      return `<option value="${b.id}">${escapeHtml(d)} · ${escapeHtml(st)}</option>`;
    }).join('');
    // A week sent from the phone ("Send to Sainsbury's") wins; else last pick
    const sent = batches.find(b => b.status === 'sent');
    batchSelect.value = sent ? sent.id : (batches.some(b => b.id === selectedBatchId) ? selectedBatchId : batches[0].id);
    if (sent) await chrome.storage.local.set({ selectedBatchId: sent.id });
    loadList();
  } catch (err) {
    statusEl.textContent = `Could not reach the API: ${err.message}`;
  }
}

batchSelect.addEventListener('change', async () => {
  await chrome.storage.local.set({ selectedBatchId: batchSelect.value });
  loadList();
});

// ---- Shopping list --------------------------------------------------------

async function loadList() {
  const apiUrl = await getApiUrl();
  const id = batchSelect.value;
  if (!apiUrl || !id) return;

  statusEl.textContent = 'Loading list…';
  try {
    const res = await fetch(`${apiUrl}/api/weekly-plan-shopping-list?id=${encodeURIComponent(id)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    if (!data.basket) throw new Error('API is on an older version (no basket data) - deploy first');

    currentList = data;
    await chrome.storage.local.set({ unlinkedKeys: data.unlinked.map(u => u.ingredientKey) });
    renderBasket(data.basket);
    renderUnlinked(data.unlinked);
    $('syncBtn').disabled = false;
    $('syncPlan').innerHTML = '';
    statusEl.textContent = '';
  } catch (err) {
    statusEl.textContent = err.message;
  }
}

function renderBasket(basket) {
  $('basketCount').textContent = basket.length ? `${basket.length}` : '';
  $('addAllBtn').disabled = !basket.length;
  if (!basket.length) {
    $('basketList').innerHTML = '<div class="empty">Nothing linked yet. Link a few items below and they\'ll show up here next time.</div>';
    return;
  }
  $('basketList').innerHTML = basket.map((b, i) => `
    <div class="row">
      <div class="main">
        <div><span class="packs">${b.packs}×</span> ${escapeHtml(b.productName || b.ingredientKey)}</div>
        <div class="sub">for: ${escapeHtml(b.items.join(', '))}</div>
      </div>
      <button class="ghost view-btn" data-idx="${i}" title="Open product page (re-link from there if it's wrong)">View</button>
    </div>`).join('');

  $('basketList').querySelectorAll('.view-btn').forEach(btn => btn.addEventListener('click', () => {
    openInShoppingTab(basket[btn.dataset.idx].productUrl);
  }));
}

function renderUnlinked(unlinked) {
  $('unlinkedCount').textContent = unlinked.length ? `${unlinked.length}` : '';
  if (!unlinked.length) {
    $('unlinkedList').innerHTML = '<div class="empty">Everything on this list is linked.</div>';
    return;
  }
  $('unlinkedList').innerHTML = unlinked.map((u, i) => `
    <div class="row" id="u-${i}">
      <div class="main">
        <div>${escapeHtml(u.ingredientKey)}</div>
        ${u.items.length > 1 || u.items[0].toLowerCase() !== u.ingredientKey ? `<div class="sub">${escapeHtml(u.items.join(', '))}</div>` : ''}
      </div>
      <button class="find-btn" data-idx="${i}">Find</button>
      <button class="ghost staple-btn" data-idx="${i}" title="Always have this - exclude from future lists">Always have</button>
    </div>`).join('');

  $('unlinkedList').querySelectorAll('.find-btn').forEach(btn => btn.addEventListener('click', async () => {
    const key = unlinked[btn.dataset.idx].ingredientKey;
    await chrome.storage.local.set({ linkingKey: key, selectedBatchId: batchSelect.value });
    await openInShoppingTab(`https://www.sainsburys.co.uk/groceries/search?searchTerm=${encodeURIComponent(key)}`);
  }));

  $('unlinkedList').querySelectorAll('.staple-btn').forEach(btn => btn.addEventListener('click', async () => {
    const apiUrl = await getApiUrl();
    const key = unlinked[btn.dataset.idx].ingredientKey;
    try {
      await fetch(`${apiUrl}/api/staples`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemName: key })
      });
      const row = $(`u-${btn.dataset.idx}`);
      row.style.opacity = '0.3';
      row.querySelectorAll('button').forEach(b => b.disabled = true);
    } catch (err) {
      statusEl.textContent = `Couldn't save staple: ${err.message}`;
    }
  }));
}

// ---- Sync basket ----------------------------------------------------------
// Compares the live Sainsbury's trolley with this week's list. Checking is
// read-only; nothing changes until you tick things and press Apply. Only
// products you've linked are ever touched, and removals are always ticked by hand.

const TROLLEY_URL = 'https://www.sainsburys.co.uk/gol-ui/trolley';
let syncState = null;

async function tabIsTrolley(tabId) {
  try { const t = await chrome.tabs.get(tabId); return /\/(?:gol-ui|groceries)\/trolley/.test(t.url || ''); } catch { return false; }
}

async function askTrolley(message) {
  // Make sure the shopping tab is on the trolley, then retry while the page script wakes up
  const { shoppingTabId } = await chrome.storage.local.get('shoppingTabId');
  let tabId = shoppingTabId;
  let onTrolley = tabId ? await tabIsTrolley(tabId) : false;
  if (!onTrolley) {
    await openInShoppingTab(TROLLEY_URL);
    tabId = (await chrome.storage.local.get('shoppingTabId')).shoppingTabId;
    await new Promise(r => setTimeout(r, 2500));
  }
  let lastErr = 'No answer from the trolley page';
  for (let i = 0; i < 12; i++) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, message);
      if (res && res.ok) return res;
      lastErr = (res && res.error) || lastErr;
    } catch (e) { lastErr = 'Trolley page not ready (sign in to Sainsbury\'s if it asks)'; }
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error(lastErr);
}

$('syncBtn').addEventListener('click', async () => {
  if (!currentList) return;
  const apiUrl = await getApiUrl();
  $('syncBtn').disabled = true;
  $('syncPlan').innerHTML = '<div class="empty">Reading your trolley…</div>';
  try {
    const [trolleyRes, linksRes] = await Promise.all([
      askTrolley({ type: 'mp-read-trolley' }),
      fetch(`${apiUrl}/api/product-links`).then(r => r.json())
    ]);
    const plan = syncPlan.computePlan({ basket: currentList.basket, allLinks: Array.isArray(linksRes) ? linksRes : [], trolley: trolleyRes.rows });
    syncState = { plan, rows: trolleyRes.rows };
    renderSyncPlan();
  } catch (err) {
    $('syncPlan').innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
  }
  $('syncBtn').disabled = false;
});

function renderSyncPlan(extraHtml = '') {
  const { plan } = syncState;
  const row = (kind, i, label, sub, checked) => `
    <label><input type="checkbox" data-kind="${kind}" data-i="${i}" ${checked ? 'checked' : ''}>
      <span>${label}${sub ? `<div class="note">${sub}</div>` : ''}</span></label>`;
  const fixes = [
    ...plan.add.map((p, i) => row('add', i, `Add ${p.want} x ${escapeHtml(p.name || p.key)}`, `for: ${escapeHtml(p.entry.items.join(', '))}`, true)),
    ...plan.more.map((p, i) => row('more', i, `${escapeHtml(p.name)}: ${p.have} → ${p.want}`, 'add more', true)),
    ...plan.fewer.map((p, i) => row('fewer', i, `${escapeHtml(p.name)}: ${p.have} → ${p.want}`, 'trolley has more than needed', true))
  ];
  const extras = plan.extras.map((e, i) => row('extra', i, `Remove ${e.have} x ${escapeHtml(e.name)}`, 'linked product, not on this week\'s list', false));
  const nothing = !fixes.length && !extras.length;
  $('syncPlan').innerHTML = `
    <div class="note" style="margin-top:6px">${plan.ok.length} already right${plan.ignored.length ? `, ${plan.ignored.length} other trolley item${plan.ignored.length > 1 ? 's' : ''} left alone` : ''}</div>
    ${fixes.length ? `<h3>Fixes</h3>${fixes.join('')}` : ''}
    ${extras.length ? `<h3>Not on this week's list (ticked ones are removed)</h3>${extras.join('')}` : ''}
    ${nothing ? '<div class="empty">Your trolley already matches this week.</div>' : '<button id="syncApplyBtn">Apply ticked changes</button>'}
    ${extraHtml}`;
  const btn = $('syncApplyBtn');
  if (btn) btn.onclick = applySync;
}

async function applySync() {
  const { plan } = syncState;
  const ticked = kind => [...$('syncPlan').querySelectorAll(`input[data-kind="${kind}"]`)].filter(c => c.checked).map(c => Number(c.dataset.i));
  const filtered = {
    ...plan,
    more: ticked('more').map(i => plan.more[i]),
    fewer: ticked('fewer').map(i => plan.fewer[i])
  };
  const removeNames = ticked('extra').map(i => plan.extras[i].name);
  const adjustments = syncPlan.trolleyAdjustments(filtered, removeNames);
  const toAdd = ticked('add').map(i => plan.add[i]);

  $('syncApplyBtn').disabled = true;
  $('syncPlan').insertAdjacentHTML('beforeend', '<div class="empty" id="syncBusy">Working on your trolley… leave the Sainsbury\'s tab alone.</div>');
  try {
    let failed = [];
    if (adjustments.length) {
      const res = await askTrolley({ type: 'mp-adjust-trolley', adjustments });
      failed = res.results.filter(r => r.status === 'failed');
    }
    if (toAdd.length) {
      // Missing products go through the normal basket run (opens each product and adds it)
      const apiUrl = await getApiUrl();
      const queue = toAdd.map(p => ({ linkId: p.entry.linkId, ingredientKey: p.entry.ingredientKey, productUrl: p.entry.productUrl, productSlug: p.entry.productSlug, productName: p.entry.productName, packs: p.want }));
      await chrome.storage.local.set({ basketRun: { active: true, queue, index: 0, results: [], apiUrl, batchId: batchSelect.value, startedAt: Date.now() } });
      await openInShoppingTab(queue[0].productUrl);
      $('syncPlan').innerHTML = `<div class="empty">Quantities fixed${failed.length ? ` (${failed.length} couldn't be changed)` : ''}. Adding ${queue.length} missing item${queue.length > 1 ? 's' : ''} now: watch the Sainsbury's tab.</div>`;
      return;
    }
    $('syncPlan').innerHTML = `<div class="empty">Done${failed.length ? `, but ${failed.length} couldn't be changed: ${failed.map(f => escapeHtml(f.name)).join(', ')}` : ''}. Press Check again to confirm.</div>`;
  } catch (err) {
    $('syncPlan').innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
  }
}

// ---- Basket run -----------------------------------------------------------

$('addAllBtn').addEventListener('click', async () => {
  if (!currentList?.basket?.length) return;
  const apiUrl = await getApiUrl();
  const queue = currentList.basket.map(b => ({
    linkId: b.linkId,
    ingredientKey: b.ingredientKey,
    productUrl: b.productUrl,
    productSlug: b.productSlug,
    productName: b.productName,
    packs: b.packs
  }));
  await chrome.storage.local.set({
    basketRun: { active: true, queue, index: 0, results: [], apiUrl, batchId: batchSelect.value, startedAt: Date.now() }
  });
  await openInShoppingTab(queue[0].productUrl);
});

async function renderRun() {
  const { basketRun: run } = await chrome.storage.local.get('basketRun');
  const el = $('runSection');
  if (!run) { el.innerHTML = ''; return; }

  if (run.active) {
    el.innerHTML = `
      <h2><span>Adding to basket</span><span>${run.index}/${run.queue.length}</span></h2>
      <button class="danger" id="stopRunBtn">Stop</button>`;
    $('stopRunBtn').onclick = async () => {
      run.active = false; run.stopped = true; run.finishedAt = Date.now();
      await chrome.storage.local.set({ basketRun: run });
      renderRun();
    };
    return;
  }

  const added = run.results.filter(r => r.status === 'added').length;
  const issues = run.results.filter(r => r.status !== 'added');
  const notReached = run.queue.length - run.results.length;
  el.innerHTML = `
    <h2><span>Last run${run.stopped ? ' (stopped)' : ''}</span><span>${added}/${run.queue.length} added</span></h2>
    ${issues.map((r, i) => `
      <div class="row">
        <div class="main">
          <div>${escapeHtml(r.productName || r.ingredientKey)}</div>
          <div class="sub">${escapeHtml(r.note || '')}</div>
        </div>
        <span class="pill ${r.status}">${r.status}</span>
        <button class="ghost issue-btn" data-idx="${i}">Open</button>
      </div>`).join('')}
    ${notReached ? `<div class="empty">${notReached} not reached.</div>` : ''}
    <button class="secondary" id="clearRunBtn">Clear</button>`;

  el.querySelectorAll('.issue-btn').forEach(btn => btn.addEventListener('click', () => openInShoppingTab(issues[btn.dataset.idx].productUrl)));
  $('clearRunBtn').onclick = async () => { await chrome.storage.local.remove('basketRun'); renderRun(); };
}

// Keep the run section live while the popup is open
chrome.storage.onChanged.addListener(changes => { if (changes.basketRun) renderRun(); });

loadBatches();
renderRun();
