import { createWallpaper } from '../../shared/wallpaper.js';

const DURATION = 30;
const BG = '#05070a';
const CYAN = [126, 240, 212];
const PURPLE = [200, 162, 255];
const AMBER = [240, 198, 116];
const TAU = Math.PI * 2;
const SKIP = (new URLSearchParams(location.search).get('skip') || '').split(',').filter(Boolean);
const skip = (name) => SKIP.includes(name);

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smoothstep = (a, b, v) => {
  const x = clamp((v - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
};
const mix = (a, b, t) => a + (b - a) * t;
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function buildGlowSprite() {
  const size = 128;
  const canvas = makeCanvas(size, size);
  const c = canvas.getContext('2d');
  const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(226,255,247,0.95)');
  g.addColorStop(0.10, 'rgba(150,255,231,0.55)');
  g.addColorStop(0.34, 'rgba(126,240,212,0.16)');
  g.addColorStop(0.70, 'rgba(126,240,212,0.035)');
  g.addColorStop(1, 'rgba(126,240,212,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  return canvas;
}

async function loadData() {
  const response = await fetch('./data.json');
  if (!response.ok) throw new Error(`data.json: HTTP ${response.status}`);
  return response.json();
}

function buildGeometry(st) {
  const { width: w, height: h } = st;
  const aspect = w / h;
  const u = clamp((aspect - 16 / 9) / (21 / 9 - 16 / 9), 0, 1);

  const tShow = 60 + 20 * u;
  const curve = st.curve;
  const nVis = Math.min(curve.real.length, Math.floor((tShow - curve.t0) / curve.dt) + 1);
  const tEnd = curve.t0 + (nVis - 1) * curve.dt;

  let reMin = Infinity;
  let reMax = -Infinity;
  let imMin = Infinity;
  let imMax = -Infinity;
  for (let i = 0; i < nVis; i++) {
    const re = curve.real[i];
    const im = curve.imag[i];
    if (re < reMin) reMin = re;
    if (re > reMax) reMax = re;
    if (im < imMin) imMin = im;
    if (im > imMax) imMax = im;
  }

  const heightFrac = 0.65 + 0.03 * u;
  let scale = (heightFrac * h) / Math.max(1e-6, imMax - imMin);
  const spanRe = reMax - reMin;
  if (spanRe * scale > w * 0.60) scale = (w * 0.60) / spanRe;

  const ox = w * (0.555 + 0.005 * u);
  const oy = h * 0.39;

  const px = new Float32Array(nVis);
  const py = new Float32Array(nVis);
  for (let i = 0; i < nVis; i++) {
    px[i] = ox + curve.real[i] * scale;
    py[i] = oy - curve.imag[i] * scale;
  }

  const railTop = h * 0.105;
  const railBottom = h * 0.742;

  const bandX0 = w * (0.35 + 0.06 * u);
  const bandX1 = w * 0.94;
  const bandTop = h * 0.75;
  const bandBase = h * 0.935;

  const nx = st.psi.x.length;
  const psiPx = new Float32Array(nx);
  const xMin = st.psi.x[0];
  const xMax = st.psi.x[nx - 1];
  for (let i = 0; i < nx; i++) {
    psiPx[i] = bandX0 + ((st.psi.x[i] - xMin) / (xMax - xMin)) * (bandX1 - bandX0);
  }
  const psiYScale = (bandBase - bandTop) / Math.max(1e-6, st.psiHi - st.psiLo);
  const psiYBase = bandBase + st.psiLo * psiYScale;

  let nZeros = 0;
  while (nZeros < st.zeros.length && st.zeros[nZeros] <= tEnd) nZeros++;

  const focusShift = Math.acos(clamp(1 - 2 * st.zeros[0] / tEnd, -1, 1)) - (TAU * 4) / DURATION;

  return {
    w,
    h,
    u,
    tShow: tEnd,
    nVis,
    ox,
    oy,
    scale,
    railTop,
    railBottom,
    bandX0,
    bandX1,
    bandTop,
    bandBase,
    psiPx,
    psiYScale,
    psiYBase,
    px,
    py,
    nZeros,
    focusShift,
    pulseW: 1.0 + 0.5 * u,
    trailT: 4.5 + 3.5 * u,
    zeroBuf: new Float32Array(nZeros),
  };
}

function buildBackground(st, g) {
  const { width: w, height: h, dpr } = st;
  const canvas = makeCanvas(w * dpr, h * dpr);
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);

  c.fillStyle = BG;
  c.fillRect(0, 0, w, h);

  const glowR = Math.max(w, h) * 0.46;
  const glow = c.createRadialGradient(g.ox, g.oy, 0, g.ox, g.oy, glowR);
  glow.addColorStop(0, 'rgba(38,100,100,0.17)');
  glow.addColorStop(0.32, 'rgba(22,60,64,0.075)');
  glow.addColorStop(0.72, 'rgba(8,18,22,0.02)');
  glow.addColorStop(1, 'rgba(5,7,10,0)');
  c.fillStyle = glow;
  c.fillRect(0, 0, w, h);

  const haze = c.createRadialGradient(w * 0.76, h * 0.56, 0, w * 0.76, h * 0.56, h * 0.52);
  haze.addColorStop(0, 'rgba(116,88,168,0.055)');
  haze.addColorStop(0.55, 'rgba(80,58,120,0.022)');
  haze.addColorStop(1, 'rgba(5,7,10,0)');
  c.fillStyle = haze;
  c.fillRect(0, 0, w, h);

  c.save();
  c.lineWidth = 0.7;
  c.strokeStyle = rgba(CYAN, 0.022);
  for (let r = 1; r <= 4; r++) {
    c.beginPath();
    c.arc(g.ox, g.oy, r * g.scale, 0, TAU);
    c.stroke();
  }
  c.strokeStyle = rgba(CYAN, 0.035);
  c.beginPath();
  c.moveTo(w * 0.29, g.oy);
  c.lineTo(w * 0.945, g.oy);
  c.stroke();
  c.restore();

  const rand = mulberry32(0x5eed12);
  for (let i = 0; i < 190; i++) {
    const x = w * 0.285 + rand() * w * 0.70;
    const y = h * 0.06 + rand() * h * 0.83;
    const r = 0.35 + rand() * 0.85;
    const tint = rand();
    const a = 0.014 + rand() * 0.028;
    c.fillStyle = tint < 0.76 ? rgba(CYAN, a) : rgba(PURPLE, a);
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.fill();
  }

  c.save();
  c.strokeStyle = rgba(CYAN, 0.075);
  c.lineWidth = 0.7;
  c.beginPath();
  c.moveTo(g.bandX0, g.bandBase + 0.5);
  c.lineTo(g.bandX1, g.bandBase + 0.5);
  c.stroke();
  const nx = st.psi.x.length;
  const xMax = st.psi.x[nx - 1];
  for (let x = 10; x <= xMax; x += 10) {
    const sx = g.bandX0 + ((x - st.psi.x[0]) / (xMax - st.psi.x[0])) * (g.bandX1 - g.bandX0);
    c.beginPath();
    c.moveTo(sx, g.bandBase + 0.5);
    c.lineTo(sx, g.bandBase + 3.5);
    c.stroke();
  }
  c.restore();

  const shade = c.createLinearGradient(0, 0, w * 0.28, 0);
  shade.addColorStop(0, 'rgba(2,3,6,0.52)');
  shade.addColorStop(0.55, 'rgba(2,3,6,0.20)');
  shade.addColorStop(1, 'rgba(2,3,6,0)');
  c.fillStyle = shade;
  c.fillRect(0, 0, w * 0.28, h);

  const vignette = c.createRadialGradient(w * 0.56, h * 0.44, 0, w * 0.56, h * 0.44, Math.hypot(w, h) * 0.64);
  vignette.addColorStop(0, 'rgba(2,3,6,0)');
  vignette.addColorStop(0.48, 'rgba(2,3,6,0.10)');
  vignette.addColorStop(0.82, 'rgba(2,3,6,0.44)');
  vignette.addColorStop(1, 'rgba(2,3,6,0.80)');
  c.fillStyle = vignette;
  c.fillRect(0, 0, w, h);

  c.globalAlpha = 0.085;
  c.drawImage(st.glowSprite, g.ox - h * 0.11, g.oy - h * 0.11, h * 0.22, h * 0.22);
  c.globalAlpha = 1;

  return canvas;
}

function buildCurveLayer(st, g) {
  const { width: w, height: h, dpr } = st;
  const margin = 30;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < g.nVis; i++) {
    if (g.px[i] < minX) minX = g.px[i];
    if (g.px[i] > maxX) maxX = g.px[i];
    if (g.py[i] < minY) minY = g.py[i];
    if (g.py[i] > maxY) maxY = g.py[i];
  }
  const x0 = Math.max(0, Math.floor(minX - margin));
  const y0 = Math.max(0, Math.floor(minY - margin));
  const x1 = Math.min(w, Math.ceil(maxX + margin));
  const y1 = Math.min(h, Math.ceil(maxY + margin));
  const cw = Math.max(1, x1 - x0);
  const ch = Math.max(1, y1 - y0);

  const canvas = makeCanvas(cw * dpr, ch * dpr);
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.translate(-x0, -y0);
  c.lineCap = 'round';
  c.lineJoin = 'round';

  const px = g.px;
  const py = g.py;
  const n = g.nVis;

  c.beginPath();
  for (let i = 0; i < n; i++) {
    if (i === 0) c.moveTo(px[i], py[i]);
    else c.lineTo(px[i], py[i]);
  }
  c.strokeStyle = rgba(CYAN, 0.026);
  c.lineWidth = 8;
  c.stroke();
  c.strokeStyle = rgba(CYAN, 0.05);
  c.lineWidth = 3.2;
  c.stroke();
  c.strokeStyle = rgba(CYAN, 0.10);
  c.lineWidth = 1.6;
  c.stroke();

  const bins = 12;
  const colors = [];
  for (let b = 0; b < bins; b++) {
    const t = 0.82 * (b + 0.5) / bins;
    colors.push(rgb([
      Math.round(mix(CYAN[0], PURPLE[0], t)),
      Math.round(mix(CYAN[1], PURPLE[1], t)),
      Math.round(mix(CYAN[2], PURPLE[2], t)),
    ]));
  }

  const binOf = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const arg = Math.atan2(st.curve.imag[i], st.curve.real[i]);
    const m = 0.5 - 0.5 * Math.cos(arg);
    binOf[i] = Math.min(bins - 1, Math.floor(m * bins));
  }

  c.globalAlpha = 0.62;
  for (let b = 0; b < bins; b++) {
    c.beginPath();
    let open = false;
    for (let i = 0; i < n - 1; i++) {
      if (binOf[i] !== b) {
        open = false;
        continue;
      }
      if (!open) {
        c.moveTo(px[i], py[i]);
        open = true;
      }
      c.lineTo(px[i + 1], py[i + 1]);
    }
    c.strokeStyle = colors[b];
    c.lineWidth = 1.05;
    c.stroke();
  }
  c.globalAlpha = 1;

  return { canvas, x: x0, y: y0, w: cw, h: ch };
}

function buildBandStrip(st, g, values, color) {
  const margin = 6;
  const x0 = Math.max(0, Math.floor(g.bandX0 - margin));
  const y0 = Math.max(0, Math.floor(g.bandTop - margin));
  const x1 = Math.min(st.width, Math.ceil(g.bandX1 + margin));
  const y1 = Math.min(st.height, Math.ceil(g.bandBase + margin));
  const cw = Math.max(1, x1 - x0);
  const ch = Math.max(1, y1 - y0);
  const scale = Math.min(st.dpr, 1.25);

  const canvas = makeCanvas(cw * scale, ch * scale);
  const c = canvas.getContext('2d');
  c.setTransform(scale, 0, 0, scale, 0, 0);
  c.translate(-x0, -y0);
  c.lineCap = 'round';
  c.lineJoin = 'round';

  c.beginPath();
  const nx = st.psi.x.length;
  for (let i = 0; i < nx; i++) {
    const y = g.psiYBase - values[i] * g.psiYScale;
    if (i === 0) c.moveTo(g.psiPx[i], y);
    else c.lineTo(g.psiPx[i], y);
  }
  c.strokeStyle = rgba(color, 0.24);
  c.lineWidth = 3.4;
  c.stroke();
  c.strokeStyle = rgb(color);
  c.lineWidth = 1.05;
  c.stroke();

  return { canvas, x: x0, y: y0, w: cw, h: ch };
}

function buildPsiStrips(st, g) {
  st.psiStrips = new Array(51);
  for (let k = 12; k <= 50; k++) {
    st.psiStrips[k] = buildBandStrip(st, g, st.psi.partials[k], PURPLE);
  }
  st.stairStrip = buildBandStrip(st, g, st.psi.stairs, AMBER);
}

function build(st) {
  if (!st.curve || !st.psi) return;
  const g = buildGeometry(st);
  st.g = g;
  st.bgLayer = buildBackground(st, g);
  st.curveLayer = buildCurveLayer(st, g);
  buildPsiStrips(st, g);
}

function pulseAt(zero, focusT, width) {
  const d = Math.abs(focusT - zero);
  if (d >= width) return 0;
  const p = 1 - d / width;
  return p * p;
}

function drawRail(ctx, g, focusT, pulses, zeros) {
  ctx.save();
  ctx.strokeStyle = rgba(CYAN, 0.018);
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(g.ox, g.railTop);
  ctx.lineTo(g.ox, g.railBottom);
  ctx.stroke();

  ctx.strokeStyle = rgba(CYAN, 0.055);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(g.ox, g.railTop);
  ctx.lineTo(g.ox, g.railBottom);
  ctx.stroke();

  for (let j = 0; j < g.nZeros; j++) {
    const z = zeros[j];
    const y = g.railBottom - (z / g.tShow) * (g.railBottom - g.railTop);
    const p = pulses[j];
    ctx.strokeStyle = rgba(PURPLE, 0.09 + p * 0.28);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(g.ox - 3.5, y);
    ctx.lineTo(g.ox + 3.5, y);
    ctx.stroke();
    if (p > 0.03) {
      ctx.fillStyle = rgba(CYAN, 0.10 + p * 0.30);
      ctx.beginPath();
      ctx.arc(g.ox, y, 1.1, 0, TAU);
      ctx.fill();
    }
  }

  const fy = g.railBottom - (focusT / g.tShow) * (g.railBottom - g.railTop);
  ctx.strokeStyle = rgba(AMBER, 0.26);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(g.ox - 2.5, fy);
  ctx.lineTo(g.ox + 2.5, fy);
  ctx.stroke();
  ctx.fillStyle = rgba(AMBER, 0.42);
  ctx.beginPath();
  ctx.arc(g.ox, fy, 1.2, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function updatePulses(st, g, focusT) {
  for (let j = 0; j < g.nZeros; j++) {
    g.zeroBuf[j] = pulseAt(st.zeros[j], focusT, g.pulseW);
  }
}

function drawFocus(ctx, st, g, focusT) {
  const fi = (focusT / g.tShow) * (g.nVis - 1);
  const i0 = clamp(Math.floor(fi), 0, g.nVis - 1);
  const i1 = Math.min(i0 + 1, g.nVis - 1);
  const frac = fi - i0;
  const hx = g.px[i0] + (g.px[i1] - g.px[i0]) * frac;
  const hy = g.py[i0] + (g.py[i1] - g.py[i0]) * frac;

  const trailPts = Math.max(2, Math.round(g.trailT / st.curve.dt));
  const start = Math.max(0, Math.floor(fi - trailPts));
  const end = i0;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(g.px[start], g.py[start]);
  for (let i = start + 1; i <= end; i++) ctx.lineTo(g.px[i], g.py[i]);
  ctx.lineTo(hx, hy);
  ctx.strokeStyle = rgba(CYAN, 0.05);
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.strokeStyle = rgba(CYAN, 0.24);
  ctx.lineWidth = 1.35;
  ctx.stroke();

  const headStart = Math.max(start, Math.floor(fi - trailPts * 0.22));
  ctx.beginPath();
  ctx.moveTo(g.px[headStart], g.py[headStart]);
  for (let i = headStart + 1; i <= end; i++) ctx.lineTo(g.px[i], g.py[i]);
  ctx.lineTo(hx, hy);
  ctx.strokeStyle = rgba([212, 255, 244], 0.58);
  ctx.lineWidth = 1.15;
  ctx.stroke();

  const glowSize = g.h * 0.085;
  ctx.globalAlpha = 0.62;
  ctx.drawImage(st.glowSprite, hx - glowSize / 2, hy - glowSize / 2, glowSize, glowSize);
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(236,255,249,0.92)';
  ctx.beginPath();
  ctx.arc(hx, hy, 1.25, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawPulses(ctx, st, g, ox, oy) {
  let maxP = 0;
  for (let j = 0; j < g.nZeros; j++) {
    if (g.zeroBuf[j] > maxP) maxP = g.zeroBuf[j];
  }
  if (maxP < 0.01) return;

  for (let j = 0; j < g.nZeros; j++) {
    const p = g.zeroBuf[j];
    if (p < 0.015) continue;
    const q = 1 - p;
    const radius = g.h * (0.012 + 0.082 * q);
    ctx.strokeStyle = rgba(PURPLE, 0.34 * p);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(ox, oy, radius, 0, TAU);
    ctx.stroke();

    ctx.strokeStyle = rgba(CYAN, 0.12 * p);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(ox, oy, radius * 1.55, 0, TAU);
    ctx.stroke();

    const glowSize = g.h * (0.09 + 0.10 * q);
    ctx.globalAlpha = 0.24 * p;
    ctx.drawImage(st.glowSprite, ox - glowSize / 2, oy - glowSize / 2, glowSize, glowSize);
    ctx.globalAlpha = 1;

    ctx.fillStyle = rgba(AMBER, 0.38 * p);
    ctx.beginPath();
    ctx.arc(ox, oy, 1.3 + q * 1.2, 0, TAU);
    ctx.fill();
  }
}

function drawPsi(ctx, st, g, t, env) {
  const k = Math.round(12 + 38 * smoothstep(2.2, 24.0, t));
  ctx.save();
  if (env > 0.001) {
    const strip = st.psiStrips[clamp(k, 12, 50)];
    ctx.globalAlpha = 0.36 * env;
    ctx.drawImage(strip.canvas, strip.x, strip.y, strip.w, strip.h);
    const endY = g.psiYBase - st.psi.partials[k][st.psi.x.length - 1] * g.psiYScale;
    ctx.globalAlpha = 1;
    ctx.fillStyle = rgba(PURPLE, 0.32 * env);
    ctx.beginPath();
    ctx.arc(g.bandX1, endY, 1.25, 0, TAU);
    ctx.fill();
  }

  ctx.globalAlpha = 0.10 + 0.12 * env;
  ctx.drawImage(st.stairStrip.canvas, st.stairStrip.x, st.stairStrip.y, st.stairStrip.w, st.stairStrip.h);
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawLabels(ctx, st, g, cam, env2) {
  const fs = Math.round(clamp(g.h / 110, 9, 12));
  ctx.save();
  ctx.font = `400 ${fs}px "SFMono-Regular", Menlo, Consolas, monospace`;
  ctx.textBaseline = 'middle';

  ctx.fillStyle = rgba(CYAN, 0.31);
  ctx.textAlign = 'right';
  ctx.fillText('ζ(1/2+it)', g.w * 0.928, g.h * 0.165);

  ctx.fillStyle = rgba(CYAN, 0.24);
  ctx.fillText('Re(s)=1/2', g.ox + cam.dx - 8, g.railTop + cam.dy + fs * 0.6);

  ctx.textAlign = 'left';
  ctx.fillStyle = rgba(PURPLE, 0.24);
  ctx.fillText('zeros', g.ox + cam.dx + 8, g.railBottom + cam.dy - fs * 0.5);

  ctx.fillStyle = rgba(AMBER, 0.21 + 0.06 * env2);
  ctx.fillText('ψ(x)', g.bandX0, g.bandTop - fs * 0.9);
  ctx.restore();
}

function drawFrame(st, t) {
  if (!st.bgLayer || !st.curveLayer) return;
  const ctx = st.ctx;
  const g = st.g;
  const phase = (TAU * t) / DURATION;

  const env2 = smoothstep(0, 1.8, t) * (1 - smoothstep(27.5, 30, t));
  const cross = 1 - env2;
  const mainAlpha = 0.88 + 0.12 * cross;

  const cam = {
    dx: Math.sin(phase + 0.4) * 0.0022 * g.w,
    dy: Math.sin(phase + 1.35) * 0.0032 * g.h,
    rot: Math.sin(phase + 0.85) * 0.003,
    zoom: 1 + Math.sin(phase + 2.0) * 0.004,
  };

  const focusPhase = 0.5 - 0.5 * Math.cos(phase + g.focusShift);
  const focusT = g.tShow * focusPhase;
  updatePulses(st, g, focusT);

  if (!skip('bg')) ctx.drawImage(st.bgLayer, 0, 0, g.w, g.h);
  if (!skip('psi')) drawPsi(ctx, st, g, t, env2);

  ctx.save();
  ctx.translate(g.ox + cam.dx, g.oy + cam.dy);
  ctx.rotate(cam.rot);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-g.ox, -g.oy);

  if (!skip('rail')) drawRail(ctx, g, focusT, g.zeroBuf, st.zeros);
  if (!skip('curve')) {
    ctx.globalAlpha = mainAlpha;
    ctx.drawImage(st.curveLayer.canvas, st.curveLayer.x, st.curveLayer.y, st.curveLayer.w, st.curveLayer.h);
    ctx.globalAlpha = 1;
  }
  if (!skip('focus')) drawFocus(ctx, st, g, focusT);
  ctx.restore();

  if (!skip('pulse')) drawPulses(ctx, st, g, g.ox + cam.dx, g.oy + cam.dy);
  if (!skip('label')) drawLabels(ctx, st, g, cam, env2);
}

createWallpaper({
  duration: DURATION,
  fps: 30,
  context: '2d',
  background: BG,
  async setup(st) {
    const data = await loadData();
    st.curve = {
      t0: data.curve.t0,
      dt: data.curve.dt,
      real: Float64Array.from(data.curve.re),
      imag: Float64Array.from(data.curve.im),
    };
    st.zeros = Float64Array.from(data.zeros);
    st.psi = {
      x: Float64Array.from(data.psi.x),
      stairs: Float64Array.from(data.psi.stairs),
      partials: data.psi.partials.map((row) => Float64Array.from(row)),
    };

    let lo = Infinity;
    let hi = -Infinity;
    for (let k = 12; k <= 50; k++) {
      const row = st.psi.partials[k];
      for (let i = 0; i < row.length; i++) {
        if (row[i] < lo) lo = row[i];
        if (row[i] > hi) hi = row[i];
      }
    }
    for (let i = 0; i < st.psi.stairs.length; i++) {
      if (st.psi.stairs[i] < lo) lo = st.psi.stairs[i];
      if (st.psi.stairs[i] > hi) hi = st.psi.stairs[i];
    }
    st.psiLo = lo - 1.2;
    st.psiHi = hi + 1.4;
    st.glowSprite = buildGlowSprite();
    build(st);
  },
  draw(st, t) {
    drawFrame(st, t);
  },
  onResize(st) {
    if (st.curve) build(st);
  },
});
