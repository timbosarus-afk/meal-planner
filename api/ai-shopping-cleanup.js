// Vercel serverless function — optional "Sort with AI" cleanup pass on an
// already-generated shopping list. This is deliberately NOT a replacement
// for the deterministic list — it only reorganizes what's already there:
//
//   - merges near-duplicates the rule-based consolidation can't safely merge
//     (e.g. "2 aubergines" and "200g aubergine" — different units, so the
//     normal consolidation keeps them as separate lines on purpose)
//   - fixes miscategorised items (the keyword categoriser is a heuristic and
//     gets edge cases wrong, e.g. "pepper" defaulting to veg)
//   - suggests real supermarket pack sizes to round up to
//
// It is NOT allowed to invent, drop, or change what's actually needed —
// every input item must still be represented in the output (though it may
// be merged with another). This keeps the reliable version as the default
// and the AI pass as a genuine optional tidy-up, not something anything
// critical depends on being perfect.

const CLEANUP_PROMPT = `You are tidying up an already-correct shopping list for display. You will receive a JSON array of items, each with: item, unit, quantity, usedIn (array of recipe names), category.

Your job:
1. Merge items that are clearly the same ingredient but couldn't be combined automatically because of mismatched units (e.g. "2 aubergines" and "200g aubergine" both being aubergine) — combine into one line with a sensible combined description, keep all usedIn recipe names from both.
2. Fix any category that looks wrong (categories are: Fruit & Veg, Meat & Fish, Dairy & Eggs, Bakery, Frozen, Store Cupboard, Herbs & Spices, Other).
3. For items with a specific small quantity, add a short "note" suggesting a realistic UK supermarket pack size to buy (e.g. "137g flour" -> note: "buy the 500g bag"). Only add a note when it's genuinely useful — leave it out otherwise.

CRITICAL RULE: every single item from the input must be represented in the output, either as its own line or merged into another line's usedIn list. Never drop an item. Never invent a new item that wasn't in the input. Never change what's actually needed — only reorganize how it's displayed.

Output ONLY a JSON array, no markdown fences, no preamble, in this exact shape:
[{ "item": string, "quantity": number | null, "unit": string | null, "category": string, "usedIn": [string], "note": string | null }]`;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST' }); return; }

  const { shoppingList } = req.body || {};
  if (!Array.isArray(shoppingList) || !shoppingList.length) {
    res.status(400).json({ error: 'Missing or empty "shoppingList" array' });
    return;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 4096,
        system: CLEANUP_PROMPT,
        messages: [{ role: 'user', content: JSON.stringify(shoppingList) }]
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(`Claude API error: ${data.error?.message || response.statusText}`);

    const textBlock = (data.content || []).find(b => b.type === 'text');
    if (!textBlock) {
      throw new Error(`Claude returned no text content (stop_reason: ${data.stop_reason || 'unknown'})`);
    }
    const cleaned = textBlock.text.replace(/```json|```/g, '').trim();
    const cleanedList = JSON.parse(cleaned);

    res.status(200).json({ cleanedList });
  } catch (err) {
    console.error('AI shopping list cleanup failed:', err);
    res.status(500).json({ error: err.message });
  }
};
