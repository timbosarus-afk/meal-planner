import React, { useEffect } from 'react';

// Bottom sheet with a dimmed backdrop. Tap outside to close.
export default function Sheet({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/35" />
      <div role="dialog" aria-label={title} onClick={e => e.stopPropagation()}
        className="relative w-full max-w-[640px] bg-white rounded-t-3xl p-5 shadow-2xl"
        style={{ paddingBottom: 'calc(20px + var(--safe-bottom))', animation: 'sheetUp .2s ease-out' }}>
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-black/10" />
        {title && <h2 className="font-display font-extrabold text-[20px] mb-3" style={{ color: 'var(--text)' }}>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function ConfirmSheet({ open, onClose, title, message, confirmLabel = 'Delete', onConfirm, busy }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {message && <p className="text-[15px] mb-5" style={{ color: 'var(--text-soft)' }}>{message}</p>}
      <div className="grid gap-2">
        <button className="btn w-full text-white" style={{ background: 'var(--danger)' }} onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : confirmLabel}</button>
        <button className="btn btn-soft w-full" onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  );
}
