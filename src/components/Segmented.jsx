import React from 'react';

export default function Segmented({ options, value, onChange }) {
  return (
    <div className="flex p-1 rounded-2xl" role="tablist" style={{ background: '#E6ECE9' }}>
      {options.map(o => {
        const on = o.value === value;
        const Icon = o.icon;
        return (
          <button key={o.value} role="tab" aria-selected={on} onClick={() => onChange(o.value)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[15px] font-semibold transition-all"
            style={{ background: on ? '#fff' : 'transparent', color: on ? 'var(--green)' : 'var(--text-soft)', boxShadow: on ? 'var(--shadow)' : 'none' }}>
            {Icon && <Icon size={17} />}{o.label}
          </button>
        );
      })}
    </div>
  );
}
