import { useCallback, useEffect, useState } from 'react';
import { supabase, SUPABASE_URL } from './supabase.js';

// Public half of the project's VAPID key pair (shared with the BlizzCon app;
// the private half is an edge function secret).
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || 'BNfpUK5XbpIZpEBxeaMV9S9x_nRdiKKhh6rX2P1andVCK1cDmCVwE5MQdq8xcKcEsS1gd4IXVwZWtJZxxsF8Fik';
const FN_URL = `${SUPABASE_URL}/functions/v1/meal-planning-reminder`;

const toKey = b64 => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
};

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// status: checking | unsupported | needs-install | denied | off | on | error
export function usePush() {
  const [status, setStatus] = useState('checking');
  const [error, setError] = useState(null);
  const [endpoint, setEndpoint] = useState(null);

  const check = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setStatus(isIOS() && !isStandalone() ? 'needs-install' : 'unsupported');
      return;
    }
    const reg = await navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready).catch(() => null);
    const sub = reg && await reg.pushManager.getSubscription();
    setEndpoint(sub ? sub.endpoint : null);
    setStatus(sub ? 'on' : Notification.permission === 'denied' ? 'denied' : 'off');
  }, []);
  useEffect(() => { check(); }, [check]);

  const enable = useCallback(async () => {
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setStatus(perm === 'denied' ? 'denied' : 'off'); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(VAPID_PUBLIC_KEY) });
      const json = sub.toJSON();
      const { error: e } = await supabase.from('meal_push_subscriptions').upsert({ endpoint: json.endpoint, subscription: json }, { onConflict: 'endpoint' });
      if (e) throw new Error(e.message);
      setEndpoint(json.endpoint); setStatus('on');
    } catch (e) { setError(e.message); setStatus('error'); }
  }, []);

  const disable = useCallback(async () => {
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabase.from('meal_push_subscriptions').delete().eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
      setEndpoint(null); setStatus('off');
    } catch (e) { setError(e.message); }
  }, []);

  const test = useCallback(async () => {
    const res = await fetch(FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ test: true, endpoint }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.sent) throw new Error(data.error || 'Test notification was not sent');
  }, [endpoint]);

  return { status, error, enable, disable, test };
}
