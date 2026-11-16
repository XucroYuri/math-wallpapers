#!/usr/bin/env node
/* Audit every finished piece: three loop frames at 1280x720, plus 1440p and 1080p
 * ultrawide frames. Writes screenshots/audit/report.json.
 *
 * usage: node tools/audit.js [slug...]
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const root = path.resolve(__dirname, '..');
const piecesDir = path.join(root, 'pieces');
const outDir = path.join(root, 'screenshots', 'audit');
fs.mkdirSync(outDir, { recursive: true });

const wanted = process.argv.slice(2);
const slugs = fs
  .readdirSync(piecesDir)
  .filter((name) => !name.startsWith('_'))
  .filter((name) => fs.existsSync(path.join(piecesDir, name, 'meta.json')))
  .filter((name) => (wanted.length ? wanted.includes(name) : true))
  .sort();

const chromePath = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const base = process.env.WP_BASE || 'http://127.0.0.1:8090';

async function main() {
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
  const report = [];

  for (const slug of slugs) {
    const meta = JSON.parse(fs.readFileSync(path.join(piecesDir, slug, 'meta.json'), 'utf8'));
    const errors = [];
    const entry = { slug, meta, errors, frames: [], perf: null };
    console.log(`audit ${slug}`);

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
    });

    try {
      await page.goto(`${base}/pieces/${slug}/?capture=1`, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForFunction(() => window.__wp !== undefined, null, { timeout: 60000 });
      await page.evaluate(() => window.__wp.ready);
      const duration = await page.evaluate(() => window.__wp.duration);
      entry.duration = duration;

      const times = [0, duration / 3, (2 * duration) / 3];
      for (const t of times) {
        await page.evaluate((tt) => window.__wp.renderAt(tt), t);
        await page.waitForTimeout(120);
        const file = path.join(outDir, `${slug}-t${t.toFixed(1)}.png`);
        await page.screenshot({ path: file });
        entry.frames.push(file);
      }

      entry.perf = await page.evaluate(async () => {
        const times = [];
        for (let i = 0; i < 30; i++) {
          const t = (i / 30) * window.__wp.duration;
          const start = performance.now();
          window.__wp.renderAt(t);
          times.push(performance.now() - start);
        }
        return {
          avgMs: times.reduce((a, b) => a + b, 0) / times.length,
          maxMs: Math.max(...times),
        };
      });

      for (const [w, h, label] of [[2560, 1440, '1440p'], [2560, 1080, '1080p']]) {
        await page.setViewportSize({ width: w, height: h });
        await page.evaluate(() => window.__wp.ready);
        await page.evaluate((tt) => window.__wp.renderAt(tt), duration / 2);
        await page.waitForTimeout(150);
        const file = path.join(outDir, `${slug}-${label}.png`);
        await page.screenshot({ path: file });
        entry.frames.push(file);
      }
    } catch (error) {
      errors.push(`fatal: ${error.message}`);
    } finally {
      await context.close();
    }

    report.push(entry);
  }

  await browser.close();
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  const failures = report.filter((r) => r.errors.length);
  console.log(`\n${report.length} pieces audited, ${failures.length} with errors`);
  for (const r of failures) console.log(`${r.slug}: ${r.errors.join(' | ')}`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
