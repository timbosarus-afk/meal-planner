// Finds cooking times in a step: "simmer for 20 mins", "1 hr 15 mins",
// "8-10 minutes", "half an hour", "30 seconds". Returns
// [{ text, minutes, maxMinutes, seconds }] in the order they appear.
// For a range, minutes is the lower bound (check early, add more if needed).

const WORDS = { a: 1, an: 1, another: 1, one: 1, two: 2, three: 3, four: 4, five: 5, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty-five': 45 };
const toNum = s => {
  s = s.toLowerCase().trim();
  if (s.startsWith('half')) return 0.5;
  return s in WORDS ? WORDS[s] : parseFloat(s);
};
// Digits may use short units (20m, 1h); word numbers need the full unit word.
const DIG = '\\b(\\d+(?:\\.\\d+)?)(?:\\s*(?:-|–|to)\\s*(\\d+(?:\\.\\d+)?))?\\s*';
const WRD = '\\b(half an?|an?|another|one|two|three|four|five|ten|fifteen|twenty|thirty|forty|forty-five)()\\s+';
const HR = '(?:hours?|hrs?|h)\\b', HR_W = '(?:hours?)\\b';
const MIN = '(?:minutes?|mins?|m)\\b', MIN_W = '(?:minutes?|mins?)\\b';
const SEC = '(?:seconds?|secs?|s)\\b', SEC_W = '(?:seconds?)\\b';
const AND_MIN = `(?:\\s*(?:and\\s*)?(\\d+)\\s*${MIN})?`;

// Each alternative captures [lo, hi, extraMinutes?]; kind decided by group index.
const PARTS = [
  ['h', `${DIG}${HR}${AND_MIN}`], ['h', `${WRD}${HR_W}${AND_MIN}`],
  ['m', `${DIG}${MIN}`], ['m', `${WRD}${MIN_W}`],
  ['s', `${DIG}${SEC}`], ['s', `${WRD}${SEC_W}`]
];
const RE = new RegExp(PARTS.map(([, p]) => `(?:${p})`).join('|'), 'gi');
const GROUPS = PARTS.map(([k, p]) => [k, (new RegExp(p + '|').exec('')).length - 1]);

export function findTimes(text) {
  if (!text) return [];
  const out = [];
  let m;
  RE.lastIndex = 0;
  while ((m = RE.exec(text))) {
    let g = 1, lo, hi, seconds = false;
    for (const [kind, n] of GROUPS) {
      if (m[g] !== undefined) {
        const a = toNum(m[g]), b = m[g + 1] ? parseFloat(m[g + 1]) : a;
        const extra = kind === 'h' && m[g + 2] ? parseInt(m[g + 2], 10) : 0;
        if (kind === 'h') { lo = a * 60 + extra; hi = b * 60 + extra; }
        else if (kind === 'm') { lo = a; hi = b; }
        else { lo = a / 60; hi = b / 60; seconds = true; }
        break;
      }
      g += n;
    }
    if (!(lo > 0)) continue;
    out.push({ text: m[0], index: m.index, minutes: Math.round(lo * 100) / 100, maxMinutes: Math.round(hi * 100) / 100, seconds });
  }
  return out;
}

export const fmtMinutes = m => {
  if (m < 1) return `${Math.round(m * 60)} sec`;
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  return h ? `${h} hr${r ? ` ${r} min` : ''}` : `${r} min`;
};

// Opens Tim's "Cook Timer" Apple Shortcut, which starts a real Clock timer.
// Shortcut takes text input = whole minutes.
export const shortcutUrl = minutes =>
  `shortcuts://run-shortcut?name=${encodeURIComponent('Cook Timer')}&input=text&text=${Math.max(1, Math.round(minutes))}`;
