import { useEffect, useState } from 'react';

// In-app countdowns. Visual only: iOS suspends web apps in the background, so
// we store end timestamps and recompute on every tick; the real alarm is the
// iPhone Clock timer started by the Shortcut.
const KEY = 'meal_cook_timers';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
const write = list => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {} window.dispatchEvent(new Event('cooktimers')); };

export const addTimer = (label, minutes) => write([...read(), { id: Date.now() + Math.random(), label, end: Date.now() + minutes * 60000, total: minutes * 60000 }]);
export const removeTimer = id => write(read().filter(t => t.id !== id));

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.35, 0.7].forEach(t => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.25, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.3);
    });
  } catch {}
}

export function useTimers() {
  const [list, setList] = useState(read);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const sync = () => setList(read());
    window.addEventListener('cooktimers', sync);
    const iv = setInterval(() => setNow(Date.now()), 500);
    return () => { window.removeEventListener('cooktimers', sync); clearInterval(iv); };
  }, []);
  useEffect(() => {
    list.forEach(t => { if (!t.rang && t.end <= now) { t.rang = true; beep(); write(list); } });
  }, [now, list]);
  return list.map(t => ({ ...t, left: Math.max(0, t.end - now), done: t.end <= now }));
}

export const fmtLeft = ms => {
  const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};

// Keep the screen on while cooking (iOS 16.4+, Chrome).
export function useWakeLock() {
  useEffect(() => {
    let lock = null, alive = true;
    const req = async () => { try { if (navigator.wakeLock && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen'); } catch {} };
    req();
    const onVis = () => { if (alive) req(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; document.removeEventListener('visibilitychange', onVis); if (lock) lock.release().catch(() => {}); };
  }, []);
}
