import React, { useEffect } from 'react';
import { ChefHat, CheckCircle2, CircleDashed, ShoppingBasket, Package } from 'lucide-react';
import { PageHeader, Spinner, ErrorBox, Empty, useLoad } from '../components/ui.jsx';
import RecipeThumb from '../components/RecipeThumb.jsx';
import { api } from '../lib/api.js';
import { useNav } from '../lib/nav.js';

// Pure matching against the pantry (lib/can-make.js), no AI call.
function Card({ r, onOpen, onWant, wanted }) {
  return (
    <div className="card p-3 flex gap-3">
      <button onClick={onOpen} className="shrink-0 self-start"><RecipeThumb recipe={r} className="w-[72px] h-[72px]" /></button>
      <div className="flex-1 min-w-0">
        <button onClick={onOpen} className="text-left font-display font-bold text-[16px] leading-snug">{r.title}</button>
        <div className="text-[13px] mt-0.5" style={{ color: 'var(--text-soft)' }}>You have {r.haveCount} of {r.total} ingredients</div>
        {r.missingCore.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] font-semibold" style={{ color: 'var(--danger)' }}>Need:</span>
            {r.missingCore.map(m => <span key={m.id} className="chip" style={{ background: '#FBECE9', color: 'var(--danger)' }}>{m.item}</span>)}
            <button className="chip" style={wanted ? {} : { background: 'var(--green)', color: '#fff' }} disabled={wanted} onClick={onWant}>
              <ShoppingBasket size={12} />{wanted ? 'On next order' : 'Add to next order'}
            </button>
          </div>
        )}
        {r.missingOther.length > 0 && <div className="text-[12px] mt-1.5" style={{ color: 'var(--text-soft)' }}>Optional/swappable missing: {r.missingOther.map(m => m.item).join(', ')}</div>}
      </div>
    </div>
  );
}

export default function CanMake() {
  const { push, back, canBack, go } = useNav();
  const res = useLoad(() => api.canMake(), []);
  const [wanted, setWanted] = React.useState(() => new Set());
  useEffect(() => { const r = () => res.reload(); window.addEventListener('pantry-updated', r); return () => window.removeEventListener('pantry-updated', r); }, [res.reload]);

  const want = async r => {
    setWanted(s => new Set([...s, r.id]));
    try { for (const m of r.missingCore) await api.addPantry({ itemName: m.item, kind: 'want' }); }
    catch (e) { alert(e.message); }
  };

  let body;
  if (res.error) body = <ErrorBox message={res.error} onRetry={res.reload} />;
  else if (!res.data) body = <Spinner label="Checking your pantry…" />;
  else {
    const d = res.data;
    const now = d.results.filter(r => r.tier === 'now');
    const one = d.results.filter(r => r.tier === 'one');
    if (!d.pantryCount) body = <Empty icon={Package} title="Your pantry is empty">Tell Claude what you've got, or add items on the Pantry page.<div className="mt-3"><button className="btn btn-soft" onClick={() => go('pantry')}>Open Pantry</button></div></Empty>;
    else if (!now.length && !one.length) body = <Empty icon={ChefHat} title="Nothing quite yet">None of your {d.recipeCount} recipes are within one ingredient of what's in the pantry.</Empty>;
    else body = (
      <div className="grid gap-5">
        {now.length > 0 && <section>
          <div className="section-label mb-2 px-1 flex items-center gap-1.5" style={{ color: 'var(--green)' }}><CheckCircle2 size={14} />Make it now ({now.length})</div>
          <div className="grid gap-2">{now.map(r => <Card key={r.id} r={r} onOpen={() => push('recipe', { id: r.id })} />)}</div>
        </section>}
        {one.length > 0 && <section>
          <div className="section-label mb-2 px-1 flex items-center gap-1.5"><CircleDashed size={14} />One ingredient away ({one.length})</div>
          <div className="grid gap-2">{one.map(r => <Card key={r.id} r={r} wanted={wanted.has(r.id)} onWant={() => want(r)} onOpen={() => push('recipe', { id: r.id })} />)}</div>
        </section>}
      </div>
    );
  }

  return (
    <div className="page narrow">
      <PageHeader title="What can I make?" onBack={canBack ? back : undefined} subtitle={res.data ? `Checked ${res.data.recipeCount} recipes against ${res.data.pantryCount} pantry items` : null} />
      {body}
    </div>
  );
}
