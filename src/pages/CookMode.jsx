import React, { useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Timer, Smartphone, PartyPopper, Check } from 'lucide-react';
import Rating from '../components/Rating.jsx';
import { useNav } from '../lib/nav.js';
import { api } from '../lib/api.js';
import { displayName } from '../lib/format.js';
import { today } from '../lib/recipe.js';
import { findTimes, fmtMinutes, shortcutUrl } from '../lib/timeParse.js';
import { addTimer, removeTimer, useTimers, fmtLeft, useWakeLock } from '../lib/timers.js';

export const recipeChanged = () => window.dispatchEvent(new Event('recipe-updated'));

// Step text with detected times highlighted
function StepText({ text, times }) {
  if (!times.length) return text;
  const parts = []; let at = 0;
  times.forEach((t, i) => {
    parts.push(text.slice(at, t.index));
    parts.push(<mark key={i} className="rounded-md px-1" style={{ background: '#FFF3DC', color: '#7A4F00' }}>{t.text}</mark>);
    at = t.index + t.text.length;
  });
  parts.push(text.slice(at));
  return parts;
}

function TimerBar() {
  const timers = useTimers();
  if (!timers.length) return null;
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
      {timers.map(t => (
        <div key={t.id} className="flex items-center gap-2 rounded-full pl-3 pr-1 py-1 shrink-0 text-[14px] font-semibold"
          style={t.done ? { background: 'var(--danger)', color: '#fff', animation: 'pulse 1s infinite' } : { background: 'var(--green)', color: '#fff' }}>
          <Timer size={15} />
          <span className="tabular-nums">{t.done ? 'Done!' : fmtLeft(t.left)}</span>
          <span className="opacity-80 font-medium max-w-[110px] truncate">{t.label}</span>
          <button aria-label="Dismiss timer" className="w-7 h-7 rounded-full flex items-center justify-center bg-white/20" onClick={() => removeTimer(t.id)}><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}

function Finished({ recipe, onClose }) {
  const [rating, setRating] = useState(recipe.rating || null);
  const [notes, setNotes] = useState(recipe.rating_notes || '');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try { await api.patchRecipe(recipe.id, { rating, ratingNotes: notes }); recipeChanged(); onClose(); }
    catch (e) { alert(e.message); setSaving(false); }
  };
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-2">
      <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}><PartyPopper size={38} /></div>
      <h2 className="font-display font-extrabold text-[28px]" style={{ color: 'var(--green)' }}>Dinner's ready</h2>
      <p className="mt-1 mb-6 text-[15px]" style={{ color: 'var(--text-soft)' }}>How was {displayName(recipe)}?</p>
      <Rating value={rating} onChange={setRating} size={40} />
      <textarea className="input mt-5 text-[15px]" rows={2} placeholder="Notes for next time (optional)" value={notes} onChange={e => setNotes(e.target.value)} />
      <div className="w-full grid gap-2 mt-5">
        <button className="btn btn-primary w-full py-4 text-[17px]" onClick={save} disabled={saving}><Check size={20} />{saving ? 'Saving…' : 'Save'}</button>
        <button className="btn btn-ghost w-full" onClick={onClose}>Skip</button>
      </div>
    </div>
  );
}

export default function CookMode({ recipe, steps, start = 0 }) {
  const { back } = useNav();
  const [i, setI] = useState(start);
  const [done, setDone] = useState(false);
  const touch = useRef(null);
  useWakeLock();

  const step = steps[i] || '';
  const times = findTimes(step);
  const last = i === steps.length - 1;

  const next = async () => {
    if (!last) return setI(i + 1);
    setDone(true);
    try { await api.patchRecipe(recipe.id, { lastCooked: today() }); recipeChanged(); } catch (e) { console.error(e); }
  };
  const prev = () => i > 0 && setI(i - 1);
  const onTouchEnd = e => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current;
    touch.current = null;
    if (Math.abs(dx) > 60) (dx < 0 ? next : prev)();
  };

  return (
    <div className="min-h-[100dvh] flex flex-col max-w-[640px] mx-auto px-4" style={{ paddingTop: 'calc(var(--safe-top) + 12px)', paddingBottom: 'calc(var(--safe-bottom) + 16px)', background: 'var(--bg)' }}>
      <div className="flex items-center gap-3 mb-3">
        <button aria-label="Close cook mode" onClick={back} className="w-10 h-10 rounded-full flex items-center justify-center card"><X size={20} /></button>
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold text-[16px] truncate">{displayName(recipe)}</div>
          {!done && <div className="text-[13px]" style={{ color: 'var(--text-soft)' }}>Step {i + 1} of {steps.length}</div>}
        </div>
      </div>
      <div className="h-1.5 rounded-full mb-3 overflow-hidden" style={{ background: '#E1E8E4' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${done ? 100 : ((i + 1) / steps.length) * 100}%`, background: 'var(--green)' }} />
      </div>
      <TimerBar />

      {done ? <Finished recipe={recipe} onClose={back} /> : (
        <>
          <div className="flex-1 flex flex-col justify-center py-6" onTouchStart={e => { touch.current = e.touches[0].clientX; }} onTouchEnd={onTouchEnd}>
            <div className="font-display font-extrabold text-[15px] mb-3" style={{ color: 'var(--green-mid)' }}>STEP {i + 1}</div>
            <p className="text-[26px] leading-[1.4] font-medium" style={{ color: 'var(--text)' }}><StepText text={step} times={times} /></p>

            {times.length > 0 && (
              <div className="mt-8 grid gap-3">
                {times.map((t, k) => {
                  const label = t.maxMinutes !== t.minutes ? `${fmtMinutes(t.minutes)} (check), up to ${fmtMinutes(t.maxMinutes)}` : fmtMinutes(t.minutes);
                  return (
                    <div key={k} className="card p-3">
                      <a href={shortcutUrl(t.minutes)} className="btn btn-primary w-full py-4 text-[17px]">
                        <Smartphone size={20} /> Start {fmtMinutes(Math.max(1, Math.round(t.minutes)))} iPhone timer
                      </a>
                      <div className="flex items-center justify-between mt-2 px-1">
                        <span className="text-[13px]" style={{ color: 'var(--text-soft)' }}>{label}</span>
                        <button className="btn btn-soft py-1.5 px-3 text-[13px]" onClick={() => addTimer(`Step ${i + 1}`, t.minutes)}><Timer size={14} />In-app</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-[auto_1fr] gap-3">
            <button aria-label="Previous step" className="btn btn-soft w-16 py-5" onClick={prev} disabled={i === 0}><ChevronLeft size={26} /></button>
            <button className="btn btn-primary py-5 text-[18px]" onClick={next}>
              {last ? <><Check size={22} /> Finish cooking</> : <>Next step <ChevronRight size={22} /></>}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
CookMode.fullscreen = true;
