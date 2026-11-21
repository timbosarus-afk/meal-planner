import React from 'react';
import { ChevronLeft, Loader2 } from 'lucide-react';

export function PageHeader({ title, subtitle, onBack, right }) {
  return (
    <header className="mb-4">
      {onBack && (
        <button onClick={onBack} className="btn-ghost -ml-2 mb-1 flex items-center gap-1 text-[15px] font-semibold py-1 px-2 rounded-lg" style={{ color: 'var(--green)' }}>
          <ChevronLeft size={20} /> Back
        </button>
      )}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="mt-1 text-[14px]" style={{ color: 'var(--text-soft)' }}>{subtitle}</p>}
        </div>
        {right}
      </div>
    </header>
  );
}

export const Spinner = ({ label = 'Loading…' }) => (
  <div className="flex items-center gap-2 py-8 justify-center" style={{ color: 'var(--text-soft)' }}>
    <Loader2 size={18} className="animate-spin" /> {label}
  </div>
);

export const ErrorBox = ({ message, onRetry }) => (
  <div className="card p-4 text-[14px]" style={{ color: 'var(--danger)' }}>
    {message}
    {onRetry && <button className="btn btn-soft mt-3 w-full" onClick={onRetry}>Try again</button>}
  </div>
);

export const Empty = ({ icon: Icon, title, children }) => (
  <div className="card p-6 text-center">
    {Icon && <Icon size={32} className="mx-auto mb-2" style={{ color: 'var(--green-mid)' }} />}
    <div className="font-display font-bold text-[17px]">{title}</div>
    {children && <div className="mt-1 text-[14px]" style={{ color: 'var(--text-soft)' }}>{children}</div>}
  </div>
);

// Small async-data hook with reload
export function useLoad(fn, deps = []) {
  const [state, setState] = React.useState({ data: null, error: null, loading: true });
  const load = React.useCallback(() => {
    setState(s => ({ ...s, loading: true, error: null }));
    return fn().then(data => setState({ data, error: null, loading: false }))
      .catch(e => setState({ data: null, error: e.message, loading: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  React.useEffect(() => { load(); }, [load]);
  return { ...state, reload: load, setData: data => setState(s => ({ ...s, data: typeof data === 'function' ? data(s.data) : data })) };
}
