import React, { useEffect, useState } from 'react';

// "Include what I already have": switches prices between what a meal uses of
// things you buy, and the full cost counting food you already have and your
// staples. Remembered in this browser and shared across pages.
const KEY = 'mp-full-cost';
const EVT = 'mp-full-cost-changed';

export function useFullCost() {
  const read = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
  const [full, setFull] = useState(read);
  useEffect(() => {
    const h = () => setFull(read());
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
  }, []);
  const set = v => {
    try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* private mode */ }
    window.dispatchEvent(new Event(EVT));
  };
  return [full, set];
}

// Pick the cost object to show: the full one when the switch is on
export const pickCost = (cost, full) => (cost && full && cost.full ? { ...cost, ...cost.full } : cost);

export default function CostToggle({ className = '' }) {
  const [full, setFull] = useFullCost();
  return (
    <label className={`inline-flex items-center gap-2 text-[13px] font-semibold cursor-pointer select-none ${className}`} style={{ color: 'var(--text-soft)' }}>
      <input type="checkbox" checked={full} onChange={e => setFull(e.target.checked)} />
      Include what I already have
    </label>
  );
}
