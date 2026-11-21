import React from 'react';
import { Play, Timer } from 'lucide-react';
import { useNav } from '../lib/nav.js';
import { findTimes, fmtMinutes } from '../lib/timeParse.js';

// How to Cook tab: overview of the steps; Start (or tap a step) for cook mode.
export default function CookSteps({ recipe, steps }) {
  const { push } = useNav();
  if (!steps.length) return <p className="py-6 text-center" style={{ color: 'var(--text-soft)' }}>No steps for this recipe.</p>;
  const open = start => push('cook', { recipe, steps, start });
  return (
    <>
      <button className="btn btn-primary w-full py-4 text-[17px] mb-4" onClick={() => open(0)}><Play size={20} fill="#fff" />Start cooking</button>
      <ol className="grid gap-2">
        {steps.map((s, i) => {
          const t = findTimes(s);
          return (
            <li key={i}>
              <button onClick={() => open(i)} className="card w-full p-4 flex gap-3 text-left active:scale-[0.99] transition-transform">
                <span className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-[14px] font-bold text-white" style={{ background: 'var(--green)' }}>{i + 1}</span>
                <span className="flex-1">
                  <span className="text-[16px] leading-relaxed block">{s}</span>
                  {t.length > 0 && <span className="chip mt-2" style={{ background: '#FFF3DC', color: '#8A5A00' }}><Timer size={13} />{t.map(x => fmtMinutes(x.minutes)).join(', ')}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </>
  );
}
