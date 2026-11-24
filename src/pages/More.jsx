import React from 'react';
import { ChevronRight } from 'lucide-react';
import { PageHeader } from '../components/ui.jsx';
import { TABS, PINNABLE } from '../lib/tabs.js';
import { usePrefs } from '../lib/prefs.jsx';
import { useNav } from '../lib/nav.js';

export default function More() {
  const { bar } = usePrefs();
  const { go } = useNav();
  const items = [...PINNABLE.filter(t => !bar.includes(t)), 'settings'];
  return (
    <div className="page narrow">
      <PageHeader title="More" />
      <div className="card overflow-hidden">
        {items.map((key, i) => {
          const { label, icon: Icon } = TABS[key];
          return (
            <button key={key} onClick={() => go(key)} className="w-full flex items-center gap-3 px-4 py-4 text-left active:bg-black/5"
              style={{ borderTop: i ? '1px solid var(--line)' : 'none' }}>
              <span className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}><Icon size={20} /></span>
              <span className="flex-1 font-semibold text-[16px]">{label}</span>
              <ChevronRight size={18} style={{ color: '#A7B1AD' }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
