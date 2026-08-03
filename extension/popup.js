// v0.4 scope: reuses a single shopping tab instead of spawning one per item
// (big speed/clutter improvement), and adds an "Always have" button per
// item that permanently excludes it from future shopping lists via the
// staples table — the answer to "what about salt and pepper".

const apiUrlInput = document.getElementById('apiUrl');
const statusEl = document.getElementById('status');
const recipeListEl = document.getElementById('recipeList');
const listResultsEl = document.getElementById('listResults');

async function getApiUrl() {
  const stored = await chrome.storage.local.get('apiUrl');
  if (stored.apiUrl) {
    apiUrlInput.value = stored.apiUrl;
    return stored.apiUrl;
  }
  return null;
}

apiUrlInput.addEventListener('change', async () => {
  const url = apiUrlInput.value.trim().replace(/\/$/, '');
  await chrome.storage.local.set({ apiUrl: url });
  loadRecipes();
});

async function saveSelectedRecipes() {
  const checked = [...document.querySelectorAll('#recipeList input:checked')].map(c => c.value);
  await chrome.storage.local.set({ selectedRecipeIds: checked });
}

async function loadRecipes() {
  const apiUrl = await getApiUrl();
  if (!apiUrl) {
    recipeListEl.textContent = 'Paste your Vercel API URL above first.';
    return;
  }

  try {
    const res = await fetch(`${apiUrl}/api/recipes`);
    const recipes = await res.json();

    if (!recipes.length) {
      recipeListEl.textContent = 'No recipes saved yet — import some from the mobile page first.';
      return;
    }

    const { selectedRecipeIds = [] } = await chrome.storage.local.get('selectedRecipeIds');

    recipeListEl.innerHTML = recipes.map(r => `
      <div class="recipe-row">
        <input type="checkbox" value="${r.id}" id="r-${r.id}" ${selectedRecipeIds.includes(r.id) ? 'checked' : ''}>
        <label for="r-${r.id}">${escapeHtml(r.title)}</label>
      </div>
    `).join('');

    recipeListEl.querySelectorAll('input').forEach(cb => cb.addEventListener('change', saveSelectedRecipes));
  } catch (err) {
    console.error('meal-planner: recipe fetch failed', err);
    recipeListEl.textContent = `Could not reach the API: ${err.message}`;
  }
}

document.getElementById('generateBtn').addEventListener('click', async () => {
  const apiUrl = await getApiUrl();
  if (!apiUrl) { statusEl.textContent = 'Set your API URL first.'; return; }

  const checked = [...document.querySelectorAll('#recipeList input:checked')].map(c => c.value);
  const servings = parseInt(document.getElementById('servings').value, 10) || 2;

  if (!checked.length) { statusEl.textContent = 'Tick at least one recipe.'; return; }

  statusEl.textContent = 'Building list…';

  try {
    const res = await fetch(`${apiUrl}/api/shopping-list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipeIds: checked, servingsTarget: servings })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');

    // New list, so progress starts fresh — save it as the current list
    // with no items marked done yet.
    await chrome.storage.local.set({ currentList: data.shoppingList, doneItems: [] });
    renderList(data.shoppingList, []);
    statusEl.textContent = '';
  } catch (err) {
    statusEl.textContent = err.message;
  }
});

async function markDone(itemName) {
  const { doneItems = [] } = await chrome.storage.local.get('doneItems');
  if (!doneItems.includes(itemName)) {
    doneItems.push(itemName);
    await chrome.storage.local.set({ doneItems });
  }
}

// Reuses one dedicated shopping tab across all items instead of spawning a
// new tab per click — going through a 15-20 item list used to leave you
// with 15-20 open tabs, which was both slow and messy to navigate.
async function openInShoppingTab(url) {
  const { shoppingTabId } = await chrome.storage.local.get('shoppingTabId');

  if (shoppingTabId) {
    try {
      await chrome.tabs.update(shoppingTabId, { url, active: true });
      return;
    } catch (err) {
      // Tab was closed since last time — fall through and open a fresh one
    }
  }

  const tab = await chrome.tabs.create({ url });
  await chrome.storage.local.set({ shoppingTabId: tab.id });
}

// Marks an item as a permanent staple (e.g. salt, pepper, oil) — excluded
// from every future generated list. Removes it from the current list too
// since you clearly don't need to shop for it this week either.
async function markAsStaple(itemName, apiUrl) {
  try {
    await fetch(`${apiUrl}/api/staples`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemName })
    });
  } catch (err) {
    console.error('meal-planner: failed to save staple', err);
  }
}

function renderList(items, doneItems) {
  listResultsEl.innerHTML = items.map((item, i) => `
    <div class="item-row ${doneItems.includes(item.item) ? 'done' : ''}" id="item-${i}">
      <span>${item.quantity ? `${item.quantity}${item.unit || ''} ` : ''}${escapeHtml(item.item)}</span>
      <span>
        <button data-item="${escapeHtml(item.item)}" data-idx="${i}" class="open-btn">Copy + open</button>
        <button data-item="${escapeHtml(item.item)}" data-idx="${i}" class="staple-btn" title="Always have this — exclude from future lists">Always have</button>
      </span>
    </div>
  `).join('');

  listResultsEl.querySelectorAll('.open-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      navigator.clipboard.writeText(btn.dataset.item);
      const searchUrl = `https://www.sainsburys.co.uk/gol-ui/SearchResults/${encodeURIComponent(btn.dataset.item)}`;
      await openInShoppingTab(searchUrl);
      document.getElementById(`item-${btn.dataset.idx}`).classList.add('done');
      await markDone(btn.dataset.item);
    });
  });

  listResultsEl.querySelectorAll('.staple-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const apiUrl = await getApiUrl();
      if (!apiUrl) return;
      await markAsStaple(btn.dataset.item, apiUrl);
      const row = document.getElementById(`item-${btn.dataset.idx}`);
      row.style.opacity = '0.3';
      row.querySelectorAll('button').forEach(b => b.disabled = true);
    });
  });
}

async function restoreListIfAny() {
  const { currentList, doneItems = [] } = await chrome.storage.local.get(['currentList', 'doneItems']);
  if (currentList && currentList.length) {
    renderList(currentList, doneItems);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

loadRecipes();
restoreListIfAny();
