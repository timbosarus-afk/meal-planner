// Ingredient line parser (Oct 2026 rewrite).
//
// Turns a scraped/pasted line into { quantity, unit, item, notes, raw } where
//   - quantity/unit are metric and summable: g, ml, or a count unit
//     (clove, tin, jar, pack, bunch, sprig, slice, stick) or null = "each"
//   - item is what you'd actually buy: no amounts, sizes, prep words,
//     parentheticals or trailing punctuation
//   - notes holds everything stripped off the item (size, prep, "to taste",
//     alternatives) so nothing from the recipe is lost
//   - raw is the original line, kept so we can re-parse later
//
// Handles the real-world mess seen in imported recipes:
//   "2/3 cup / 160ml Heavy/Double Cream, at room temp"  -> 160 ml double cream
//   "5-7oz / 150-200g raw peeled Prawns ((see notes))"  -> 200 g raw peeled prawns
//   "7 oz / 200g Linguine, or other long-cut pasta"     -> 200 g linguine
//   "1 clove of Garlic, finely diced" / "3 garlic cloves" -> N clove garlic
//   "drizzle of Olive Oil" / "Salt &amp; Pepper, as needed"
//   "1½ tsp", "1 1/2 cups", "½", "⅓"
//
// Two entry points:
//   parseIngredientLine(raw)  - deterministic, for JSON-LD lines
//   normaliseIngredient(obj)  - tidies an already-structured ingredient
//                               (Claude's output, or an existing DB row)

// ---- Text cleanup ---------------------------------------------------------

const ENTITIES = { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ', '&lt;': '<', '&gt;': '>', '&#8217;': "'", '&#8211;': '-', '&ndash;': '-', '&frac12;': '½', '&frac14;': '¼', '&frac34;': '¾' };

const UNICODE_FRACTIONS = { '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4', '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5', '⅙': '1/6', '⅚': '5/6', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8' };

function decodeEntities(s) {
  return s
    .replace(/&[a-z]+;|&#\d+;/gi, m => {
      if (ENTITIES[m]) return ENTITIES[m];
      const num = m.match(/^&#(\d+);$/);
      return num ? String.fromCharCode(Number(num[1])) : m;
    });
}

function preclean(raw) {
  let s = decodeEntities(String(raw || ''));
  // "1½" -> "1 1/2", "½" -> "1/2"
  s = s.replace(/(\d)?\s*([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, (_, d, f) => `${d ? d + ' ' : ''}${UNICODE_FRACTIONS[f]}`);
  s = s.replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
  return s;
}

// ---- Units ----------------------------------------------------------------

// word -> [canonical unit, multiplier to base, base unit]
const UNIT_TABLE = {
  g: ['g', 1], gram: ['g', 1], grams: ['g', 1], gr: ['g', 1],
  kg: ['g', 1000], kilo: ['g', 1000], kilos: ['g', 1000], kilogram: ['g', 1000], kilograms: ['g', 1000],
  oz: ['g', 28.35], ounce: ['g', 28.35], ounces: ['g', 28.35],
  lb: ['g', 453.6], lbs: ['g', 453.6], pound: ['g', 453.6], pounds: ['g', 453.6],
  ml: ['ml', 1], millilitre: ['ml', 1], millilitres: ['ml', 1], milliliter: ['ml', 1], milliliters: ['ml', 1],
  cl: ['ml', 10],
  l: ['ml', 1000], litre: ['ml', 1000], litres: ['ml', 1000], liter: ['ml', 1000], liters: ['ml', 1000],
  tsp: ['ml', 5], teaspoon: ['ml', 5], teaspoons: ['ml', 5],
  tbsp: ['ml', 15], tbs: ['ml', 15], tablespoon: ['ml', 15], tablespoons: ['ml', 15],
  cup: ['ml', 240], cups: ['ml', 240],
  'fl oz': ['ml', 29.57],
  clove: ['clove', 1], cloves: ['clove', 1],
  tin: ['tin', 1], tins: ['tin', 1], can: ['tin', 1], cans: ['tin', 1],
  jar: ['jar', 1], jars: ['jar', 1],
  pack: ['pack', 1], packs: ['pack', 1], packet: ['pack', 1], packets: ['pack', 1], pkt: ['pack', 1],
  bunch: ['bunch', 1], bunches: ['bunch', 1],
  sprig: ['sprig', 1], sprigs: ['sprig', 1],
  slice: ['slice', 1], slices: ['slice', 1],
  stick: ['stick', 1], sticks: ['stick', 1],
  // Tiny/vague amounts: not worth shopping maths, kept as a note
  pinch: ['~pinch', 1], pinches: ['~pinch', 1], dash: ['~dash', 1], splash: ['~splash', 1],
  drizzle: ['~drizzle', 1], handful: ['~handful', 1], handfuls: ['~handful', 1], knob: ['~knob', 1], sprinkle: ['~sprinkle', 1]
};
const METRIC_BASE = new Set(['g', 'ml']);

// Longest first so "fl oz" beats "oz", "tablespoons" beats "tablespoon"
const UNIT_WORDS = Object.keys(UNIT_TABLE).sort((a, b) => b.length - a.length).map(u => u.replace(' ', '\\s'));
const NUM = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)`;
const MEASURE_RE = new RegExp(
  String.raw`^(?:(?:a|an)\s+)?(${NUM})?(?:\s*(?:-|to)\s*(${NUM}))?\s*(${UNIT_WORDS.join('|')})?\.?(?=[\s,(/)]|$)`, 'i'
);

function parseNumber(str) {
  if (!str) return null;
  const s = str.trim();
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[2]) ? Number(frac[1]) / Number(frac[2]) : null;
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

function round(n) {
  if (n === null || n === undefined) return null;
  return n >= 10 ? Math.round(n) : Math.round(n * 100) / 100;
}

// Normalise any (quantity, unit word) pair to our canonical units.
// Returns { quantity, unit, vague } where vague is e.g. "pinch".
function toCanonical(quantity, unitWord) {
  if (!unitWord) return { quantity, unit: null, vague: null };
  const entry = UNIT_TABLE[unitWord.toLowerCase().replace(/\s+/g, ' ')];
  if (!entry) return { quantity, unit: unitWord.toLowerCase(), vague: null };
  const [unit, mult] = entry;
  if (unit.startsWith('~')) return { quantity: null, unit: null, vague: unit.slice(1) };
  return { quantity: quantity === null ? null : round(quantity * mult), unit, vague: null };
}

// Reads one or more leading measures: "2/3 cup / 160ml", "200g (7oz)",
// "5-7oz / 150-200g", "a pinch of". Returns the chosen one plus the rest.
function takeMeasures(input) {
  const measures = [];
  let s = input;
  const preNotes = [];

  // "small bunch coriander", "large handful spinach": size word before a unit
  const sized = s.match(new RegExp(`^(small|large|medium|big|generous|heaped|level)\\s+(?=(?:${UNIT_WORDS.join('|')})\\b)`, 'i'));
  if (sized) { preNotes.push(sized[1].toLowerCase()); s = s.slice(sized[0].length); }

  // "2 x 400g tins chopped tomatoes" / "1 x 400ml can coconut milk"
  const multi = s.match(new RegExp(`^(${NUM})\\s*x\\s*(${NUM})\\s*(${UNIT_WORDS.join('|')})\\s+(?:(tins?|cans?|jars?|packs?|packets?|bags?|bottles?|cartons?|tubs?)\\b\\s*)?(?:of\\s+)?`, 'i'));
  if (multi) {
    const count = parseNumber(multi[1]);
    const size = toCanonical(parseNumber(multi[2]), multi[3]);
    const rest = s.slice(multi[0].length);
    if (multi[4]) {
      const container = toCanonical(count, multi[4]).unit;
      return { quantity: count, unit: UNIT_TABLE[container] ? container : 'pack', vague: null, rest, range: null,
        preNotes: [...preNotes, `${round(size.quantity)}${size.unit} each`] };
    }
    return { quantity: round(count * size.quantity), unit: size.unit, vague: null, rest, range: null, preNotes };
  }

  let rest = s;

  for (let guard = 0; guard < 4; guard++) {
    const wrapped = rest.match(/^\(\s*([^()]*?)\s*\)\s*/); // "(7oz)" right after a measure
    const target = wrapped && measures.length ? wrapped[1] : rest;
    const m = target.match(MEASURE_RE);
    if (!m || (!m[1] && !m[3])) break;

    const low = parseNumber(m[1]);
    const high = parseNumber(m[2]);
    const unitWord = m[3] || null;
    // A bare number followed by a non-unit word (e.g. "3 garlic") still counts
    measures.push({ quantity: high ?? low, unitWord, range: high !== null && low !== null ? `${m[1]}-${m[2]}${unitWord ? ' ' + unitWord : ''}` : null });

    if (wrapped && measures.length > 1) {
      rest = rest.slice(wrapped[0].length);
    } else {
      rest = rest.slice(m[0].length);
    }
    rest = rest.replace(/^\s*(?:of\s+)?/i, '');
    // Separator to an alternative measure: "/ 160ml" or "(7oz)"
    const sep = rest.match(/^\/\s*/);
    if (sep && MEASURE_RE.test(rest.slice(sep[0].length)) && /^\d/.test(rest.slice(sep[0].length))) {
      rest = rest.slice(sep[0].length);
      continue;
    }
    if (/^\(\s*\d/.test(rest)) continue;
    break;
  }

  if (!measures.length) return { quantity: null, unit: null, vague: null, rest: s, range: null, preNotes };

  const canon = measures.map(mm => ({ ...toCanonical(mm.quantity, mm.unitWord), unitWord: mm.unitWord, range: mm.range }));
  // Prefer a measure written in metric (not converted), then any g/ml, then the first
  const pick =
    canon.find(c => c.unitWord && /^(g|grams?|kg|kilos?|kilograms?|ml|millilit|l$|litres?|liters?|cl)/i.test(c.unitWord)) ||
    canon.find(c => METRIC_BASE.has(c.unit)) ||
    canon[0];

  // "bunch coriander" with no number means one bunch
  let quantity = pick.quantity;
  if (quantity === null && pick.unit && !METRIC_BASE.has(pick.unit)) quantity = 1;

  // "400g can chopped tomatoes": drop the container word from the item
  if (pick.unit && METRIC_BASE.has(pick.unit)) {
    rest = rest.replace(/^(?:tins?|cans?|jars?|packs?|packets?|bags?|bottles?|cartons?|tubs?)\s+(?:of\s+)?/i, '');
  }

  return { quantity, unit: pick.unit, vague: pick.vague || canon.find(c => c.vague)?.vague || null, rest, range: pick.range, preNotes };
}

// ---- Item cleanup ---------------------------------------------------------

const SIZE_WORDS = ['extra large', 'extra-large', 'large', 'medium', 'small', 'big', 'heaped', 'level', 'generous', 'scant'];
const PREP_PHRASES = [
  'very finely diced', 'very finely chopped', 'finely diced', 'finely chopped', 'finely sliced', 'finely grated', 'roughly chopped',
  'thinly sliced', 'freshly grated', 'freshly ground', 'freshly squeezed', 'chopped', 'diced', 'minced', 'sliced', 'grated', 'crushed',
  'deseeded', 'halved', 'quartered', 'cubed', 'shredded', 'softened', 'melted', 'beaten', 'warmed', 'at room temperature'
];
// Prep words that are actually part of the product name
const PROTECTED = [
  /chopped tomato/i, /crushed tomato/i, /minced (?:beef|lamb|pork|turkey|chicken|meat)/i,
  /sliced bread/i, /crushed chill/i, /diced pancetta/i, /grated coconut/i, /shredded suet/i, /smoked/i
];

// US -> UK names, so items match Sainsbury's search and each other
const UK_NAMES = [
  [/\bheavy\/double cream\b|\bdouble\/heavy cream\b|\bheavy cream\b|\bheavy whipping cream\b/g, 'double cream'],
  [/\bprawns?\/shrimps?\b|\bshrimps?\/prawns?\b/g, 'prawns'],
  [/\bshrimps?\b/g, 'prawns'],
  [/\beggplants?\b/g, 'aubergine'],
  [/\bzucchinis?\b/g, 'courgette'],
  [/\bcilantro\b/g, 'coriander'],
  [/\bscallions?\b|\bgreen onions?\b/g, 'spring onions'],
  [/\ball[- ]purpose flour\b/g, 'plain flour'],
  [/\bconfectioners'? sugar\b|\bpowdered sugar\b/g, 'icing sugar'],
  [/\bsuperfine sugar\b/g, 'caster sugar'],
  [/\bcornstarch\b/g, 'cornflour'],
  [/\bbell peppers?\b/g, 'peppers'],
  [/\bground beef\b|\bminced beef\b/g, 'beef mince'],
  [/\bground lamb\b|\bminced lamb\b/g, 'lamb mince'],
  [/\bground pork\b|\bminced pork\b/g, 'pork mince'],
  [/\bground turkey\b/g, 'turkey mince'],
  [/\bcanned (?:crushed |diced )?tomato(es)?\b/g, 'chopped tomatoes'],
  [/\btomato purée\b|\btomato paste\b/g, 'tomato purée'],
  [/\blasagna sheets?\b/g, 'lasagne sheets'],
  [/\byellow onions?\b|\bbrown onions?\b/g, 'onion'],
  [/^salt (?:&|and) (?:black |ground )?pepper$/g, 'salt and pepper']
];

const LEADING_VAGUE = /^(?:a\s+)?(drizzle|pinch|dash|splash|handful|knob|sprinkle|glug)s?\s+of\s+/i;

function stripParens(s, notes) {
  // Repeatedly remove the innermost (...) group, collecting its text
  let prev;
  do {
    prev = s;
    s = s.replace(/\(([^()]*)\)/g, (_, inner) => {
      const t = inner.trim();
      if (t && !/^see notes?$/i.test(t)) notes.push(t);
      return ' ';
    });
  } while (s !== prev);
  return s.replace(/[()]/g, ' '); // stray unmatched brackets
}

function cleanItem(itemIn, notesIn) {
  const notes = [];
  let item = preclean(itemIn);

  const vague = item.match(LEADING_VAGUE);
  if (vague) { notes.push(vague[1].toLowerCase()); item = item.slice(vague[0].length); }

  item = stripParens(item, notes);

  // Everything after the first comma is a note ("onion, finely diced")
  const comma = item.indexOf(',');
  if (comma !== -1) {
    const after = item.slice(comma + 1).trim();
    if (after) notes.unshift(after);
    item = item.slice(0, comma);
  }

  // " - finely diced" style suffix
  item = item.replace(/\s+-\s+(.+)$/, (_, n) => { notes.unshift(n.trim()); return ''; });

  item = item.replace(/^\s*of\s+/i, ' ');

  // Size and prep words anywhere in the item move to notes
  const isProtected = PROTECTED.some(r => r.test(item));
  for (const p of [...PREP_PHRASES, ...SIZE_WORDS].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`(^|\\s)${p.replace(/[-\s]/g, '[-\\s]')}(?=\\s|$)`, 'i');
    if (isProtected && PREP_PHRASES.includes(p)) continue;
    if (re.test(item)) {
      notes.push(p);
      item = item.replace(re, ' ');
    }
  }

  // Trailing "to taste" / "as needed" / "for brushing" etc. without a comma
  item = item.replace(/\s+(to taste|as needed|as required|for (?:brushing|frying|serving|garnish|greasing|drizzling)|optional)\s*$/i, (_, n) => { notes.push(n.toLowerCase()); return ''; });

  item = item
    .replace(/^[\s/,.;:-]+|[\s/,.;:-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Lowercase unless it looks like a proper noun brand ("Philadelphia"); keep
  // display casing to the UI, which capitalises the first letter anyway.
  item = item.toLowerCase();
  for (const [re, uk] of UK_NAMES) item = item.replace(re, uk);

  // "X or Y potatoes" -> item "potatoes", note "x or y"
  const alt = item.match(/^(\S+) or (.+\s(\S+))$/);
  if (alt) { notes.unshift(`${alt[1]} or ${alt[2].slice(0, -alt[3].length).trim()}`); item = alt[3]; }

  const flatNotesIn = notesIn ? preclean(notesIn).replace(/\(\s*see notes?\s*\)/gi, '').replace(/[()]+/g, '; ') : null;
  const allNotes = [...notes, ...(flatNotesIn ? flatNotesIn.split(/;\s*/) : [])]
    .map(n => n.replace(/^[\s,;]+|[\s,;]+$/g, '').replace(/\s+/g, ' '))
    .filter(Boolean);
  // De-dupe while keeping order
  const seen = new Set();
  const notesOut = allNotes.filter(n => { const k = n.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });

  return { item, notes: notesOut.length ? notesOut.join('; ') : null };
}

// "garlic cloves" / "garlic clove" with no unit -> unit clove, item garlic
function liftCountUnit(item, unit) {
  if (unit) return { item, unit };
  const m = item.match(/^(.*?)\s+(cloves?|sprigs?|slices?|sticks?|tins?|cans?|jars?|bunch(?:es)?)$/i);
  if (m && m[1]) return { item: m[1], unit: toCanonical(1, m[2]).unit };
  return { item, unit };
}

// ---- Public API -----------------------------------------------------------

function parseIngredientLine(raw) {
  const original = String(raw || '').trim();
  const s = preclean(original);
  const { quantity, unit, vague, rest, range, preNotes = [] } = takeMeasures(s);

  const cleaned = cleanItem(rest, null);
  const lifted = liftCountUnit(cleaned.item, unit);

  const extraNotes = [...preNotes];
  if (range) extraNotes.push(`recipe says ${range}`);
  if (vague) extraNotes.push(vague);

  const notes = [cleaned.notes, ...extraNotes].filter(Boolean).join('; ') || null;

  return {
    quantity: quantity === null ? null : quantity,
    unit: lifted.unit,
    item: lifted.item || cleaned.item || s.toLowerCase(),
    notes,
    raw: original
  };
}

// Tidies an already-structured ingredient (Claude output or a DB row):
// converts units to canonical metric, cleans the item, merges notes.
function normaliseIngredient(ing) {
  const raw = ing.raw || ing.raw_line || null;
  const q = ing.quantity === null || ing.quantity === undefined || ing.quantity === '' ? null : Number(ing.quantity);

  // If the item itself still starts with a measure (bad upstream parse),
  // fall back to the full deterministic parser on a reconstructed line.
  const itemText = preclean(ing.item || '');
  if (/^[\d/]/.test(itemText) || /^\/\s*\d/.test(itemText)) {
    const line = [q !== null ? q : '', ing.unit || '', ing.item, ing.notes ? `, ${ing.notes}` : ''].join(' ');
    const parsed = parseIngredientLine(line.trim());
    return { ...parsed, raw: raw || parsed.raw };
  }

  const canon = toCanonical(q, ing.unit || null);
  const cleaned = cleanItem(ing.item || '', ing.notes || null);
  const lifted = liftCountUnit(cleaned.item, canon.unit);
  const notes = [cleaned.notes, canon.vague].filter(Boolean).join('; ') || null;

  return {
    quantity: canon.quantity,
    unit: lifted.unit,
    item: lifted.item,
    notes,
    raw
  };
}

module.exports = { parseIngredientLine, normaliseIngredient, toCanonical, preclean, cleanItem };
