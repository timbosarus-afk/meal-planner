// Renders a page with a real (headless) browser before scraping it — needed
// for sites like Sainsbury's that serve an empty shell until client-side JS
// runs. Uses @sparticuz/chromium (a Chromium build small enough to fit in a
// Vercel serverless function) + puppeteer-core to drive it.
//
// KNOWN RISK: Vercel's free (Hobby) tier caps serverless functions at 10
// seconds. Launching a browser + navigating + waiting for render can be
// tight against that. If this times out in practice, the fix is raising
// this function's maxDuration on a paid Vercel plan — the approach itself
// is still correct, it just needs more time budget than the free tier allows.

const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

async function fetchRenderedHtml(url) {
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless
  });

  try {
    const page = await browser.newPage();
    // networkidle2 = wait until the page has mostly stopped making requests,
    // a reasonable proxy for "the SPA has finished rendering its content"
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 8000 });
    return await page.content();
  } finally {
    await browser.close();
  }
}

module.exports = { fetchRenderedHtml };
