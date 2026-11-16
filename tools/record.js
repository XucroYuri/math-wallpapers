#!/usr/bin/env node
/* Record one deterministic loop of a piece to WebM via canvas.captureStream + MediaRecorder.
 *
 * usage:
 *   node tools/record.js <slug> <seconds> [out.webm] [width] [height] [fps]
 *
 * The page is opened in capture mode, so the recorder drives window.__wp.renderAt(t)
 * on a fixed 30fps clock. This produces a frame-accurate loop independent of the
 * browser's refresh rate.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const slug = process.argv[2];
const seconds = Number(process.argv[3]);
if (!slug || !Number.isFinite(seconds) || seconds <= 0) {
  console.error('usage: node tools/record.js <slug> <seconds> [out.webm] [width] [height] [fps]');
  process.exit(2);
}
const out = process.argv[4] || path.join('renders', `${slug}-${seconds}s.webm`);
const width = Number(process.argv[5] ?? 1280);
const height = Number(process.argv[6] ?? 720);
const fps = Number(process.argv[7] ?? 30);
fs.mkdirSync(path.dirname(out), { recursive: true });

const chromePath = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const base = process.env.WP_BASE || 'http://127.0.0.1:8090';
const url = `${base}/pieces/${slug}/?capture=1`;

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
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console.error: ${message.text()}`);
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction(() => window.__wp !== undefined, null, { timeout: 60000 });
    await page.evaluate(() => window.__wp.ready);

    const downloadPromise = page.waitForEvent('download', { timeout: seconds * 1000 + 60000 });
    await page.evaluate(
      async ({ duration, fps }) => {
        const canvas = window.__wp.canvas;
        const stream = canvas.captureStream(fps);
        const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : 'video/webm;codecs=vp8';
        const recorder = new MediaRecorder(stream, {
          mimeType: mime,
          videoBitsPerSecond: 24_000_000,
        });
        const chunks = [];
        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size) chunks.push(event.data);
        };
        const stopped = new Promise((resolve) => {
          recorder.onstop = resolve;
        });
        recorder.start(1000);
        const frameMs = 1000 / fps;
        const start = performance.now();
        const total = Math.floor(duration * fps);
        for (let i = 0; i < total; i++) {
          window.__wp.renderAt(i / fps);
          const target = start + (i + 1) * frameMs;
          const wait = Math.max(0, target - performance.now());
          await new Promise((resolve) => setTimeout(resolve, wait));
        }
        recorder.stop();
        await stopped;
        const blob = new Blob(chunks, { type: mime });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'capture.webm';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        return blob.size;
      },
      { duration: seconds, fps },
    );

    const download = await downloadPromise;
    await download.saveAs(out);
    console.log(`wrote ${out} (${width}x${height}, ${seconds}s @ ${fps}fps)`);
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
