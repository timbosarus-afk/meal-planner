import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Package, Refrigerator, Snowflake, Archive, ShoppingBasket, Infinity as Always, Sparkles } from 'lucide-react';
import { PageHeader, Spinner, ErrorBox, Empty, useLoad } from '../components/ui.jsx';
import Segmented from '../components/Segmented.jsx';
import Sheet from '../components/Sheet.jsx';
import { api } from '../lib/api.js';
import { useNav } from '../lib/nav.js';
import { fmtQty } from '../lib/format.js';

// Sections match lib/pantry-sections.js
const KINDS = {
  stock: { label: 'Have now', icon: Package, sections: ['Fridge', 'Freezer', 'Cupboard'] },
  always: { label: 'Always', icon: Always, sections: ['Spices & Herbs', 'Oils, Sauces & Condiments', 'Baking & Dry Goods'] },
  want: { label: 'Next order', icon: ShoppingBasket, sections: ['Next order'] }
};
const changed = () => window.dispatchEvent(new Event('pantry-updated'));
const SECTION_ICON = { Fridge: Refrigerator, Freezer: Snowflake, Cupboard: Archive };

function ItemSheet({ item, onClose, onSave, onDelete }) {
  const [qty, setQty] = useState(item ? (item.quantity ?? '') : '');
  const [unit, setUnit] = useState(item ? (item.unit || '') : '');
  const [section, setSection] = useState(item ? item.section : '');
  if (!item) return null;
  const k = KINDS[item.kind] || KINDS.stock;
  return (
    <Sheet open onClose={onClose} title={item.item_name}>
      {item.kind === 'stock' && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <input className="input" type="number" inputMode="decimal" placeholder="Quantity" value={qty} onChange={e => setQty(e.target.value)} />
          <input className="input" placeholder="Unit (g, ml, pack…)" value={unit} onChange={e => setUnit(e.target.value)} />
        </div>
      )}
      {k.sections.length > 1 && (
        <select className="select input mb-3" value={section} onChange={e => setSection(e.target.value)}>
          {k.sections.map(s => <option key={s}>{s}</option>)}
        </select>
      )}
      <div className="grid gap-2">
        <button className="btn btn-primary w-full" onClick={() => onSave({ quantity: qty, unit, section })}>Save</button>
        <button className="btn btn-danger w-full" onClick={onDelete}><Trash2 size={17} />Remove</button>
      </div>
    </Sheet>
  );
}

export default function Pantry() {
  const { back, canBack } = useNav();
  const items = useLoad(() => api.pantry(), []);
  const [kind, setKind] = useState('stock');
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);

  const groups = useMemo(() => {
    if (!items.data) return [];
    const mine = items.data.filter(i => i.kind === kind);
    const secs = [...KINDS[kind].sections, ...new Set(mine.map(i => i.section).filter(s => !KINDS[kind].sections.includes(s)))];
    return secs.map(s => [s, mine.filter(i => i.section === s)]).filter(([, l]) => l.length);
  }, [items.data, kind]);
  const counts = useMemo(() => Object.fromEntries(Object.keys(KINDS).map(k => [k, (items.data || []).filter(i => i.kind === k).length])), [items.data]);

  const add = async e => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setAdding(true);
    try { await api.addPantry({ itemName: n, kind }); setName(''); await items.reload(); changed(); }
    catch (err) { alert(err.message); }
    finally { setAdding(false); }
  };
  const save = async patch => {
    const it = editing; setEditing(null);
    try { await api.patchPantry({ id: it.id, ...patch }); await items.reload(); changed(); } catch (e) { alert(e.message); }
  };
  const remove = async () => {
    const it = editing; setEditing(null);
    items.setData(d => d.filter(x => x.id !== it.id));
    try { await api.deletePantry(it.id); changed(); } catch (e) { alert(e.message); items.reload(); }
  };

  return (
    <div className="page">
      <PageHeader title="Pantry" onBack={canBack ? back : undefined} />
      <p className="text-[14px] -mt-2 mb-4 flex items-start gap-2" style={{ color: 'var(--text-soft)' }}>
        <Sparkles size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--green-mid)' }} />
        Tell Claude what's in the fridge and it'll update this. You can tweak it here too.
      </p>
      <div className="mb-4">
        <Segmented value={kind} onChange={setKind} options={Object.entries(KINDS).map(([k, v]) => ({ value: k, label: `${v.label}${counts[k] ? ` ${counts[k]}` : ''}` }))} />
      </div>
      <form onSubmit={add} className="flex gap-2 mb-5">
        <input className="input" placeholder={kind === 'stock' ? 'Add something you have' : kind === 'always' ? 'Add something you always have' : 'Add to next order'} value={name} onChange={e => setName(e.target.value)} />
        <button className="btn btn-primary px-4" disabled={adding || !name.trim()} aria-label="Add"><Plus size={20} /></button>
      </form>

      {items.error ? <ErrorBox message={items.error} onRetry={items.reload} />
        : !items.data ? <Spinner />
        : !groups.length ? <Empty icon={KINDS[kind].icon} title="Nothing here yet">{kind === 'stock' ? 'Ask Claude: "we have half a bag of spinach, 4 eggs and some feta".' : kind === 'always' ? 'Staples you never run out of, like salt and oil.' : 'Extras to add to the next shop.'}</Empty>
        : (
          <div className="grid gap-4">
            {groups.map(([sec, list]) => {
              const Icon = SECTION_ICON[sec];
              return (
                <section key={sec}>
                  <div className="section-label mb-1.5 px-1 flex items-center gap-1.5">{Icon && <Icon size={14} />}{sec}</div>
                  <div className="card overflow-hidden divide-y" style={{ borderColor: 'var(--line)' }}>
                    {list.map(it => (
                      <button key={it.id} onClick={() => setEditing(it)} className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-black/5">
                        <span className="flex-1 text-[16px] capitalize-first">{it.item_name}</span>
                        {it.quantity != null && <span className="text-[14px] font-semibold" style={{ color: 'var(--text-soft)' }}>{fmtQty(it.quantity, it.unit)}</span>}
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      {editing && <ItemSheet key={editing.id} item={editing} onClose={() => setEditing(null)} onSave={save} onDelete={remove} />}
    </div>
  );
}
