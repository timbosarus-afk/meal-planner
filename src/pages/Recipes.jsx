import React, { useEffect, useMemo, useState } from 'react';
import CostToggle, { useFullCost, pickCost } from '../components/CostToggle.jsx';
import { Search, Star, BookOpen, X } from 'lucide-react';
import { PageHeader, Spinner, ErrorBox, Empty, useLoad } from '../components/ui.jsx';
import RecipeThumb from '../components/RecipeThumb.jsx';
import { api } from '../lib/api.js';
import { useNav } from '../lib/nav.js';
import { displayName, money } from '../lib/format.js';

const SORTS = { recent: 'Newest', rating: 'Top rated', cheap: 'Cheapest', az: 'A–Z' };

export default function Recipes() {
  const { push } = useNav();
  const list = useLoad(() => api.recipes(), []);
  useEffect(() => { const r = () => list.reload(); window.addEventListener('recipe-updated', r); return () => window.removeEventListener('recipe-updated', r); }, [list.reload]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState(null);
  const [sort, setSort] = useState('recent');
  const [fullCost] = useFullCost();

  const filters = useMemo(() => {
    if (!list.data) return [];
    const count = {};
    list.data.forEach(r => [r.cuisine, ...(r.tags || [])].filter(Boolean).forEach(t => { count[t] = (count[t] || 0) + 1; }));
    const top = Object.entries(count).sort((a, b) => b[1] - a[1]).map(([t]) => t);
    return ['lunch-friendly', ...top.filter(t => t !== 'lunch-friendly')].filter(t => count[t]).slice(0, 12);
  }, [list.data]);

  const shown = useMemo(() => {
    if (!list.data) return [];
    const needle = q.trim().toLowerCase();
    let out = list.data.filter(r => (!needle || `${r.title} ${r.nickname || ''} ${r.cuisine || ''}`.toLowerCase().includes(needle))
      && (!filter || r.cuisine === filter || (r.tags || []).includes(filter)));
    if (sort === 'rating') out = [...out].sort((a, b) => (b.rating || 0) - (a.rating || 0));
    if (sort === 'az') out = [...out].sort((a, b) => displayName(a).localeCompare(displayName(b)));
    // Unpriced recipes go last
    if (sort === 'cheap') out = [...out].sort((a, b) => (pickCost(a.cost, fullCost)?.perServing ?? Infinity) - (pickCost(b.cost, fullCost)?.perServing ?? Infinity));
    return out;
  }, [list.data, q, filter, sort, fullCost]);

  return (
    <div className="page">
      <PageHeader title="Recipes" subtitle={list.data ? `${list.data.length} saved` : null}
        right={<select aria-label="Sort" className="select input py-1.5 text-[14px] w-auto" value={sort} onChange={e => setSort(e.target.value)}>
          {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>} />
      <div className="relative mb-3">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#97A39E' }} />
        <input className="input pl-10" placeholder="Search recipes" value={q} onChange={e => setQ(e.target.value)} />
        {q && <button aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5" onClick={() => setQ('')}><X size={16} /></button>}
      </div>
      <div className="mb-3 px-1"><CostToggle /></div>
      {filters.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-3 no-scrollbar">
          {filters.map(f => (
            <button key={f} onClick={() => setFilter(filter === f ? null : f)} className="chip whitespace-nowrap py-1.5 px-3 text-[13px]"
              style={filter === f ? { background: 'var(--green)', color: '#fff' } : { background: '#fff', color: 'var(--text-soft)', boxShadow: 'inset 0 0 0 1.5px var(--line)' }}>{f}</button>
          ))}
        </div>
      )}
      {list.error ? <ErrorBox message={list.error} onRetry={list.reload} />
        : !list.data ? <Spinner />
        : !shown.length ? <Empty icon={BookOpen} title="No recipes found">{list.data.length ? 'Try a different search.' : 'Ask Claude to find some meals.'}</Empty>
        : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3 lg:gap-4">
            {shown.map(r => (
              <button key={r.id} onClick={() => push('recipe', { id: r.id })} className="card overflow-hidden text-left flex flex-col justify-start active:scale-[0.98] transition-transform">
                <RecipeThumb recipe={r} rounded="" className="w-full aspect-[4/3]" />
                <div className="p-3">
                  <div className="font-display font-bold text-[15px] leading-snug line-clamp-2">{displayName(r)}</div>
                  <div className="mt-1 flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-soft)' }}>
                    {r.cuisine && <span className="truncate">{r.cuisine}</span>}
                    {r.rating ? <span className="flex items-center gap-0.5 ml-auto"><Star size={12} fill="currentColor" style={{ color: 'var(--amber)' }} />{r.rating}</span> : null}
                  </div>
                  {pickCost(r.cost, fullCost)?.perServing > 0 && (() => { const c = pickCost(r.cost, fullCost); return (
                    <div className="mt-1.5 text-[13px]" title={c.notPriced ? `${c.notPriced} ingredient${c.notPriced === 1 ? '' : 's'} not priced yet, so this is a little low` : (fullCost ? 'Full cost of the meal, including what you already have' : 'Rough cost of what you buy for the meal')}>
                      <span className="font-bold" style={{ color: 'var(--green)' }}>~{money(c.perServing)}</span>
                      <span style={{ color: 'var(--text-soft)' }}> a serving{fullCost ? ' in full' : ''}{c.notPriced ? '+' : ''}</span>
                    </div>
                  ); })()}
                </div>
              </button>
            ))}
          </div>
        )}
    </div>
  );
}
