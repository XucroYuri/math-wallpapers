#!/usr/bin/env node
/* Frame-accurate H.264 recording.
 *
 * usage: node tools/record-mp4.js <slug> <seconds> [out.mp4] [width] [height] [fps]
 *
 * Each frame is rendered with window.__wp.renderAt(t) and captured as a JPEG,
 * then ffmpeg packs them at a constant frame rate. Playback length is exactly
 * the requested duration.
 */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { chromium } = require('playwright-core');

const slug = process.argv[2];
const seconds = Number(process.argv[3]);
if (!slug || !Number.isFinite(seconds) || seconds <= 0) {
  console.error('usage: node tools/record-mp4.js <slug> <seconds> [out.mp4] [width] [height] [fps]');
  process.exit(2);
}
const out = process.argv[4] || path.join('renders', 'loops', `${slug}.mp4`);
const width = Number(process.argv[5] ?? 2560);
const height = Number(process.argv[6] ?? 1440);
const fps = Number(process.argv[7] ?? 30);
fs.mkdirSync(path.dirname(out), { recursive: true });

const chromePath = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const base = process.env.WP_BASE || 'http://127.0.0.1:8090';
const url = `${base}/pieces/${slug}/?capture=1`;

function ffmpeg() {
  const shared = [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', 'pipe:0',
    '-an', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  ];
  const nvenc = spawn('ffmpeg', [
    ...shared.slice(0, 3),
    ...shared.slice(3),
    '-c:v', 'h264_nvenc', '-preset', 'p5', '-cq', '20',
    out,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  return nvenc;
}

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

  const encoder = ffmpeg();
  let encoderFailed = false;
  encoder.on('exit', (code) => {
    if (code !== 0) encoderFailed = true;
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction(() => window.__wp !== undefined, null, { timeout: 60000 });
    await page.evaluate(() => window.__wp.ready);
    const total = Math.round(seconds * fps);
    for (let i = 0; i < total; i++) {
      await page.evaluate((t) => window.__wp.renderAt(t), i / fps);
      const jpeg = await page.screenshot({ type: 'jpeg', quality: 90 });
      if (!encoder.stdin.write(jpeg)) {
        await new Promise((resolve) => encoder.stdin.once('drain', resolve));
      }
      if (i > 0 && i % fps === 0) process.stdout.write(`\r${slug} ${i}/${total}`);
    }
    process.stdout.write('\n');
    encoder.stdin.end();
    const code = await new Promise((resolve) => encoder.on('close', resolve));
    if (code !== 0 || encoderFailed) throw new Error(`ffmpeg exited ${code}`);
    console.log(`wrote ${out} (${width}x${height}, ${seconds}s @ ${fps}fps)`);
  } catch (error) {
    problems.push(`fatal: ${error.message}`);
    encoder.kill('SIGKILL');
  } finally {
    await browser.close();
  }

  if (problems.length) {
    console.error(problems.join('\n'));
    process.exitCode = 1;
  }
})();
