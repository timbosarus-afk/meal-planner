import { createContext, useContext } from 'react';
// go(tab) switches top-level page; push(screen, props) opens a detail screen
// on top (recipe, cook mode); back() pops it.
export const NavContext = createContext(null);
export const useNav = () => useContext(NavContext);
