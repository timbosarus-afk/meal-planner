import { CalendarDays, BookOpen, ShoppingCart, Package, ChefHat, Settings, MoreHorizontal } from 'lucide-react';

// Every top-level page. Any of these (except settings) can sit in the bottom
// bar; the rest live on the More page. "more" is always the last slot.
export const TABS = {
  week:     { label: 'This Week', short: 'Week',     icon: CalendarDays },
  recipes:  { label: 'Recipes',   short: 'Recipes',  icon: BookOpen },
  shopping: { label: 'Shopping',  short: 'Shopping', icon: ShoppingCart },
  pantry:   { label: 'Pantry',    short: 'Pantry',   icon: Package },
  canmake:  { label: 'What can I make?', short: 'Can make', icon: ChefHat },
  settings: { label: 'Settings',  short: 'Settings', icon: Settings },
  more:     { label: 'More',      short: 'More',     icon: MoreHorizontal }
};

export const PINNABLE = ['week', 'recipes', 'shopping', 'pantry', 'canmake'];
export const DEFAULT_BAR = ['week', 'recipes', 'shopping'];
export const MAX_BAR = 4; // plus "More"

export function parseBar(value) {
  try {
    const arr = JSON.parse(value);
    const clean = Array.isArray(arr) ? arr.filter(t => PINNABLE.includes(t)).slice(0, MAX_BAR) : null;
    return clean && clean.length ? clean : DEFAULT_BAR;
  } catch { return DEFAULT_BAR; }
}
