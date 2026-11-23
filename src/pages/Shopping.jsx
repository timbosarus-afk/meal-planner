import React, { useMemo, useState } from 'react';
import { ShoppingCart, Check, Sparkles, ListChecks, Send, Eye, EyeOff, Monitor, Package } from 'lucide-react';
import { PageHeader, Spinner, ErrorBox, Empty, useLoad } from '../components/ui.jsx';
import WeekSelect from '../components/WeekSelect.jsx';
import { useWeeks } from '../lib/weeks.jsx';
import { api } from '../lib/api.js';
import { fmtQty } from '../lib/format.js';

// Retailers: only Sainsbury's for now, but the button reads from this list so
// others can be added later.
const RETAILERS = [{ id: 'sainsburys', name: "Sainsbury's", color: '#F06C00' }];

const SECTION_ORDER = ['Fruit & Veg', 'Meat & Fish', 'Dairy & Eggs', 'Bakery', 'Frozen', 'Store Cupboard', 'Herbs & Spices', 'Other'];

function Row({ it, onToggle }) {
  const on = it.gotIt;
  const qty = it.quantity != null ? fmtQty(it.quantity, it.unit) : (it.unit || '');
  return (
    <button onClick={() => onToggle(it)} className="w-full flex items-start gap-3 px-4 py-3 text-left" style={{ opacity: on ? 0.45 : 1 }}>
      <span className="mt-0.5 w-6 h-6 shrink-0 rounded-md border-2 flex items-center justify-center"
        style={{ background: on ? 'var(--green)' : '#fff', borderColor: on ? 'var(--green)' : '#C5CEC9' }}>
        {on && <Check size={15} color="#fff" strokeWidth={3} />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[16px] leading-snug" style={{ textDecoration: on ? 'line-through' : 'none' }}>
          {qty && <strong className="font-semibold">{qty} </strong>}{it.item}
        </span>
        {(it.note || it.outOfStock || it.usedIn?.length > 0 || it.have) && (
          <span className="block text-[13px] mt-0.5" style={{ color: 'var(--text-soft)' }}>
            {it.outOfStock && !it.note && <span style={{ color: 'var(--danger)' }}>Ran out (pantry check)</span>}
            {it.note && <span style={{ color: it.outOfStock ? 'var(--danger)' : '#8A5A00' }}>{it.note}</span>}
            {(it.note || it.outOfStock) && it.usedIn?.length > 0 && ' · '}
            {it.usedIn?.length > 0 && it.usedIn.join(', ')}
            {it.have && <span className="chip ml-1 py-0 text-[11px]"><Package size={11} />have {it.have}</span>}
          </span>
        )}
      </span>
    </button>
  );
}

export default function Shopping() {
  const { weeks, error: weeksError, selected, reload: reloadWeeks } = useWeeks();
  const list = useLoad(() => (selected ? api.shoppingList(selected.id) : Promise.resolve(null)), [selected && selected.id]);
  const [hideDone, setHideDone] = useState(false);
  const [sending, setSending] = useState(false);
  const d = list.data;

  const groups = useMemo(() => {
    if (!d) return [];
    const by = new Map();
    const items = d.curated ? [...d.shoppingList].sort((a, b) => a.position - b.position) : d.shoppingList;
    items.forEach(it => { const k = it.category || 'Other'; if (!by.has(k)) by.set(k, []); by.get(k).push(it); });
    const keys = [...by.keys()];
    if (!d.curated) keys.sort((a, b) => (SECTION_ORDER.indexOf(a) + 99) % 99 - (SECTION_ORDER.indexOf(b) + 99) % 99);
    return keys.map(k => [k, by.get(k)]);
  }, [d]);

  const toggle = async it => {
    const next = !it.gotIt;
    list.setData(cur => ({ ...cur, shoppingList: cur.shoppingList.map(x => (x === it ? { ...x, gotIt: next } : x)) }));
    try {
      if (d.curated) await api.checkItem(d.planId, it.id, next);
      else if (next) await api.exclude(d.planId, it.item);
      else await api.unexclude(d.planId, it.item);
    } catch (e) {
      alert(e.message);
      list.setData(cur => ({ ...cur, shoppingList: cur.shoppingList.map(x => (x.item === it.item && x.id === it.id ? { ...x, gotIt: !next } : x)) }));
    }
  };

  const send = async () => {
    setSending(true);
    try { await api.sendToShop(d.planId); list.setData(cur => ({ ...cur, status: 'sent' })); }
    catch (e) { alert(e.message); }
    finally { setSending(false); }
  };

  let body;
  if (weeksError) body = <ErrorBox message={weeksError} onRetry={reloadWeeks} />;
  else if (!weeks) body = <Spinner />;
  else if (!weeks.length) body = <Empty icon={ShoppingCart} title="No weeks yet">Once Claude plans a week, its shopping list shows up here.</Empty>;
  else if (list.error) body = <ErrorBox message={list.error} onRetry={list.reload} />;
  else if (!d || list.loading) body = <Spinner />;
  else {
    const total = d.shoppingList.length, done = d.shoppingList.filter(i => i.gotIt).length;
    const shop = RETAILERS[0];
    const sent = d.status === 'sent', ordered = d.status === 'ordered';
    body = (
      <>
        <div className="flex items-center gap-2 mb-3 px-1 text-[13px]" style={{ color: 'var(--text-soft)' }}>
          {d.curated
            ? <span className="chip"><Sparkles size={13} />Claude's list</span>
            : <span className="chip" style={{ background: '#EEF0EF', color: 'var(--text-soft)' }}><ListChecks size={13} />From recipes</span>}
          <span className="whitespace-nowrap">{done}/{total}</span>
          <button className="ml-auto flex items-center gap-1 font-semibold py-1 whitespace-nowrap" style={{ color: 'var(--green)' }} onClick={() => setHideDone(h => !h)}>
            {hideDone ? <><Eye size={15} />Show all</> : <><EyeOff size={15} />Hide ticked</>}
          </button>
        </div>
        <div className="h-1.5 rounded-full mb-4 overflow-hidden" style={{ background: '#E1E8E4' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%`, background: 'var(--green)' }} />
        </div>

        {!total && <Empty icon={ShoppingCart} title="Nothing to buy" />}
        <div className="grid gap-4">
          {groups.map(([section, items]) => {
            const shown = hideDone ? items.filter(i => !i.gotIt) : items;
            if (!shown.length) return null;
            return (
              <section key={section}>
                <div className="section-label mb-1.5 px-1">{section}</div>
                <div className="card overflow-hidden divide-y" style={{ borderColor: 'var(--line)' }}>
                  {shown.map((it, k) => <Row key={it.id || it.item + k} it={it} onToggle={toggle} />)}
                </div>
              </section>
            );
          })}
          {d.staples && d.staples.length > 0 && (
            <section>
              <div className="section-label mb-1.5 px-1">Check you have (always in the pantry)</div>
              <div className="card p-4 text-[15px]" style={{ color: 'var(--text-soft)' }}>{d.staples.join(', ')}</div>
            </section>
          )}
        </div>

        <section className="card p-4 mt-6">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: shop.color }} />
            <span className="font-display font-bold text-[17px]">{shop.name}</span>
            {(sent || ordered) && <span className="chip ml-auto">{ordered ? 'Ordered' : 'Sent'}</span>}
          </div>
          <p className="text-[13px] mb-3" style={{ color: 'var(--text-soft)' }}>
            {d.basket.length} item{d.basket.length === 1 ? '' : 's'} linked to products · {d.unlinked.length} to pick in the extension
          </p>
          <button className="btn w-full text-white py-3.5" style={{ background: shop.color }} onClick={send} disabled={sending}>
            <Send size={18} />{sending ? 'Sending…' : sent ? `Send to ${shop.name} again` : `Send to ${shop.name}`}
          </button>
          {sent && <p className="text-[13px] mt-3 flex items-start gap-2" style={{ color: 'var(--text-soft)' }}><Monitor size={16} className="shrink-0 mt-0.5" />Open the meal planner extension in Chrome on your PC; this week is picked automatically.</p>}
        </section>
      </>
    );
  }

  return (
    <div className="page">
      <PageHeader title="Shopping" />
      {weeks && weeks.length > 0 && <div className="mb-3"><WeekSelect /></div>}
      {body}
    </div>
  );
}
