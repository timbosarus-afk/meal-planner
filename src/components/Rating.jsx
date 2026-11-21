import React from 'react';
import { Star } from 'lucide-react';

export default function Rating({ value, onChange, size = 30 }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`}
          onClick={() => onChange && onChange(value === n ? null : n)} className="p-1 active:scale-90 transition-transform">
          <Star size={size} strokeWidth={1.8} fill={value >= n ? 'currentColor' : 'none'} style={{ color: value >= n ? 'var(--amber)' : '#C5CEC9' }} />
        </button>
      ))}
    </div>
  );
}
