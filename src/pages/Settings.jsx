import React from 'react';
import { ArrowUp, ArrowDown, Check } from 'lucide-react';
import { PageHeader } from '../components/ui.jsx';
import { TABS, PINNABLE, MAX_BAR } from '../lib/tabs.js';
import { usePrefs } from '../lib/prefs.jsx';
import { useNav } from '../lib/nav.js';

function TabPicker() {
  const { bar, setBar } = usePrefs();
  const toggle = key => {
    if (bar.includes(key)) { if (bar.length > 1) setBar(bar.filter(t => t !== key)); }
    else if (bar.length < MAX_BAR) setBar([...bar, key]);
  };
  const move = (key, dir) => {
    const i = bar.indexOf(key), j = i + dir;
    if (j < 0 || j >= bar.length) return;
    const next = [...bar]; [next[i], next[j]] = [next[j], next[i]]; setBar(next);
  };
  const ordered = [...bar, ...PINNABLE.filter(t => !bar.includes(t))];
  return (
    <section className="mb-6">
      <div className="section-label mb-2 px-1">Bottom bar</div>
      <div className="card overflow-hidden">
        {ordered.map((key, i) => {
          const { label, icon: Icon } = TABS[key];
          const on = bar.includes(key);
          const full = !on && bar.length >= MAX_BAR;
          return (
            <div key={key} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i ? '1px solid var(--line)' : 'none', opacity: full ? 0.45 : 1 }}>
              <button onClick={() => toggle(key)} disabled={full} aria-pressed={on} aria-label={`Show ${label} in bottom bar`}
                className="w-6 h-6 rounded-md flex items-center justify-center border-2"
                style={{ background: on ? 'var(--green)' : '#fff', borderColor: on ? 'var(--green)' : '#C5CEC9' }}>
                {on && <Check size={15} color="#fff" strokeWidth={3} />}
              </button>
              <Icon size={20} style={{ color: 'var(--green)' }} />
              <span className="flex-1 font-medium">{label}</span>
              {on && <>
                <button aria-label="Move up" className="p-1.5 rounded-lg active:bg-black/5" onClick={() => move(key, -1)} disabled={bar.indexOf(key) === 0}><ArrowUp size={18} /></button>
                <button aria-label="Move down" className="p-1.5 rounded-lg active:bg-black/5" onClick={() => move(key, 1)} disabled={bar.indexOf(key) === bar.length - 1}><ArrowDown size={18} /></button>
              </>}
            </div>
          );
        })}
      </div>
      <p className="text-[13px] mt-2 px-1" style={{ color: 'var(--text-soft)' }}>Up to {MAX_BAR} tabs. Everything else, plus Settings, is on the More page.</p>
    </section>
  );
}

export default function Settings() {
  const { back, canBack } = useNav();
  return (
    <div className="page">
      <PageHeader title="Settings" onBack={canBack ? back : undefined} />
      <TabPicker />
    </div>
  );
}
