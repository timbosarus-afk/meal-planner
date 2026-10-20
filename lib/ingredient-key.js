// Turns a messy scraped ingredient line into a stable lookup key, and works
// out how many packs of a linked product a batch needs.
//
// The key is what product_links is keyed on, so "1 red onion",
// "Red Onions, finely sliced" and "red onion (large)" all land on
// "red onion" and share one Sainsbury's link. Deliberately simple and
// rule-based: refine with real mismatches (add to ALIASES or DESCRIPTORS)
// rather than trying to be clever up front.

const DESCRIPTORS = [
  'freshly', 'fresh', 'grated', 'finely', 'roughly', 'thinly', 'diced', 'chopped',
  'sliced', 'large', 'small', 'medium', 'raw',
  'peeled', 'dried', 'to taste', 'drizzle of', 'handful of', 'pinch of', 'of',
  'ripe', 'boneless', 'skinless', 'about', 'approx', 'optional'
];

// Canonical names for things recipes describe several ways. Keys are
// post-normalisation (lowercase, singular).
const ALIASES = {
  'garlic clove': 'garlic',
  'clove garlic': 'garlic',
  'ground beef': 'beef mince',
  'minced beef': 'beef mince',
  'ground lamb': 'lamb mince',
  'minced lamb': 'lamb mince',
  'ground pork': 'pork mince',
  'heavy cream': 'double cream',
  'heavy/double cream': 'double cream',
  'eggplant': 'aubergine',
  'aubergine eggplant': 'aubergine',
  'yellow onion': 'onion',
  'brown onion': 'onion',
  'tomato paste': 'tomato puree',
  'tomato purée': 'tomato puree',
  'canned crushed tomato': 'chopped tomato',
  'tinned chopped tomato': 'chopped tomato',
  'prawns/shrimp': 'prawn',
  'prawn/shrimp': 'prawn',
  'parmesan cheese': 'parmesan',
  'shrimp': 'prawn',
  'lasagne sheet': 'lasagna sheet',
  'crushed tomato': 'chopped tomato',
  'diced tomato': 'chopped tomato',
  'salt & pepper': 'salt and pepper',
  'salt and black pepper': 'salt and pepper',
  'parmesan cheese': 'parmesan',
  'potatoe': 'potato'
};

function singularise(word) {
  if (word.length <= 3) return word;
  if (/(ss|us|is)$/.test(word)) return word;               // grass, hummus, harissa-ish
  if (/ies$/.test(word)) return word.slice(0, -3) + 'y';     // berries -> berry
  if (/(o|ch|sh|x)es$/.test(word)) return word.slice(0, -2); // tomatoes -> tomato
  if (/s$/.test(word)) return word.slice(0, -1);             // onions -> onion
  return word;
}

function ingredientKey(raw) {
  if (!raw) return '';
  let s = String(raw)
    .replace(/&amp;/g, '&')
    .toLowerCase()
    .replace(/\([^)]*\)?/g, ' ')                                   // (see notes), (paste), unclosed "("
    .replace(/^[\s/]+/, ' ')                                        // leading "/ " from split metric/imperial
    .replace(/\b\d+(\.\d+)?(\s*-\s*\d+(\.\d+)?)?\s*(kg|g|ml|l|oz|lb|cups?|tbsp|tsp)\b/g, ' ') // 160ml, 150-200g
    .replace(/\b\d+(\.\d+)?\b/g, ' ');                             // stray numbers

  // Strip prep descriptors (longest first so "drizzle of" beats "of"),
  // except where the word is part of the product ("chopped tomatoes")
  const keepPrep = /\b(chopped|crushed|diced) tomato/.test(s);
  for (const d of [...DESCRIPTORS].sort((a, b) => b.length - a.length)) {
    if (keepPrep && ['chopped', 'diced'].includes(d)) continue;
    s = s.replace(new RegExp(`\\b${d.replace(/ /g, '\\s+')}\\b`, 'g'), ' ');
  }

  s = s
    .replace(/[^a-zà-ÿ&\s/]/g, ' ')   // punctuation, trailing commas
    .replace(/\s*\/\s*/g, '/')        // "heavy / double" -> "heavy/double"
    .replace(/^\/+|\/+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // "x or y" -> keep the first option ("russet or yukon gold potatoes" is
  // ambiguous, but linking it once fixes it for good anyway)
  if (s.includes(' or ')) {
    const [first, rest] = s.split(' or ');
    const restWords = rest.trim().split(' ');
    s = `${first.trim()} ${restWords[restWords.length - 1]}`.trim();
  }

  const words = s.split(' ').filter(Boolean);
  if (words.length) words[words.length - 1] = singularise(words[words.length - 1]);
  s = words.join(' ');

  return ALIASES[s] || s;
}

// ---- Pack maths -----------------------------------------------------------

// Convert a recipe quantity to a comparable base unit: g, ml or each.
// Returns null when there's no sensible conversion (clove, jar, pack...).
function toBase(quantity, unit) {
  if (quantity === null || quantity === undefined || Number.isNaN(Number(quantity))) return null;
  const q = Number(quantity);
  const u = (unit || '').toLowerCase().trim();
  switch (u) {
    case '': case 'each': case 'x': return { amount: q, unit: 'each' };
    case 'g': return { amount: q, unit: 'g' };
    case 'kg': return { amount: q * 1000, unit: 'g' };
    case 'oz': return { amount: q * 28.35, unit: 'g' };
    case 'lb': return { amount: q * 453.6, unit: 'g' };
    case 'ml': return { amount: q, unit: 'ml' };
    case 'l': return { amount: q * 1000, unit: 'ml' };
    case 'tsp': return { amount: q * 5, unit: 'ml' };
    case 'tbsp': return { amount: q * 15, unit: 'ml' };
    case 'cup': case 'cups': return { amount: q * 240, unit: 'ml' };
    default: return null;
  }
}

// needs: array of { quantity, unit } lines for ONE ingredient key.
// link: { pack_size, pack_unit, default_qty }.
// Sums compatible lines first, then rounds up once — so 2 lines of 250g
// against a 500g pack is 1 pack, not 2.
function packsNeeded(needs, link) {
  const fallback = Math.max(1, link.default_qty || 1);
  const packUnit = (link.pack_unit || '').toLowerCase();
  const packSize = Number(link.pack_size);
  if (!packUnit || !packSize) return fallback;

  let total = 0;
  let hadIncompatible = false;
  for (const n of needs) {
    const base = toBase(n.quantity, n.unit);
    if (base && base.unit === packUnit) total += base.amount;
    else hadIncompatible = true;
  }

  if (total === 0) return fallback;
  // 5% tolerance so 505g on a 500g pack is still 1 pack
  const packs = Math.max(1, Math.ceil(total / packSize - 0.05));
  return hadIncompatible ? Math.max(packs, fallback) : packs;
}

module.exports = { ingredientKey, toBase, packsNeeded, singularise };
