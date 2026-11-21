import { supabase, SUPABASE_URL } from './supabase.js';

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const googleImagesUrl = title => `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(title)}`;

export function scaleQty(q, base, target) {
  if (q === null || q === undefined || !base || !target || base === target) return q;
  return Math.round(Number(q) * target / base * 100) / 100;
}

export const steps = recipe => (Array.isArray(recipe && recipe.steps) ? recipe.steps : [])
  .map(s => (typeof s === 'string' ? s : (s && (s.text || s.step)) || ''))
  .map(s => s.trim()).filter(Boolean);

// Uploads to the public recipe-images bucket and returns the public URL.
export async function uploadRecipePhoto(recipeId, file) {
  const ext = ((file.name || '').split('.').pop() || 'jpg').toLowerCase();
  const path = `recipes/${recipeId}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('recipe-images').upload(path, file, { contentType: file.type || 'image/jpeg' });
  if (error) throw new Error(error.message);
  return `${SUPABASE_URL}/storage/v1/object/public/recipe-images/${path}`;
}

export const fmtCookedDate = d => {
  if (!d) return null;
  const t = today();
  if (d === t) return 'today';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: d.slice(0, 4) === t.slice(0, 4) ? undefined : 'numeric' });
};
