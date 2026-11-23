import React, { useRef, useState } from 'react';
import { ChevronLeft, Camera, Search, Clock, Users, Minus, Plus, ListChecks, CookingPot, Check, MoreHorizontal, Trash2, Pencil, ChefHat, CalendarCheck } from 'lucide-react';
import { PageHeader, Spinner, ErrorBox, useLoad } from '../components/ui.jsx';
import Segmented from '../components/Segmented.jsx';
import Rating from '../components/Rating.jsx';
import RecipeThumb from '../components/RecipeThumb.jsx';
import Sheet, { ConfirmSheet } from '../components/Sheet.jsx';
import CookSteps from './CookSteps.jsx';
import { api } from '../lib/api.js';
import { useNav } from '../lib/nav.js';
import { displayName, fmtQty, costLine, notPricedText } from '../lib/format.js';
import { googleImagesUrl, scaleQty, steps as getSteps, uploadRecipePhoto, fmtCookedDate } from '../lib/recipe.js';

const ROLE_LABEL = { optional: 'optional', swappable: 'swappable' };

function Hero({ recipe, onPhoto, uploading }) {
  const fileRef = useRef(null);
  const pick = () => fileRef.current && fileRef.current.click();
  const input = <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files[0]; e.target.value = ''; if (f) onPhoto(f); }} />;
  if (recipe.image_url) {
    return (
      <div className="relative mb-4 rounded-3xl overflow-hidden" style={{ boxShadow: 'var(--shadow)' }}>
        <RecipeThumb recipe={recipe} rounded="" className="w-full h-[260px]" iconSize={44} />
        <button onClick={pick} disabled={uploading} className="absolute bottom-3 right-3 btn py-2 px-3 text-[13px] bg-white/90 backdrop-blur" style={{ color: 'var(--green)' }}>
          <Camera size={16} />{uploading ? 'Uploading…' : 'Change photo'}
        </button>
        {input}
      </div>
    );
  }
  return (
    <div className="mb-4 rounded-3xl overflow-hidden relative" style={{ boxShadow: 'var(--shadow)' }}>
      <RecipeThumb recipe={recipe} rounded="" className="w-full h-[150px]" iconSize={40} />
      <div className="absolute inset-x-3 bottom-3 grid grid-cols-2 gap-2">
        <button className="btn py-2.5 text-[14px] bg-white/95" style={{ color: 'var(--green)' }} onClick={pick} disabled={uploading}><Camera size={16} />{uploading ? 'Uploading…' : 'Add photo'}</button>
        <a className="btn py-2.5 text-[14px] bg-white/95" style={{ color: 'var(--green)' }} href={googleImagesUrl(recipe.title)} target="_blank" rel="noreferrer"><Search size={16} />Search Google</a>
      </div>
      {input}
    </div>
  );
}

function Ingredients({ recipe, target }) {
  const [got, setGot] = useState(() => new Set());
  const toggle = id => setGot(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const ings = recipe.ingredients || [];
  if (!ings.length) return <p className="py-6 text-center" style={{ color: 'var(--text-soft)' }}>No ingredients listed.</p>;
  return (
    <>
      <p className="text-[13px] mb-2 px-1" style={{ color: 'var(--text-soft)' }}>Tick things off as you get them out. {got.size}/{ings.length}</p>
      <div className="card overflow-hidden">
        {ings.map((i, idx) => {
          const on = got.has(i.id);
          const qty = fmtQty(scaleQty(i.quantity, recipe.servings, target), i.unit);
          return (
            <button key={i.id} onClick={() => toggle(i.id)} className="w-full flex items-start gap-3 px-4 py-3 text-left"
              style={{ borderTop: idx ? '1px solid var(--line)' : 'none', opacity: on ? 0.45 : 1 }}>
              <span className="mt-0.5 w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center"
                style={{ background: on ? 'var(--green)' : '#fff', borderColor: on ? 'var(--green)' : '#C5CEC9' }}>
                {on && <Check size={14} color="#fff" strokeWidth={3} />}
              </span>
              <span className="flex-1 text-[16px] leading-snug" style={{ textDecoration: on ? 'line-through' : 'none' }}>
                {qty && <strong className="font-semibold">{qty} </strong>}{i.item}
                {i.notes && <span style={{ color: 'var(--text-soft)' }}>, {i.notes}</span>}
              </span>
              {ROLE_LABEL[i.role] && <span className="chip shrink-0" style={{ background: '#EEF0EF', color: 'var(--text-soft)' }}>{ROLE_LABEL[i.role]}</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}

export default function RecipeDetail({ id, servings: initialServings }) {
  const { back } = useNav();
  const rec = useLoad(() => api.recipe(id), [id]);
  const [tab, setTab] = useState('ingredients');
  const [target, setTarget] = useState(initialServings || null);
  const [uploading, setUploading] = useState(false);
  const [menu, setMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rename, setRename] = useState(null);

  if (rec.error) return <div className="page"><PageHeader title="Recipe" onBack={back} /><ErrorBox message={rec.error} onRetry={rec.reload} /></div>;
  if (!rec.data) return <div className="page"><PageHeader title="" onBack={back} /><Spinner /></div>;
  const r = rec.data;
  const serves = target || r.servings || 2;
  const update = async patch => {
    const before = r;
    rec.setData(d => ({ ...d, ...patch.local }));
    try { await api.patchRecipe(r.id, patch.body); }
    catch (e) { rec.setData(before); alert(e.message); }
  };

  const onPhoto = async file => {
    setUploading(true);
    try { const url = await uploadRecipePhoto(r.id, file); await api.patchRecipe(r.id, { imageUrl: url }); rec.setData(d => ({ ...d, image_url: url })); }
    catch (e) { alert('Photo upload failed: ' + e.message); }
    finally { setUploading(false); }
  };
  const mins = (r.prep_time_minutes || 0) + (r.cook_time_minutes || 0);
  const tags = (r.tags || []);

  return (
    <div className="page">
      <button onClick={back} className="-ml-2 mb-2 flex items-center gap-1 text-[15px] font-semibold py-1 px-2 rounded-lg" style={{ color: 'var(--green)' }}>
        <ChevronLeft size={20} /> Back
      </button>
      <Hero recipe={r} onPhoto={onPhoto} uploading={uploading} />
      <PageHeader title={displayName(r)}
        subtitle={r.nickname && r.nickname !== r.title ? r.title : null}
        right={<button aria-label="Recipe options" className="p-2 rounded-xl active:bg-black/5" onClick={() => setMenu(true)}><MoreHorizontal size={22} style={{ color: 'var(--green)' }} /></button>} />

      <div className="flex flex-wrap gap-1.5 -mt-1 mb-4">
        {r.cuisine && <span className="chip">{r.cuisine}</span>}
        {tags.map(t => <span key={t} className="chip" style={t === 'lunch-friendly' ? { background: '#FFF3DC', color: '#8A5A00' } : { background: '#EEF0EF', color: 'var(--text-soft)' }}>{t}</span>)}
        {r.source === 'claude' && <span className="chip" style={{ background: '#EEF0EF', color: 'var(--text-soft)' }}>from Claude</span>}
      </div>

      <div className="card p-3 mb-4 flex items-center justify-between gap-2 text-[14px]" style={{ color: 'var(--text-soft)' }}>
        {mins > 0 && <span className="flex items-center gap-1.5"><Clock size={16} />{mins} min</span>}
        {r.last_cooked && <span className="flex items-center gap-1.5"><CalendarCheck size={16} />Cooked {fmtCookedDate(r.last_cooked)}</span>}
        <span className="flex items-center gap-1 ml-auto">
          <Users size={16} />
          <button aria-label="Fewer servings" className="w-8 h-8 rounded-full flex items-center justify-center btn-soft" onClick={() => setTarget(Math.max(1, serves - 1))}><Minus size={15} /></button>
          <span className="w-6 text-center font-bold text-[16px]" style={{ color: 'var(--text)' }}>{serves}</span>
          <button aria-label="More servings" className="w-8 h-8 rounded-full flex items-center justify-center btn-soft" onClick={() => setTarget(serves + 1)}><Plus size={15} /></button>
        </span>
      </div>

      {r.cost && (r.cost.total > 0 || r.cost.notPriced > 0) && (() => {
        // Total scales with the servings stepper; per serving stays the same
        const scaled = { ...r.cost, total: r.cost.servings ? Math.round(r.cost.total * serves / r.cost.servings * 100) / 100 : r.cost.total };
        return (
          <div className="flex items-center gap-2 -mt-2 mb-4 px-1 text-[14px]" style={{ color: 'var(--text-soft)' }}>
            {costLine(scaled) && <span className="font-semibold" style={{ color: 'var(--green)' }}>{costLine(scaled)}</span>}
            {r.cost.notPriced > 0 && <span>{costLine(scaled) ? '· ' : ''}{notPricedText(r.cost.notPriced)}</span>}
          </div>
        );
      })()}

      <div className="mb-4">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'ingredients', label: 'Ingredients', icon: ListChecks }, { value: 'cook', label: 'How to Cook', icon: CookingPot }]} />
      </div>

      {tab === 'ingredients'
        ? <Ingredients recipe={r} target={serves} />
        : <CookSteps recipe={r} steps={getSteps(r)} />}

      <section className="card p-4 mt-6">
        <div className="flex items-center gap-2 mb-1"><ChefHat size={18} style={{ color: 'var(--green)' }} /><span className="font-display font-bold text-[17px]">Your rating</span></div>
        <Rating value={r.rating} onChange={v => update({ local: { rating: v }, body: { rating: v } })} />
        {r.rating_notes && <p className="text-[14px] mt-2" style={{ color: 'var(--text-soft)' }}>“{r.rating_notes}”</p>}
      </section>

      <Sheet open={menu} onClose={() => setMenu(false)} title={displayName(r)}>
        <div className="grid gap-2">
          <button className="btn btn-soft w-full justify-start" onClick={() => { setMenu(false); setRename(r.nickname || ''); }}><Pencil size={17} />Rename (short name)</button>
          {r.image_url && <a className="btn btn-soft w-full justify-start" href={googleImagesUrl(r.title)} target="_blank" rel="noreferrer"><Search size={17} />Search Google images</a>}
          <button className="btn btn-danger w-full justify-start" onClick={() => { setMenu(false); setConfirmDelete(true); }}><Trash2 size={17} />Delete recipe</button>
        </div>
      </Sheet>
      <Sheet open={rename !== null} onClose={() => setRename(null)} title="Short name">
        <input className="input mb-3" value={rename || ''} placeholder={r.title} onChange={e => setRename(e.target.value)} autoFocus />
        <button className="btn btn-primary w-full" onClick={() => { update({ local: { nickname: rename.trim() || null }, body: { nickname: rename } }); setRename(null); }}>Save</button>
      </Sheet>
      <ConfirmSheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this recipe?"
        message="It will also be removed from any weeks it's in. This can't be undone."
        confirmLabel="Delete recipe"
        onConfirm={async () => { try { await api.deleteRecipe(r.id); back(); } catch (e) { alert(e.message); } }} />
    </div>
  );
}
