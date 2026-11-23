import React, { useEffect, useMemo, useState } from 'react';
import BottomBar from './components/BottomBar.jsx';
import { PrefsProvider, usePrefs } from './lib/prefs.jsx';
import { WeeksProvider } from './lib/weeks.jsx';
import { NavContext } from './lib/nav.js';
import ThisWeek from './pages/ThisWeek.jsx';
import Recipes from './pages/Recipes.jsx';
import Shopping from './pages/Shopping.jsx';
import Pantry from './pages/Pantry.jsx';
import CanMake from './pages/CanMake.jsx';
import Settings from './pages/Settings.jsx';
import More from './pages/More.jsx';

const PAGES = { week: ThisWeek, recipes: Recipes, shopping: Shopping, pantry: Pantry, canmake: CanMake, settings: Settings, more: More };
import { SCREENS } from './lib/screens.js';
import RecipeDetail from './pages/RecipeDetail.jsx';

import CookMode from './pages/CookMode.jsx';
import PantryCheck from './pages/PantryCheck.jsx';

SCREENS.recipe = RecipeDetail;
SCREENS.cook = CookMode;
SCREENS.pantrycheck = PantryCheck;

function Shell() {
  const { bar } = usePrefs();
  const [tab, setTab] = useState(() => (location.hash.slice(1) in PAGES ? location.hash.slice(1) : 'week'));
  const [from, setFrom] = useState(null); // page we came from (for More -> Pantry "back")
  // Deep links to a screen, e.g. the planning reminder opens /#pantry-check
  const [stack, setStack] = useState(() => (location.hash === '#pantry-check' ? [{ screen: 'pantrycheck', props: {}, scroll: 0 }] : []));

  useEffect(() => { history.replaceState(null, '', '#' + tab); window.scrollTo(0, 0); }, [tab]);
  // Notification tapped while the app is already open (service worker navigates to /#pantry-check)
  useEffect(() => {
    const onHash = () => {
      if (location.hash === '#pantry-check') {
        setStack(s => (s.length && s[s.length - 1].screen === 'pantrycheck' ? s : [...s, { screen: 'pantrycheck', props: {}, scroll: window.scrollY }]));
        history.replaceState(null, '', '#' + tab);
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [tab]);

  const nav = useMemo(() => ({
    go: key => { setStack([]); setFrom(bar.includes(key) || key === 'more' ? null : tab); setTab(key); },
    push: (screen, props = {}) => { setStack(s => [...s, { screen, props, scroll: window.scrollY }]); window.scrollTo(0, 0); },
    back: () => {
      if (stack.length) {
        const top = stack[stack.length - 1];
        setStack(s => s.slice(0, -1));
        requestAnimationFrame(() => window.scrollTo(0, top.scroll || 0));
      } else if (from) { setTab(from); setFrom(null); }
    },
    canBack: stack.length > 0 || !!from,
    tab
  }), [bar, tab, stack, from]);

  // Highlight "More" when on a page that isn't pinned to the bar
  const activeBar = bar.includes(tab) ? tab : 'more';
  const top = stack[stack.length - 1];
  const Page = PAGES[tab];
  const Screen = top && SCREENS[top.screen];

  return (
    <NavContext.Provider value={nav}>
      <div style={{ display: Screen ? 'none' : 'block' }}><Page /></div>
      {Screen && <Screen key={stack.length} {...top.props} />}
      {!(Screen && Screen.fullscreen) && <BottomBar tabs={bar} active={activeBar} onSelect={nav.go} />}
    </NavContext.Provider>
  );
}

export default function App() {
  return <PrefsProvider><WeeksProvider><Shell /></WeeksProvider></PrefsProvider>;
}
