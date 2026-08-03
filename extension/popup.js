// v0.2 scope: fetch recipes, build a consolidated shopping list, and for
// each item open Sainsbury's real search results (now that we have the
// URL pattern). content.js then highlights the Add button on that page.
// Still NOT auto-clicking add-to-basket — see content.js for why.

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

    recipeListEl.innerHTML = recipes.map(r => `
      <div class="recipe-row">
        <input type="checkbox" value="${r.id}" id="r-${r.id}">
        <label for="r-${r.id}">${escapeHtml(r.title)}</label>
      </div>
    `).join('');
  } catch (err) {
    recipeListEl.textContent = 'Could not reach the API — check the URL above.';
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

    renderList(data.shoppingList);
    statusEl.textContent = '';
  } catch (err) {
    statusEl.textContent = err.message;
  }
});

function renderList(items) {
  listResultsEl.innerHTML = items.map((item, i) => `
    <div class="item-row" id="item-${i}">
      <span>${item.quantity ? `${item.quantity}${item.unit || ''} ` : ''}${escapeHtml(item.item)}</span>
      <button data-item="${escapeHtml(item.item)}" data-idx="${i}">Copy + open</button>
    </div>
  `).join('');

  listResultsEl.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.item);
      const searchUrl = `https://www.sainsburys.co.uk/gol-ui/SearchResults/${encodeURIComponent(btn.dataset.item)}`;
      chrome.tabs.create({ url: searchUrl });
      document.getElementById(`item-${btn.dataset.idx}`).classList.add('done');
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

loadRecipes();
