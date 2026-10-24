// AI helpers for the pantry: turn a spoken/typed dump into a clean item list,
// and suggest meals from what is in the house. Same Anthropic call pattern as
// api/ai-shopping-cleanup.js.
const { ALL_SECTIONS } = require('./pantry-sections');

async function callClaude(system, user, maxTokens) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: maxTokens || 4000, system, messages: [{ role: 'user', content: user }] })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Claude API error: ${data.error?.message || response.statusText}`);
  if (data.stop_reason === 'max_tokens') throw new Error('Claude ran out of room (max_tokens), try a shorter list.');
  const block = (data.content || []).find(b => b.type === 'text');
  if (!block) throw new Error('Claude returned no text');
  const cleaned = block.text.replace(/```json|```/g, '').trim();
  try { return JSON.parse(cleaned); }
  catch (e) { throw new Error(`Could not parse Claude's response: ${e.message}. Started with: "${cleaned.slice(0, 120)}"`); }
}

const PARSE_PROMPT = `You turn a dictated list of food someone has in their house into structured items. The text comes from keyboard dictation so expect missing punctuation and mis-heard words (fix obvious ones, UK English).
Rules:
- One entry per distinct food. Singular, lowercase, plain name ("eggs" -> "egg", "hot sausages" -> "sausage").
- quantity: a number if stated ("six eggs" -> 6, "half a pack" -> 0.5), otherwise null. Never guess a quantity.
- unit: one of g, kg, ml, l, pack, tin, jar, bottle, bunch, or null for plain counts.
- section: one of ${ALL_SECTIONS.map(s => `"${s}"`).join(', ')}. Spices and dried herbs -> "Spices & Herbs"; oils, vinegars, sauces, condiments -> "Oils, Sauces & Condiments"; flour, sugar, rice, pasta, tins and other dry goods -> "Baking & Dry Goods"; chilled things -> "Fridge"; frozen things -> "Freezer"; anything else -> "Cupboard".
- Do not invent items that were not said.
Output ONLY a JSON array, no fences: [{"item": string, "quantity": number|null, "unit": string|null, "section": string}]`;

const IDEAS_PROMPT = `You suggest simple home meals. You get a JSON object with "have" (ingredients in the house) and "knownRecipes" (titles already saved, do NOT suggest these). Suggest up to 4 meals that mostly use what is available, allowing at most 2 extra ingredients each. UK English, metric units.
Output ONLY a JSON array, no fences: [{"title": string, "why": string, "missing": [string], "ingredients": [{"quantity": number|null, "unit": string|null, "item": string}], "steps": [string], "servings": number}]`;

async function parsePantryText(text) {
  const items = await callClaude(PARSE_PROMPT, String(text || '').slice(0, 6000), 3000);
  if (!Array.isArray(items)) throw new Error('Unexpected AI response shape');
  return items.filter(i => i && i.item).map(i => ({ item: String(i.item).toLowerCase().trim(), quantity: i.quantity ?? null, unit: i.unit || null, section: ALL_SECTIONS.includes(i.section) ? i.section : null }));
}

async function suggestIdeas(have, knownRecipes) {
  const ideas = await callClaude(IDEAS_PROMPT, JSON.stringify({ have, knownRecipes }), 6000);
  if (!Array.isArray(ideas)) throw new Error('Unexpected AI response shape');
  return ideas;
}

module.exports = { parsePantryText, suggestIdeas };
