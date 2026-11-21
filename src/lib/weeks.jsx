import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';
import { pickCurrentWeek } from './format.js';

// Weeks list + the selected week, shared by This Week and Shopping so picking
// a past week on one page carries over to the other.
const WeeksContext = createContext(null);

export function WeeksProvider({ children }) {
  const [weeks, setWeeks] = useState(null);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const ws = await api.weeks();
      setWeeks(ws);
      setSelectedId(cur => (cur && ws.some(w => w.id === cur) ? cur : (pickCurrentWeek(ws) || {}).id || null));
    } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const selected = weeks && weeks.find(w => w.id === selectedId) || null;
  const removeWeek = async id => {
    await api.deleteWeek(id);
    const rest = weeks.filter(w => w.id !== id);
    setWeeks(rest);
    if (selectedId === id) setSelectedId((pickCurrentWeek(rest) || {}).id || null);
  };

  return <WeeksContext.Provider value={{ weeks, error, selected, selectedId, select: setSelectedId, reload, removeWeek }}>{children}</WeeksContext.Provider>;
}

export const useWeeks = () => useContext(WeeksContext);
