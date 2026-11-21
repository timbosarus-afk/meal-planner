export const displayName = r => (r && (r.nickname || r.title)) || '';

export function fmtQty(q, unit) {
  if (q === null || q === undefined || q === '') return unit || '';
  const n = Number(q);
  const fr = { 0.25: '¼', 0.5: '½', 0.75: '¾', 0.33: '⅓', 0.67: '⅔' };
  const whole = Math.floor(n);
  const rem = Math.round((n - whole) * 100) / 100;
  let s = fr[rem] ? `${whole || ''}${fr[rem]}` : String(Math.round(n * 100) / 100);
  if (!unit) return s;
  return /^(g|kg|ml|l)$/i.test(unit) ? `${s}${unit}` : `${s} ${unit}`;
}

// "Monday 23 November"
export const fmtWeek = d => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtShortDate = d => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

// Picks the week to show by default: the latest week starting on/before today
// (+2 days grace so a Sat/Sun plan for the coming week shows), else the newest.
export function pickCurrentWeek(weeks) {
  if (!weeks || !weeks.length) return null;
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + 2);
  const iso = cutoff.toISOString().slice(0, 10);
  const sorted = [...weeks].sort((a, b) => b.week_start_date.localeCompare(a.week_start_date));
  return sorted.find(w => w.week_start_date <= iso) || sorted[sorted.length - 1];
}
