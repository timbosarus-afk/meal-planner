// Thin wrappers over the existing /api/* functions (shared with the extension).
async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

export const api = {
  recipes: () => call('/api/recipes'),
  recipe: id => call(`/api/recipe?id=${id}`),
  patchRecipe: (id, body) => call(`/api/recipe?id=${id}`, { method: 'PATCH', body }),
  weeks: () => call('/api/weekly-plans'),
  week: id => call(`/api/weekly-plan?id=${id}`),
  shoppingList: id => call(`/api/weekly-plan-shopping-list?id=${id}`),
  exclude: (planId, itemName) => call('/api/weekly-plan-exclude', { method: 'POST', body: { planId, itemName } }),
  unexclude: (planId, itemName) => call('/api/weekly-plan-exclude', { method: 'DELETE', body: { planId, itemName } }),
  pantry: () => call('/api/staples'),
  addPantry: body => call('/api/staples', { method: 'POST', body }),
  patchPantry: body => call('/api/staples', { method: 'PATCH', body }),
  deletePantry: id => call('/api/staples', { method: 'DELETE', body: { id } }),
  canMake: () => call('/api/recipes?action=can-make'),
  setRole: (ingredientId, role) => call('/api/recipes?action=set-role', { method: 'POST', body: { ingredientId, role } }),
  settings: () => call('/api/settings'),
  setSetting: (key, value) => call('/api/settings', { method: 'PUT', body: { key, value } })
};

api.deleteWeek = id => call(`/api/weekly-plans?id=${id}`, { method: 'DELETE' });
api.deleteRecipe = id => call(`/api/recipe?id=${id}`, { method: 'DELETE' });
api.checkItem = (planId, itemId, checked) => call(`/api/weekly-plan-shopping-list?id=${planId}`, { method: 'PATCH', body: { itemId, checked } });
api.sendToShop = planId => call(`/api/weekly-plan-shopping-list?id=${planId}`, { method: 'POST', body: { action: 'send' } });
