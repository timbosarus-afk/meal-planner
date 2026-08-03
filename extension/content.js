// Runs on Sainsbury's search results pages. Finds the first "Add to basket"
// button and highlights it so it's easy to spot and tap — deliberately NOT
// auto-clicking, since a search can return several similar products (e.g.
// "milk" -> semi-skimmed, whole, oat, etc.) and guessing which one you want
// risks adding the wrong item to your real basket. Confirming with your own
// tap is the safe default; revisit auto-add once we've built proper product
// matching (checking the aria-label against what you actually asked for).
//
// The page re-renders the button after initial load (likely once real
// stock/price data comes in), which replaces the DOM node and wipes any
// styling we'd applied to the old one. A MutationObserver + a longer-running
// interval keep reapplying the highlight whenever that happens, rather than
// setting it once and hoping it sticks.

function highlightAddButton() {
  const button = document.querySelector('[data-testid="add-button"]');
  if (!button || button.dataset.mealPlannerHighlighted) return !!button;

  button.style.outline = '4px solid #D9A441';
  button.style.outlineOffset = '2px';
  button.style.boxShadow = '0 0 0 8px rgba(217, 164, 65, 0.3)';
  button.dataset.mealPlannerHighlighted = 'true';
  button.scrollIntoView({ behavior: 'smooth', block: 'center' });

  return true;
}

// Re-check periodically for up to a minute — covers slow-loading results
// and any re-render that swaps the button element out from under us.
let elapsed = 0;
const poll = setInterval(() => {
  highlightAddButton();
  elapsed += 500;
  if (elapsed > 60000) clearInterval(poll);
}, 500);

// Also react immediately to DOM changes rather than waiting for the next
// poll tick — catches re-renders faster so the gap without a highlight
// (if the old node just got removed) is as short as possible.
const observer = new MutationObserver(() => highlightAddButton());
observer.observe(document.body, { childList: true, subtree: true });
