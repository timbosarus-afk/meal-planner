import React, { useEffect, useState } from 'react';
import { Clock, Sandwich, CheckCircle2, Trash2, CalendarX2, Star } from 'lucide-react';
import { PageHeader, Spinner, ErrorBox, Empty, useLoad } from '../components/ui.jsx';
import WeekSelect from '../components/WeekSelect.jsx';
import RecipeThumb from '../components/RecipeThumb.jsx';
import { ConfirmSheet } from '../components/Sheet.jsx';
import { useWeeks } from '../lib/weeks.jsx';
import { useNav } from '../lib/nav.js';
import { api } from '../lib/api.js';
import { displayName, fmtWeek, pickCurrentWeek } from '../lib/format.js';

// Extra portions beyond the week's target are cooked for lunch the next day.
export const extraLunch = (r, plan) => r.servingsOverride && plan ? Math.max(0, r.servingsOverride - plan.servings_target) : 0;

function MealCard({ recipe, plan, onOpen }) {
  const lunch = extraLunch(recipe, plan);
  // Cooked since the plan was made (or since the week started, if earlier)
  const since = [plan.week_start_date, (plan.created_at || '').slice(0, 10)].filter(Boolean).sort()[0];
  const cooked = recipe.last_cooked && recipe.last_cooked >= since;
  const mins = (recipe.prep_time_minutes || 0) + (recipe.cook_time_minutes || 0);
  return (
    <button onClick={onOpen} className="card w-full text-left flex gap-3 p-3 active:scale-[0.99] transition-transform">
      <RecipeThumb recipe={recipe} className="w-[84px] h-[84px] shrink-0" />
      <div className="min-w-0 flex-1 py-0.5">
        <div className="font-display font-bold text-[17px] leading-snug" style={{ color: 'var(--text)' }}>{displayName(recipe)}</div>
        <div className="mt-1 flex items-center gap-3 text-[13px]" style={{ color: 'var(--text-soft)' }}>
          {mins > 0 && <span className="flex items-center gap-1"><Clock size={14} />{mins} min</span>}
          {recipe.cuisine && <span className="truncate">{recipe.cuisine}</span>}
          {recipe.rating ? <span className="flex items-center gap-0.5"><Star size={13} fill="currentColor" style={{ color: 'var(--amber)' }} />{recipe.rating}</span> : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {lunch > 0 && <span className="chip" style={{ background: '#FFF3DC', color: '#8A5A00' }}><Sandwich size={13} />+{lunch} for lunch tomorrow</span>}
          {cooked && <span className="chip"><CheckCircle2 size={13} />Cooked</span>}
        </div>
      </div>
    </button>
  );
}

export default function ThisWeek() {
  const { weeks, error: weeksError, selected, reload: reloadWeeks, removeWeek } = useWeeks();
  const { push } = useNav();
  const plan = useLoad(() => (selected ? api.week(selected.id) : Promise.resolve(null)), [selected && selected.id]);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { const r = () => plan.reload(); window.addEventListener('recipe-updated', r); return () => window.removeEventListener('recipe-updated', r); }, [plan.reload]);
  const [busy, setBusy] = useState(false);

  const current = pickCurrentWeek(weeks);
  const isOld = selected && current && selected.week_start_date < current.week_start_date;

  const doDelete = async () => {
    setBusy(true);
    try { await removeWeek(selected.id); setConfirm(false); }
    catch (e) { alert(e.message); }
    finally { setBusy(false); }
  };

  let body;
  if (weeksError) body = <ErrorBox message={weeksError} onRetry={reloadWeeks} />;
  else if (!weeks) body = <Spinner />;
  else if (!weeks.length) body = <Empty icon={CalendarX2} title="No weeks planned yet">Ask Claude to plan next week's meals and they'll show up here.</Empty>;
  else if (plan.error) body = <ErrorBox message={plan.error} onRetry={plan.reload} />;
  else if (!plan.data || plan.loading) body = <Spinner />;
  else {
    const p = plan.data;
    const totalLunch = p.recipes.reduce((n, r) => n + extraLunch(r, p), 0);
    body = (
      <>
        <p className="text-[14px] mb-3 px-1" style={{ color: 'var(--text-soft)' }}>
          {p.recipes.length} meal{p.recipes.length === 1 ? '' : 's'} · cooking for {p.servings_target}
          {totalLunch > 0 && ` · ${totalLunch} lunch portion${totalLunch === 1 ? '' : 's'}`}
        </p>
        {p.recipes.length ? (
          <div className="grid gap-3">
            {p.recipes.map(r => <MealCard key={r.id} recipe={r} plan={p} onOpen={() => push('recipe', { id: r.id, servings: r.servingsOverride || p.servings_target })} />)}
          </div>
        ) : <Empty icon={CalendarX2} title="No meals in this week" />}
        <button className="btn btn-danger w-full mt-8" onClick={() => setConfirm(true)}>
          <Trash2 size={17} /> Delete this week
        </button>
      </>
    );
  }

  return (
    <div className="page">
      <PageHeader title="This Week" />
      {weeks && weeks.length > 0 && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <WeekSelect />
          {isOld && <span className="chip" style={{ background: '#EEF0EF', color: 'var(--text-soft)' }}>Past week</span>}
        </div>
      )}
      {body}
      <ConfirmSheet open={confirm} onClose={() => setConfirm(false)} busy={busy} onConfirm={doDelete}
        title="Delete this week?"
        message={selected ? `${fmtWeek(selected.week_start_date)} and its shopping list will be removed. The recipes stay in your Recipes.` : ''}
        confirmLabel="Delete week" />
    </div>
  );
}
