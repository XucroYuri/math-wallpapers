#!/usr/bin/env node
/* Render one frame of a piece to a PNG.
 *
 * usage:
 *   node tools/snapshot.js <slug> [out.png] [time] [width] [height]
 *
 * Requires the shared server on 127.0.0.1:8090:
 *   python3 -m http.server 8090 --bind 127.0.0.1
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const slug = process.argv[2];
if (!slug) {
  console.error('usage: node tools/snapshot.js <slug> [out.png] [time] [width] [height]');
  process.exit(2);
}
const out = process.argv[3] || path.join('screenshots', `${slug}.png`);
const time = Number(process.argv[4] ?? 0);
const width = Number(process.argv[5] ?? 1280);
const height = Number(process.argv[6] ?? 720);

fs.mkdirSync(path.dirname(out), { recursive: true });

const chromePath = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const base = process.env.WP_BASE || 'http://127.0.0.1:8090';
const url = `${base}/pieces/${slug}/?t=${time}`;

(async () => {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--disable-dev-shm-usage',
    ],
  });
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  const problems = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console.error: ${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    if (request.url().endsWith('/favicon.ico')) return;
    problems.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) {
      problems.push(`http ${response.status()}: ${response.url()}`);
    }
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction(() => window.__wp !== undefined, null, { timeout: 60000 });
    await page.evaluate(() => window.__wp.ready);
    await page.evaluate((t) => window.__wp.renderAt(t), time);
    await page.waitForTimeout(350);
    await page.screenshot({ path: out });
    const info = await page.evaluate(() => ({
      duration: window.__wp.duration,
      width: window.__wp.state.width,
      height: window.__wp.state.height,
      time: window.__wp.state.time,
    }));
    console.log(`wrote ${out} (${width}x${height}) t=${time}s loop=${info.duration}s canvas=${info.width}x${info.height}`);
  } catch (error) {
    problems.push(`fatal: ${error.message}`);
  } finally {
    await browser.close();
  }

  if (problems.length) {
    console.error(problems.join('\n'));
    process.exitCode = 1;
  }
})();
