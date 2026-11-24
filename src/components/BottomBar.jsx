import React from 'react';
import { TABS } from '../lib/tabs.js';

export default function BottomBar({ tabs, active, onSelect }) {
  const items = [...tabs, 'more'];
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t" style={{ borderColor: 'var(--line)', paddingBottom: 'var(--safe-bottom)' }}>
      <div className="max-w-[640px] mx-auto flex">
        {items.map(key => {
          const { short, icon: Icon } = TABS[key];
          const on = active === key;
          return (
            <button key={key} onClick={() => onSelect(key)} aria-current={on ? 'page' : undefined}
              className="flex-1 flex flex-col items-center gap-1 pt-2 pb-2 text-[11px] font-semibold"
              style={{ color: on ? 'var(--green)' : '#8A9590' }}>
              <span className="flex items-center justify-center rounded-full w-14 h-8 transition-colors" style={{ background: on ? 'var(--green-soft)' : 'transparent' }}>
                <Icon size={22} strokeWidth={on ? 2.4 : 2} />
              </span>
              {short}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
