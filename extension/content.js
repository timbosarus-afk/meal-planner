// Runs on Sainsbury's search results pages. Finds the first "Add to basket"
// button and highlights it so it's easy to spot and tap — deliberately NOT
// auto-clicking, since a search can return several similar products (e.g.
// "milk" -> semi-skimmed, whole, oat, etc.) and guessing which one you want
// risks adding the wrong item to your real basket. Confirming with your own
// tap is the safe default; revisit auto-add once we've built proper product
// matching (checking the aria-label against what you actually asked for).

function highlightAddButton() {
  const button = document.querySelector('[data-testid="add-button"]');
  if (!button) return false;

  button.style.outline = '4px solid #D9A441';
  button.style.outlineOffset = '2px';
  button.style.boxShadow = '0 0 0 8px rgba(217, 164, 65, 0.3)';
  button.scrollIntoView({ behavior: 'smooth', block: 'center' });

  return true;
}

// Search results load in async after the initial page shell, so retry
// for a few seconds rather than giving up on the first check.
let attempts = 0;
const interval = setInterval(() => {
  attempts++;
  if (highlightAddButton() || attempts > 20) {
    clearInterval(interval);
  }
}, 300);
