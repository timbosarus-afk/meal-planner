import React from 'react';
import { UtensilsCrossed } from 'lucide-react';
import { TABS } from '../lib/tabs.js';

// Desktop navigation (lg and up). Every page is one click away, so there's no
// "More" page on a PC; the phone keeps its bottom bar.
const MAIN = ['week', 'recipes', 'shopping', 'pantry', 'canmake'];

export default function Sidebar({ active, onSelect }) {
  const item = key => {
    const { label, icon: Icon } = TABS[key];
    const on = active === key;
    return (
      <button key={key} onClick={() => onSelect(key)} aria-current={on ? 'page' : undefined}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] font-semibold transition-colors hover:bg-black/[0.04]"
        style={on ? { background: 'var(--green-soft)', color: 'var(--green)' } : { color: 'var(--text-soft)' }}>
        <Icon size={20} strokeWidth={on ? 2.4 : 2} />{label}
      </button>
    );
  };
  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-[248px] flex-col bg-white border-r px-4 py-6" style={{ borderColor: 'var(--line)' }}>
      <div className="flex items-center gap-2.5 px-2 mb-8">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center text-white" style={{ background: 'var(--green)' }}><UtensilsCrossed size={18} /></span>
        <span className="font-display font-extrabold text-[19px]" style={{ color: 'var(--green)' }}>Meal Planner</span>
      </div>
      <nav className="grid gap-1">{MAIN.map(item)}</nav>
      <div className="mt-auto pt-4 border-t" style={{ borderColor: 'var(--line)' }}>{item('settings')}</div>
    </aside>
  );
}
