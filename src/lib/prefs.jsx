import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';
import { DEFAULT_BAR, parseBar } from './tabs.js';

// App-wide preferences stored in app_settings (so they follow you across
// devices). Cached in localStorage so the bar renders instantly on launch.
const PrefsContext = createContext(null);
const LS = 'meal_prefs_cache';
const readCache = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } };

export function PrefsProvider({ children }) {
  const [settings, setSettings] = useState(readCache);
  useEffect(() => {
    api.settings().then(s => { setSettings(s); try { localStorage.setItem(LS, JSON.stringify(s)); } catch {} }).catch(console.error);
  }, []);

  const set = async (key, value) => {
    const next = { ...settings, [key]: String(value) };
    setSettings(next);
    try { localStorage.setItem(LS, JSON.stringify(next)); } catch {}
    await api.setSetting(key, value);
  };

  const bar = settings.meal_nav_tabs ? parseBar(settings.meal_nav_tabs) : DEFAULT_BAR;
  const setBar = tabs => set('meal_nav_tabs', JSON.stringify(tabs));
  return <PrefsContext.Provider value={{ settings, set, bar, setBar }}>{children}</PrefsContext.Provider>;
}

export const usePrefs = () => useContext(PrefsContext);
