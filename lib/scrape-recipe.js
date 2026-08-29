/**
 * Recipe importer — extracts structured recipe data from a URL.
 *
 * Strategy:
 * 1. Fetch the raw HTML
 * 2. Look for schema.org/Recipe JSON-LD (covers most WordPress food blogs,
 *    Waitrose, and the majority of "real" recipe sites — they embed this
 *    for Google rich results, so we get it for free)
 * 3. If the page looks like an empty SPA shell (e.g. Sainsbury's), retry
 *    with a headless browser (lib/headless-fetch.js) to get the rendered
 *    HTML, then re-check for JSON-LD in that
 * 4. If still nothing, fall back to Claude parsing the raw page text
 * 5. Always output the same normalised structure regardless of source,
 *    so the rest of the app never needs to know which path was used
 *
 * KNOWN RISK: headless rendering on Vercel's free tier can be tight against
 * the 10-second function timeout — see lib/headless-fetch.js for details.
 */

const { fetchRenderedHtml } = require('./headless-fetch');

const RECIPE_SCHEMA_PROMPT = `You are extracting a recipe from raw webpage text. Output ONLY valid JSON, no markdown fences, no preamble.

Schema:
{
  "title": string,
  "servings": number | null,
  "prepTimeMinutes": number | null,
  "cookTimeMinutes": number | null,
  "ingredients": [{ "quantity": number | null, "unit": string | null, "item": string, "notes": string | null }],
  "steps": [string],
  "sourceUrl": string,
  "confidence": "high" | "medium" | "low"
}

Rules:
- "confidence": "low" if the page text looks incomplete, ambiguous, or you had to guess a lot
- Split "2 red onions, chopped" into quantity: 2, unit: null, item: "red onion", notes: "chopped"
- For items with no clear numeric quantity (e.g. "salt to taste", "a pinch of nutmeg"), set quantity: null, unit: null, item: <full text>
- If servings/times aren't stated, use null — do not guess
- Return ONLY the JSON object, nothing else`;

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
    }
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  return res.text();
}

/**
 * Extracts schema.org Recipe JSON-LD from raw HTML.
 * Handles single objects, arrays of objects, and @graph wrapper patterns
 * (all three show up in the wild across different CMS/plugin setups).
 */
function extractJsonLd(html) {
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const matches = [...html.matchAll(scriptRegex)];

  for (const match of matches) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const candidates = Array.isArray(parsed) ? parsed : parsed['@graph'] ? parsed['@graph'] : [parsed];

      for (const candidate of candidates) {
        const type = candidate['@type'];
        const isRecipe = type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'));
        if (isRecipe) return candidate;
      }
    } catch (e) {
      // Malformed JSON-LD block — skip it, try the next script tag
      continue;
    }
  }
  return null;
}

/** Converts an ISO 8601 duration (PT1H30M) to minutes. Returns null if unparseable. */
function isoDurationToMinutes(iso) {
  if (!iso) return null;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return null;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  return hours * 60 + minutes || null;
}

/** Rough parse of "2 red onions (chopped)" or "2 red onions, chopped" into quantity/unit/item/notes. */
function parseIngredientLine(line) {
  const unitAliases = {
    'tsp': 'tsp', 'teaspoon': 'tsp', 'teaspoons': 'tsp',
    'tbsp': 'tbsp', 'tablespoon': 'tbsp', 'tablespoons': 'tbsp',
    'g': 'g', 'kg': 'kg', 'ml': 'ml', 'l': 'l',
    'cup': 'cup', 'cups': 'cup',
    'oz': 'oz', 'lb': 'lb', 'lbs': 'lb',
    'clove': 'clove', 'cloves': 'clove',
    'tin': 'tin', 'tins': 'tin',
    'pack': 'pack', 'packs': 'pack',
    'pinch': 'pinch'
  };
  const unitPattern = Object.keys(unitAliases).join('|');

  // Quantity, optional "of a"/"of", optional unit, then the item text
  const match = line.match(new RegExp(`^([\\d./½¼¾\\s]+)\\s*(?:of a |of )?(${unitPattern})?\\s+(.+)$`, 'i'));

  let quantity = null, unit = null, rest = line.trim();

  if (match) {
    quantity = parseFraction(match[1].trim());
    unit = match[2] ? unitAliases[match[2].toLowerCase()] : null;
    rest = match[3];
  }

  // Pull notes from parentheses first: "red onions (chopped)" -> item "red onions", notes "chopped"
  const parenMatch = rest.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (parenMatch) {
    return { quantity: quantity || null, unit, item: parenMatch[1].trim(), notes: parenMatch[2].trim() };
  }

  // Otherwise split on first comma: "red onions, chopped" -> item "red onions", notes "chopped"
  const [item, ...noteParts] = rest.split(',');

  return {
    quantity: quantity || null,
    unit,
    item: item.trim(),
    notes: noteParts.length ? noteParts.join(',').trim() : null
  };
}

function parseFraction(str) {
  const fractionMap = { '½': 0.5, '¼': 0.25, '¾': 0.75 };
  if (fractionMap[str]) return fractionMap[str];
  if (str.includes('/')) {
    const [num, denom] = str.split('/').map(Number);
    return denom ? num / denom : null;
  }
  const n = parseFloat(str);
  return isNaN(n) ? null : n;
}

/** Normalises schema.org JSON-LD Recipe object into our app's shape. */
function normaliseJsonLd(jsonLd, sourceUrl) {
  const rawIngredients = jsonLd.recipeIngredient || jsonLd.ingredients || [];
  const rawInstructions = jsonLd.recipeInstructions || [];

  const steps = rawInstructions.map(step => {
    if (typeof step === 'string') return step;
    if (step.text) return step.text;
    return JSON.stringify(step);
  });

  const yieldRaw = jsonLd.recipeYield;
  const servings = Array.isArray(yieldRaw)
    ? parseInt(yieldRaw[0], 10) || null
    : parseInt(yieldRaw, 10) || null;

  return {
    title: jsonLd.name || 'Untitled recipe',
    servings,
    prepTimeMinutes: isoDurationToMinutes(jsonLd.prepTime),
    cookTimeMinutes: isoDurationToMinutes(jsonLd.cookTime),
    ingredients: rawIngredients.map(parseIngredientLine),
    steps,
    sourceUrl,
    confidence: 'high',
    extractionMethod: 'json-ld'
  };
}

/** Fallback: strips HTML to plain text and asks Claude to extract the recipe. */
async function extractWithClaude(html, sourceUrl) {
  // Strip tags/scripts/styles down to plain text — keeps the Claude prompt
  // focused and cheap rather than sending raw HTML
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Big publisher sites (Jamie Oliver etc.) bury the recipe under a huge nav
  // megamenu — sometimes 10k+ characters of category links before any real
  // content. Blindly slicing from the top can eat the whole budget on nav
  // junk and never reach the ingredients. Find the first "Ingredients"-style
  // heading and start from there instead, with a bit of lead-in for context
  // (title/description usually sit just above it).
  const ingredientsIndex = text.search(/ingredients/i);
  if (ingredientsIndex > 3000) {
    const leadIn = Math.max(0, ingredientsIndex - 1000);
    text = text.slice(leadIn);
  }

  text = text.slice(0, 15000); // keep it well within context, most recipe pages fit easily

  if (text.length < 200) {
    // Still nothing useful even after a headless-render retry (or headless
    // rendering itself failed/timed out) — give up cleanly rather than
    // sending Claude an empty prompt.
    return {
      title: null,
      servings: null,
      prepTimeMinutes: null,
      cookTimeMinutes: null,
      ingredients: [],
      steps: [],
      sourceUrl,
      confidence: 'low',
      extractionMethod: 'failed',
      needsBrowser: true,
      note: 'Page returned almost no text content even after headless rendering — extraction failed.'
    };
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: RECIPE_SCHEMA_PROMPT,
      messages: [{ role: 'user', content: `URL: ${sourceUrl}\n\nPage text:\n${text}` }]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Claude API error: ${data.error?.message || response.statusText}`);
  }

  const textBlock = data.content.find(b => b.type === 'text');
  const cleaned = textBlock.text.replace(/```json|```/g, '').trim();

  const parsed = JSON.parse(cleaned);
  return { ...parsed, extractionMethod: 'claude-fallback' };
}

async function scrapeRecipe(url) {
  let html = await fetchHtml(url);
  let jsonLd = extractJsonLd(html);

  if (jsonLd) {
    return normaliseJsonLd(jsonLd, url);
  }

  // Very little text content usually means a JS-rendered SPA shell (e.g.
  // Sainsbury's) rather than a genuinely empty/broken page. Retry with a
  // headless browser before giving up — this is the expensive path, so it
  // only kicks in when the cheap static fetch clearly didn't work.
  const plainTextLength = html.replace(/<[^>]+>/g, '').trim().length;
  if (plainTextLength < 500) {
    try {
      const renderedHtml = await fetchRenderedHtml(url);
      const renderedJsonLd = extractJsonLd(renderedHtml);
      if (renderedJsonLd) {
        return normaliseJsonLd(renderedJsonLd, url);
      }
      html = renderedHtml; // fall through to Claude with the rendered page instead of the empty shell
    } catch (err) {
      console.error('Headless render failed:', err.message);
      // Fall through to Claude fallback with the original (likely empty) html —
      // it'll return needsBrowser: true via the length check in extractWithClaude
    }
  }

  return extractWithClaude(html, url);
}

/** Scrapes a recipe and saves it (+ its ingredients) into Supabase. Returns the saved row with its DB id. */
async function scrapeAndSaveRecipe(url) {
  const { supabase } = require('./db');
  const recipe = await scrapeRecipe(url);

  if (recipe.needsBrowser) {
    // Nothing to save — extraction failed even with headless rendering
    return recipe;
  }

  const { data: savedRecipe, error: recipeError } = await supabase
    .from('recipes')
    .insert({
      title: recipe.title,
      source_url: recipe.sourceUrl,
      servings: recipe.servings,
      prep_time_minutes: recipe.prepTimeMinutes,
      cook_time_minutes: recipe.cookTimeMinutes,
      steps: recipe.steps,
      extraction_method: recipe.extractionMethod,
      confidence: recipe.confidence
    })
    .select()
    .single();

  if (recipeError) throw new Error(`Failed to save recipe: ${recipeError.message}`);

  if (recipe.ingredients.length > 0) {
    const ingredientRows = recipe.ingredients.map((ing, i) => ({
      recipe_id: savedRecipe.id,
      position: i,
      quantity: ing.quantity,
      unit: ing.unit,
      item: ing.item,
      notes: ing.notes
    }));

    const { error: ingredientsError } = await supabase
      .from('recipe_ingredients')
      .insert(ingredientRows);

    if (ingredientsError) throw new Error(`Failed to save ingredients: ${ingredientsError.message}`);
  }

  return { ...recipe, id: savedRecipe.id };
}

module.exports = { scrapeRecipe, scrapeAndSaveRecipe, extractJsonLd, normaliseJsonLd, parseIngredientLine };
