// v0.5: batch-based. Pick a batch, see which items are linked to a known
// Sainsbury's product (ready to add) and which still need linking.
//
// "Add all to basket" hands a queue to product.js, which walks the shopping
// tab through each product page, clicks Add and bumps the quantity. State
// lives in chrome.storage.local, so the popup closing mid-run is fine.
//
// "Find" on an unlinked item opens Sainsbury's search for it and pre-fills
// the link panel, so linking is: Find -> click the product you want -> Save.

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
      const d = new Date(b.week_start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      return `<option value="${b.id}">${escapeHtml(d)} · ${escapeHtml(b.status)} · ${b.servings_target} servings</option>`;
    }).join('');
    batchSelect.value = batches.some(b => b.id === selectedBatchId) ? selectedBatchId : batches[0].id;
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
    $('unlinkedList').innerHTML = '<div class="empty">Everything on this list is linked 🎉</div>';
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
    await chrome.storage.local.set({ linkingKey: key });
    await openInShoppingTab(`https://www.sainsburys.co.uk/gol-ui/SearchResults/${encodeURIComponent(key)}`);
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
