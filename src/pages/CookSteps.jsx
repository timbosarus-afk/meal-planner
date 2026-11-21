import React from 'react';

// How to Cook tab (replaced by full cook mode in the next section)
export default function CookSteps({ steps }) {
  if (!steps.length) return <p className="py-6 text-center" style={{ color: 'var(--text-soft)' }}>No steps for this recipe.</p>;
  return (
    <ol className="grid gap-3">
      {steps.map((s, i) => (
        <li key={i} className="card p-4 flex gap-3">
          <span className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-[14px] font-bold text-white" style={{ background: 'var(--green)' }}>{i + 1}</span>
          <span className="text-[16px] leading-relaxed">{s}</span>
        </li>
      ))}
    </ol>
  );
}
