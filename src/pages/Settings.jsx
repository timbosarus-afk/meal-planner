import React, { useState } from 'react';
import { ArrowUp, ArrowDown, Check, Bell, BellOff, Send, Share, PlusSquare } from 'lucide-react';
import { usePush, isIOS } from '../lib/push.js';
import { PageHeader } from '../components/ui.jsx';
import { TABS, PINNABLE, MAX_BAR } from '../lib/tabs.js';
import { usePrefs } from '../lib/prefs.jsx';
import { useNav } from '../lib/nav.js';

function TabPicker() {
  const { bar, setBar } = usePrefs();
  const toggle = key => {
    if (bar.includes(key)) { if (bar.length > 1) setBar(bar.filter(t => t !== key)); }
    else if (bar.length < MAX_BAR) setBar([...bar, key]);
  };
  const move = (key, dir) => {
    const i = bar.indexOf(key), j = i + dir;
    if (j < 0 || j >= bar.length) return;
    const next = [...bar]; [next[i], next[j]] = [next[j], next[i]]; setBar(next);
  };
  const ordered = [...bar, ...PINNABLE.filter(t => !bar.includes(t))];
  return (
    <section className="mb-6">
      <div className="section-label mb-2 px-1">Bottom bar</div>
      <div className="card overflow-hidden">
        {ordered.map((key, i) => {
          const { label, icon: Icon } = TABS[key];
          const on = bar.includes(key);
          const full = !on && bar.length >= MAX_BAR;
          return (
            <div key={key} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i ? '1px solid var(--line)' : 'none', opacity: full ? 0.45 : 1 }}>
              <button onClick={() => toggle(key)} disabled={full} aria-pressed={on} aria-label={`Show ${label} in bottom bar`}
                className="w-6 h-6 rounded-md flex items-center justify-center border-2"
                style={{ background: on ? 'var(--green)' : '#fff', borderColor: on ? 'var(--green)' : '#C5CEC9' }}>
                {on && <Check size={15} color="#fff" strokeWidth={3} />}
              </button>
              <Icon size={20} style={{ color: 'var(--green)' }} />
              <span className="flex-1 font-medium">{label}</span>
              {on && <>
                <button aria-label="Move up" className="p-1.5 rounded-lg active:bg-black/5" onClick={() => move(key, -1)} disabled={bar.indexOf(key) === 0}><ArrowUp size={18} /></button>
                <button aria-label="Move down" className="p-1.5 rounded-lg active:bg-black/5" onClick={() => move(key, 1)} disabled={bar.indexOf(key) === bar.length - 1}><ArrowDown size={18} /></button>
              </>}
            </div>
          );
        })}
      </div>
      <p className="text-[13px] mt-2 px-1" style={{ color: 'var(--text-soft)' }}>Up to {MAX_BAR} tabs. Everything else, plus Settings, is on the More page.</p>
    </section>
  );
}

const DAYS = [['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6], ['Sun', 0]];

function Reminder() {
  const { settings, set } = usePrefs();
  const push = usePush();
  const [msg, setMsg] = useState(null);
  let days = [0, 1, 2, 3, 4, 5, 6];
  try { const d = JSON.parse(settings.meal_reminder_days || 'null'); if (Array.isArray(d)) days = d; } catch {}
  const time = settings.meal_reminder_time || '18:00';
  const enabled = settings.meal_reminder_enabled !== 'false';
  const toggleDay = d => {
    const next = days.includes(d) ? days.filter(x => x !== d) : [...days, d].sort();
    if (next.length) set('meal_reminder_days', JSON.stringify(next));
  };
  const runTest = async () => {
    setMsg('Sending…');
    try { await push.test(); setMsg('Sent. It should arrive in a few seconds.'); } catch (e) { setMsg(e.message); }
  };
  const on = push.status === 'on';

  return (
    <section className="mb-6">
      <div className="section-label mb-2 px-1">Planning reminder</div>
      <div className="card p-4">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>{on && enabled ? <Bell size={20} /> : <BellOff size={20} />}</span>
          <div className="flex-1">
            <div className="font-semibold">Remind me to plan meals</div>
            <div className="text-[13px]" style={{ color: 'var(--text-soft)' }}>A notification saying whether next week is planned yet.</div>
          </div>
        </div>

        {push.status === 'needs-install' && (
          <div className="mt-4 rounded-xl p-3 text-[14px]" style={{ background: '#FFF3DC', color: '#6B4600' }}>
            On iPhone, notifications only work from the Home Screen app. In Safari tap <Share size={14} className="inline -mt-0.5" /> Share, then <PlusSquare size={14} className="inline -mt-0.5" /> Add to Home Screen, and open it from there.
          </div>
        )}
        {push.status === 'unsupported' && <p className="mt-4 text-[14px]" style={{ color: 'var(--text-soft)' }}>This browser can't receive notifications.</p>}
        {push.status === 'denied' && <p className="mt-4 text-[14px]" style={{ color: 'var(--danger)' }}>Notifications are blocked. Allow them in {isIOS() ? 'Settings › Notifications › Meals' : 'your browser settings'}, then come back.</p>}
        {(push.status === 'off' || push.status === 'error') && <button className="btn btn-primary w-full mt-4" onClick={push.enable}><Bell size={18} />Turn on notifications</button>}
        {push.error && <p className="mt-2 text-[13px]" style={{ color: 'var(--danger)' }}>{push.error}</p>}

        {on && (
          <>
            <label className="flex items-center justify-between mt-4 py-1">
              <span className="font-medium">Reminders</span>
              <button role="switch" aria-checked={enabled} onClick={() => set('meal_reminder_enabled', enabled ? 'false' : 'true')}
                className="w-12 h-7 rounded-full relative transition-colors" style={{ background: enabled ? 'var(--green)' : '#C5CEC9' }}>
                <span className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all" style={{ left: enabled ? 22 : 2 }} />
              </button>
            </label>
            <div style={{ opacity: enabled ? 1 : 0.45, pointerEvents: enabled ? 'auto' : 'none' }}>
              <div className="flex gap-1.5 mt-3">
                {DAYS.map(([label, d]) => {
                  const sel = days.includes(d);
                  return <button key={d} aria-pressed={sel} onClick={() => toggleDay(d)} className="flex-1 h-10 rounded-xl text-[13px] font-semibold"
                    style={sel ? { background: 'var(--green)', color: '#fff' } : { background: '#EEF2F0', color: 'var(--text-soft)' }}>{label.slice(0, 2)}</button>;
                })}
              </div>
              <div className="flex items-center justify-between mt-3">
                <span className="text-[15px]">Time</span>
                <input type="time" className="input w-auto py-2" value={time} onChange={e => e.target.value && set('meal_reminder_time', e.target.value)} />
              </div>
              <p className="text-[13px] mt-2" style={{ color: 'var(--text-soft)' }}>
                {days.length === 7 ? 'Every day' : DAYS.filter(([, d]) => days.includes(d)).map(([l]) => l).join(', ')} at {time} (UK time)
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <button className="btn btn-soft" onClick={runTest}><Send size={16} />Send test</button>
              <button className="btn btn-ghost" onClick={push.disable}><BellOff size={16} />Turn off here</button>
            </div>
            {msg && <p className="text-[13px] mt-2" style={{ color: 'var(--text-soft)' }}>{msg}</p>}
          </>
        )}
      </div>
    </section>
  );
}

export default function Settings() {
  const { back, canBack } = useNav();
  return (
    <div className="page narrow">
      <PageHeader title="Settings" onBack={canBack ? back : undefined} />
      <TabPicker />
      <Reminder />
    </div>
  );
}
