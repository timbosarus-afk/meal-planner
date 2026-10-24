// Default role for a recipe ingredient. Tim can tap to change it per recipe.
//   core      - the dish does not work without it
//   optional  - garnish / "if desired" / can be left out
//   swappable - has an "or" alternative, so a substitute is fine
function guessRole(item, notes, raw) {
  const text = `${notes || ''} ${raw || ''}`.toLowerCase();
  if (/\boptional\b|to garnish|for garnish|if desired|to serve|for serving|plus more/.test(text)) return 'optional';
  if (/(^|[;,]\s*)or\b|\bor (other|similar|any|a )|\b\w+ or \w+/.test(String(notes || '').toLowerCase())) return 'swappable';
  return 'core';
}
module.exports = { guessRole };
