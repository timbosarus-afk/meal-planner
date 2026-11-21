import React from 'react';
import { fmtWeek } from '../lib/format.js';
import { useWeeks } from '../lib/weeks.jsx';

// Small week dropdown, e.g. "Monday 23 November"
export default function WeekSelect({ className = '' }) {
  const { weeks, selectedId, select } = useWeeks();
  if (!weeks || !weeks.length) return null;
  return (
    <select aria-label="Week" className={`select input py-2 text-[15px] font-semibold ${className}`} style={{ color: 'var(--green)', width: 'auto', maxWidth: '100%' }}
      value={selectedId || ''} onChange={e => select(e.target.value)}>
      {weeks.map(w => <option key={w.id} value={w.id}>{fmtWeek(w.week_start_date)}</option>)}
    </select>
  );
}
