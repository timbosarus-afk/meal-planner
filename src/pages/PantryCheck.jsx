import React, { useState } from 'react';
import { X, Check, ShoppingCart, ChevronLeft, ClipboardCheck } from 'lucide-react';
import { Spinner, ErrorBox, useLoad } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useNav } from '../lib/nav.js';
import { useWeeks } from '../lib/weeks.jsx';
import { fmtWeek } from '../lib/format.js';

// One card per always-have item this week's recipes use: "Olive oil - got it?"
// No marks it out_of_stock, which puts it on the shopping list until the week
// is ordered.
export default function PantryCheck({ planId: givenId }) {
  const { back, go } = useNav();
  const { selected, weeks } = useWeeks();
  const planId = givenId || (selected && selected.id);
  const items = useLoad(() => (planId ? api.pantryCheck(planId) : Promise.resolve([])), [planId]);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState(false);

  const list = items.data || [];
  const done = items.data && i >= list.length;
  const item = list[i];

  const answer = async have => {
    setBusy(true);
    try {
      await api.patchPantry({ id: item.id, outOfStock: !have });
      setAnswers(a => ({ ...a, [item.id]: have }));
      setI(i + 1);
      window.dispatchEvent(new Event('pantry-updated'));
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  };

  const ranOut = list.filter(x => answers[x.id] === false || (answers[x.id] === undefined && x.out_of_stock));

  return (
    <div className="min-h-[100dvh] flex flex-col max-w-[640px] mx-auto px-4" style={{ paddingTop: 'calc(var(--safe-top) + 12px)', paddingBottom: 'calc(var(--safe-bottom) + 16px)', background: 'var(--bg)' }}>
      <div className="flex items-center gap-3 mb-3">
        <button aria-label="Close pantry check" onClick={back} className="w-10 h-10 rounded-full flex items-center justify-center card"><X size={20} /></button>
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold text-[16px]">Pantry check</div>
          <div className="text-[13px]" style={{ color: 'var(--text-soft)' }}>
            {selected && !givenId ? `Week of ${fmtWeek(selected.week_start_date)}` : 'Always-have items this week uses'}
            {items.data && !done && ` · ${i + 1} of ${list.length}`}
          </div>
        </div>
      </div>
      {items.data && list.length > 0 && (
        <div className="h-1.5 rounded-full mb-3 overflow-hidden" style={{ background: '#E1E8E4' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${(Math.min(i, list.length) / list.length) * 100}%`, background: 'var(--green)' }} />
        </div>
      )}

      {items.error ? <ErrorBox message={items.error} onRetry={items.reload} />
        : !items.data || (!planId && !weeks) || items.loading ? <Spinner />
        : done ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-2">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}><ClipboardCheck size={38} /></div>
            <h2 className="font-display font-extrabold text-[26px]" style={{ color: 'var(--green)' }}>{list.length ? 'All checked' : 'Nothing to check'}</h2>
            {!list.length && <p className="mt-1 text-[15px]" style={{ color: 'var(--text-soft)' }}>This week's meals don't use any always-have items.</p>}
            {list.length > 0 && (ranOut.length
              ? <p className="mt-2 text-[15px]" style={{ color: 'var(--text-soft)' }}>{ranOut.length} added to this week's shopping list:<br /><strong style={{ color: 'var(--text)' }}>{ranOut.map(x => x.item_name).join(', ')}</strong></p>
              : <p className="mt-2 text-[15px]" style={{ color: 'var(--text-soft)' }}>You've got everything. Nothing added to the shopping list.</p>)}
            <div className="w-full grid gap-2 mt-8">
              {ranOut.length > 0 && <button className="btn btn-primary w-full py-4" onClick={() => go('shopping')}><ShoppingCart size={19} />See shopping list</button>}
              <button className={`btn w-full ${ranOut.length ? 'btn-ghost' : 'btn-primary py-4'}`} onClick={back}>Done</button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 flex flex-col justify-center text-center py-6">
              <div className="section-label mb-3">{item.section}</div>
              <h2 className="font-display font-extrabold text-[34px] leading-tight capitalize-first" style={{ color: 'var(--text)' }}>{item.item_name}</h2>
              <p className="font-display font-bold text-[22px] mt-1" style={{ color: 'var(--green-mid)' }}>got it?</p>
              <p className="text-[14px] mt-4" style={{ color: 'var(--text-soft)' }}>For {item.usedIn.join(', ')}</p>
              {item.out_of_stock && answers[item.id] === undefined && <p className="text-[13px] mt-2" style={{ color: '#8A5A00' }}>Marked as run out last time</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button className="btn py-6 text-[20px] text-white" style={{ background: 'var(--danger)' }} disabled={busy} onClick={() => answer(false)}><X size={24} />No</button>
              <button className="btn btn-primary py-6 text-[20px]" disabled={busy} onClick={() => answer(true)}><Check size={24} />Yes</button>
            </div>
            <button className="btn btn-ghost mt-2 w-full" disabled={i === 0} onClick={() => setI(i - 1)} style={{ visibility: i ? 'visible' : 'hidden' }}><ChevronLeft size={18} />Back</button>
          </>
        )}
    </div>
  );
}
PantryCheck.fullscreen = true;
