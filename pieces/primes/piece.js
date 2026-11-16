import { createWallpaper } from '../../shared/wallpaper.js';

const DURATION = 30;
const TAU = Math.PI * 2;
const LIMIT = 2_000_000;
const BG = '#05070a';
const RGB = {
  cyan: [126, 240, 212],
  purple: [200, 162, 255],
  amber: [240, 198, 116],
};
const HEX = {
  cyan: '#7ef0d4',
  purple: '#c8a2ff',
  amber: '#f0c674',
};
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const rgba = (color, a) => `rgba(${color[0]},${color[1]},${color[2]},${a})`;

// Stable 32-bit hash; used to pick a density sub-sample without loading more data.
function hash01(n) {
  let x = (n | 0) ^ 0x9e3779b9;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return ((x >>> 0) / 4294967296);
}

function colorForPrime(p) {
  if (p % 6 === 5) return RGB.purple;
  return RGB.cyan;
}

function makeGlowSprite(color, size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  const core = color.map((c) => Math.round(c * 0.55 + 255 * 0.45));
  grad.addColorStop(0, rgba(core, 1));
  grad.addColorStop(0.16, rgba(core, 0.72));
  grad.addColorStop(0.38, rgba(color, 0.26));
  grad.addColorStop(0.7, rgba(color, 0.05));
  grad.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

function getLayout(width, height) {
  const wide = width / height >= 2.05;
  if (wide) {
    return {
      wide,
      star: {
        cx: width * 0.405,
        cy: height * 0.465,
        rx: Math.min(width * 0.170, height * 0.405),
        ry: height * 0.335,
      },
      comet: {
        x0: width * 0.615,
        x1: width * 0.965,
        y0: height * 0.105,
        y1: height * 0.895,
      },
      rules: {
        vertX: width * 0.592,
        vertY0: height * 0.065,
        vertY1: height * 0.935,
      },
    };
  }
  const starRx = Math.min(width * 0.335, height * 0.62);
  return {
    wide,
    star: {
      cx: width * 0.605,
      cy: height * 0.282,
      rx: starRx,
      ry: Math.min(height * 0.246, starRx * 0.52),
    },
    comet: {
      x0: width * 0.255,
      x1: width * 0.955,
      y0: height * 0.585,
      y1: height * 0.925,
    },
    rules: {
      horizX0: width * 0.24,
      horizX1: width * 0.965,
      horizY: height * 0.558,
    },
  };
}

function buildStarLayer(data, layout, dpr, view) {
  const { cx, cy, rx, ry } = layout.star;
  const scale = 1.08;
  const bw = rx * 2 * scale;
  const bh = ry * 2 * scale;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bw * dpr));
  canvas.height = Math.max(1, Math.round(bh * dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, bw / 2, bh / 2);
  ctx.imageSmoothingEnabled = true;

  const cyanSprite = makeGlowSprite(RGB.cyan);
  const purpleSprite = makeGlowSprite(RGB.purple);
  const amberSprite = makeGlowSprite(RGB.amber);
  const sprites = [cyanSprite, purpleSprite, amberSprite];

  // A very soft nebular lift under the stars.
  ctx.save();
  ctx.scale(1, ry / rx);
  const nebula = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * 1.02);
  nebula.addColorStop(0, 'rgba(24, 58, 56, 0.10)');
  nebula.addColorStop(0.45, 'rgba(30, 44, 66, 0.05)');
  nebula.addColorStop(1, 'rgba(5, 7, 10, 0)');
  ctx.fillStyle = nebula;
  ctx.fillRect(-rx * 1.2, -rx * 1.2, rx * 2.4, rx * 2.4);
  ctx.restore();

  // Twin constellations: hairlines first, stars on top.
  const twins = data.twins;
  const twinVisible = [];
  for (let i = 0; i < twins.p.length; i++) {
    if (hash01(i * 7919 + 17) > view.twinThreshold) continue;
    twinVisible.push(i);
  }
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(178, 214, 232, 0.60)';
  ctx.lineWidth = 0.72;
  ctx.lineCap = 'round';
  for (const i of twinVisible) {
    const x1 = twins.x1[i] * rx;
    const y1 = twins.y1[i] * ry;
    const x2 = twins.x2[i] * rx;
    const y2 = twins.y2[i] * ry;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const bow = Math.sin(twins.p[i] * 0.00021) * 0.012 * Math.max(rx, ry);
    const mx = (x1 + x2) / 2 - (dy / len) * bow;
    const my = (y1 + y2) / 2 + (dx / len) * bow;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(mx, my, x2, y2);
    ctx.stroke();
  }

  const stars = data.stars;
  const drawStar = (x, y, p, index, intensity, minSize = 0) => {
    const u = clamp(p / LIMIT, 0, 1);
    const jitter = hash01(index * 2654435761 + 991);
    const diameter = Math.max(minSize, (2.2 + 10.5 * Math.pow(u, 3.0)) * (0.82 + 0.36 * jitter));
    const alpha = Math.max(minSize > 0 ? 0.42 : 0, (0.10 + 0.62 * Math.pow(u, 2.6)) * (0.82 + 0.32 * jitter) * intensity);
    const color = colorForPrime(p);
    const sprite = color === RGB.purple ? sprites[1] : sprites[0];
    ctx.globalAlpha = alpha;
    ctx.drawImage(sprite, x - diameter / 2, y - diameter / 2, diameter, diameter);
    if (u > 0.86) {
      ctx.globalAlpha = alpha * 0.34;
      const halo = diameter * 3.4;
      ctx.drawImage(sprite, x - halo / 2, y - halo / 2, halo, halo);
    }
  };

  for (let i = 0; i < stars.p.length; i++) {
    if (hash01(i * 2654435761 + 41) > view.starThreshold) continue;
    drawStar(stars.x[i] * rx, stars.y[i] * ry, stars.p[i], i, 1);
  }

  for (const i of twinVisible) {
    const p = twins.p[i];
    const p2 = p + 2;
    const companionAlpha = 1.45;
    const x1 = twins.x1[i] * rx;
    const y1 = twins.y1[i] * ry;
    const x2 = twins.x2[i] * rx;
    const y2 = twins.y2[i] * ry;
    drawStar(x1, y1, p, 50001 + i, companionAlpha, 3.6);
    drawStar(x2, y2, p2, 70001 + i, companionAlpha, 3.6);
  }

  // A handful of small four-point sparkles on the largest stars.
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = 'rgba(210, 250, 240, 0.8)';
  ctx.lineWidth = 0.55;
  const sparkleStep = Math.max(1, Math.floor(stars.p.length / 46));
  for (let i = 0; i < stars.p.length; i += sparkleStep) {
    if (stars.p[i] < 1_500_000 || hash01(i * 2654435761 + 41) > view.starThreshold) continue;
    const x = stars.x[i] * rx;
    const y = stars.y[i] * ry;
    const arm = 3.4 + 2.5 * hash01(i + 111);
    ctx.beginPath();
    ctx.moveTo(x - arm, y);
    ctx.lineTo(x + arm, y);
    ctx.moveTo(x, y - arm);
    ctx.lineTo(x, y + arm);
    ctx.stroke();
  }

  // Fade the rim so the disk does not end on a hard ellipse.
  ctx.globalCompositeOperation = 'destination-in';
  ctx.save();
  ctx.scale(rx, ry);
  const mask = ctx.createRadialGradient(0, 0, 0.58, 0, 0, 1.045);
  mask.addColorStop(0, 'rgba(0,0,0,1)');
  mask.addColorStop(0.82, 'rgba(0,0,0,0.94)');
  mask.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = mask;
  ctx.fillRect(-1.15, -1.15, 2.3, 2.3);
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  return { canvas, bw, bh, cx, cy, sprites, twinVisible, drawStar };
}

function buildCometLayer(data, layout, dpr) {
  const { x0, y0, x1, y1 } = layout.comet;
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.globalCompositeOperation = 'lighter';

  const counts = data.goldbach.counts;
  const start = data.goldbach.start;
  const step = data.goldbach.step;
  let maxCount = 0;
  for (const c of counts) if (c > maxCount) maxCount = c;
  const power = 0.70;
  const n = counts.length;
  const residueTint = [RGB.amber, RGB.cyan, RGB.purple];
  const dotSprites = residueTint.map((c) => makeGlowSprite(c, 32));
  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  const nValues = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = ((start + step * i) - 4) / (LIMIT - 4) * w;
    ys[i] = h - 3 - Math.pow(counts[i] / maxCount, power) * (h - 8);
    nValues[i] = (start + step * i) / 2;
  }

  // Moving average per residue, 11 neighbours on either side.
  const smooth = new Float32Array(n);
  const win = 11;
  for (let r = 0; r < 3; r++) {
    const idx = [];
    for (let i = 0; i < n; i++) if ((nValues[i] % 3) === r) idx.push(i);
    const values = idx.map((i) => counts[i]);
    const prefix = new Float64Array(values.length + 1);
    for (let k = 0; k < values.length; k++) prefix[k + 1] = prefix[k] + values[k];
    for (let k = 0; k < values.length; k++) {
      const lo = Math.max(0, k - win);
      const hi = Math.min(values.length - 1, k + win);
      smooth[idx[k]] = (prefix[hi + 1] - prefix[lo]) / (hi - lo + 1);
    }
  }

  // Speckle: one point per stored Goldbach sample.
  for (let i = 0; i < n; i++) {
    const r = nValues[i] % 3;
    const sprite = dotSprites[r];
    const size = r === 0 ? 4.2 : 3.6;
    ctx.globalAlpha = r === 0 ? 0.50 : 0.43;
    ctx.drawImage(sprite, xs[i] - size / 2, ys[i] - size / 2, size, size);
    if (r === 0) {
      ctx.globalAlpha = 0.06;
      const halo = size * 2.6;
      ctx.drawImage(sprite, xs[i] - halo / 2, ys[i] - halo / 2, halo, halo);
    }
  }

  // Three smoothed tails; the lower two residues are slightly separated so
  // their interleaved counts remain legible as separate branches.
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let r = 0; r < 3; r++) {
    const color = residueTint[r];
    const offset = r === 1 ? -2.2 : r === 2 ? 2.2 : 0;
    const line = [];
    for (let i = 0; i < n; i++) {
      if ((nValues[i] % 3) !== r) continue;
      const y = h - 3 - Math.pow(smooth[i] / maxCount, power) * (h - 8) + offset;
      line.push([xs[i], y]);
    }
    ctx.lineWidth = r === 0 ? 6.0 : 4.6;
    ctx.strokeStyle = rgba(color, 0.06);
    strokePolyline(ctx, line);
    ctx.lineWidth = r === 0 ? 2.6 : 2.0;
    ctx.strokeStyle = rgba(color, 0.12);
    strokePolyline(ctx, line);
    ctx.lineWidth = r === 0 ? 1.2 : 0.95;
    ctx.strokeStyle = rgba(color, r === 0 ? 0.62 : 0.50);
    strokePolyline(ctx, line);
  }

  return {
    canvas, w, h, x0, y0, x1, y1, xs, ys, smooth, nValues, counts, power, maxCount,
    start, step,
  };
}

function strokePolyline(ctx, points) {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.stroke();
}

function buildScene(state) {
  const data = state.data;
  const layout = getLayout(state.width, state.height);
  const dpr = state.dpr;
  const area = state.width * state.height;
  const starCount = clamp(Math.round(area / 300), 2200, data.stars.p.length);
  const twinCount = clamp(Math.round(area / 4500), 170, data.twins.p.length);
  const view = {
    starThreshold: starCount / data.stars.p.length,
    twinThreshold: twinCount / data.twins.p.length,
  };
  const starLayer = buildStarLayer(data, layout, dpr, view);
  const cometLayer = buildCometLayer(data, layout, dpr);

  // A few bright stars that breathe on top of the prerendered field.
  const twinkles = [];
  for (let i = 0; i < data.stars.p.length && twinkles.length < 26; i++) {
    if (data.stars.p[i] < 1_700_000) continue;
    if (hash01(i * 2654435761 + 41) > view.starThreshold) continue;
    twinkles.push({
      x: data.stars.x[i],
      y: data.stars.y[i],
      color: colorForPrime(data.stars.p[i]),
      phase: hash01(i + 701) * TAU,
      period: 9 + hash01(i + 902) * 9,
      amp: 0.10 + hash01(i + 313) * 0.12,
    });
  }
  if (!twinkles.length) {
    twinkles.push({
      x: data.stars.x[data.stars.x.length - 1],
      y: data.stars.y[data.stars.y.length - 1],
      color: RGB.purple,
      phase: 0,
      period: 12,
      amp: 0.1,
    });
  }

  return { layout, starLayer, cometLayer, twinkles, width: state.width, height: state.height };
}

function drawLabels(ctx, scene, t) {
  const { width, height, layout } = scene;
  const fontSize = Math.round(clamp(width / 125, 10, 13));
  const alpha = 0.34;
  ctx.save();
  ctx.font = `${fontSize}px ${MONO}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = alpha;
  let twinX, twinY, formulaX, formulaY, cometX, cometY;
  if (layout.wide) {
    twinX = width * 0.575;
    twinY = height * 0.083;
    formulaX = width * 0.962;
    formulaY = height * 0.068;
    cometX = width * 0.962;
    cometY = height * 0.952;
  } else {
    twinX = width * 0.955;
    twinY = height * 0.073;
    formulaX = width * 0.952;
    formulaY = height * 0.566;
    cometX = width * 0.952;
    cometY = height * 0.962;
  }
  ctx.fillStyle = HEX.cyan;
  ctx.fillText('twin primes', twinX, twinY);
  ctx.fillStyle = HEX.amber;
  ctx.globalAlpha = alpha * 0.9;
  ctx.fillText('2n = p + q', formulaX, formulaY);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = HEX.amber;
  ctx.fillText('Goldbach comet', cometX, cometY);
  ctx.restore();
}

function drawBackground(ctx, scene, t) {
  const { width, height } = scene;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, height);
  // A slow, very low-contrast cool lift keeps the dark field from going flat.
  const gx = scene.layout.wide ? width * 0.42 : width * 0.62;
  const gy = scene.layout.wide ? height * 0.46 : height * 0.34;
  const radius = Math.max(width, height) * 0.85;
  const breathe = 1 + 0.02 * Math.sin(t / DURATION * TAU);
  const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, radius * breathe);
  grad.addColorStop(0, 'rgba(22, 44, 52, 0.16)');
  grad.addColorStop(0.52, 'rgba(12, 22, 32, 0.06)');
  grad.addColorStop(1, 'rgba(5, 7, 10, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
}

function drawRules(ctx, scene) {
  const { layout } = scene;
  ctx.save();
  ctx.strokeStyle = 'rgba(160, 210, 215, 0.10)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (layout.wide) {
    const { vertX, vertY0, vertY1 } = layout.rules;
    ctx.moveTo(vertX, vertY0);
    ctx.lineTo(vertX, vertY1);
  } else {
    const { horizX0, horizX1, horizY } = layout.rules;
    ctx.moveTo(horizX0, horizY);
    ctx.lineTo(horizX1, horizY);
  }
  ctx.stroke();

  // Comet baseline and four quiet ticks.
  const { x0, x1, y1 } = layout.comet;
  ctx.strokeStyle = 'rgba(240, 198, 116, 0.16)';
  ctx.beginPath();
  ctx.moveTo(x0, y1);
  ctx.lineTo(x1, y1);
  for (let k = 0; k <= 4; k++) {
    const x = x0 + (x1 - x0) * (k / 4);
    ctx.moveTo(x, y1 - 4);
    ctx.lineTo(x, y1 + 1);
  }
  ctx.stroke();
  ctx.restore();
}

function drawComet(ctx, scene, t) {
  const { cometLayer, layout } = scene;
  const { canvas, w, h, x0, y0, x1, y1, xs, ys, smooth, nValues, counts } = cometLayer;
  const fade = t > DURATION - 2 ? clamp((DURATION - t) / 2, 0, 1) : 1;
  if (fade <= 0) return;
  const tNorm = Math.min(t, DURATION - 2) / (DURATION - 2);
  const progress = Math.pow(tNorm, 0.55);

  ctx.save();
  // Unscanned portion: a faint guide so the three tails read early.
  const ghost = 0.55 * Math.sin(Math.PI * t / DURATION) * fade;
  if (ghost > 0) {
    ctx.globalAlpha = ghost;
    ctx.drawImage(canvas, x0, y0, w, h);
  }

  if (progress > 0) {
    const sourceW = Math.max(1, Math.floor(canvas.width * progress));
    const shownW = w * progress;
    ctx.globalAlpha = 0.92 * fade;
    ctx.drawImage(canvas, 0, 0, sourceW, canvas.height, x0, y0, shownW, h);

    // Scan line: a thin amber vertical with a soft head at the current tail.
    const scanX = x0 + w * progress;
    const scanAlpha = Math.min(1, progress * 8) * fade;
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, 'rgba(240, 198, 116, 0)');
    g.addColorStop(0.14, `rgba(240, 198, 116, ${0.20 * scanAlpha})`);
    g.addColorStop(0.92, `rgba(240, 198, 116, ${0.34 * scanAlpha})`);
    g.addColorStop(1, 'rgba(240, 198, 116, 0)');
    ctx.strokeStyle = g;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(scanX, y0);
    ctx.lineTo(scanX, y1);
    ctx.stroke();

    // Head: the highest (amber) smoothed count at the scan position.
    let headIndex = -1;
    let bestDist = Infinity;
    for (let i = 0; i < nValues.length; i++) {
      if ((nValues[i] % 3) !== 0) continue;
      const d = Math.abs(xs[i] - w * progress);
      if (d < bestDist) {
        bestDist = d;
        headIndex = i;
      }
    }
    if (headIndex >= 0) {
      const hx = scanX;
      const hy = y0 + h - 3 - Math.pow(smooth[headIndex] / cometLayer.maxCount, cometLayer.power) * (h - 8);
      const sprite = scene.starLayer.sprites[2];
      const size = 30;
      ctx.globalAlpha = 0.62 * scanAlpha;
      ctx.drawImage(sprite, hx - size / 2, hy - size / 2, size, size);
      ctx.globalAlpha = 0.9 * scanAlpha;
      ctx.fillStyle = HEX.amber;
      ctx.beginPath();
      ctx.arc(hx, hy, 1.35, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawStarfield(ctx, scene, t) {
  const { layout, starLayer, twinkles } = scene;
  const { cx, cy, rx, ry } = layout.star;
  const angle = 0.072 * Math.sin((t / DURATION) * TAU) + 0.015 * Math.sin((t / DURATION) * TAU * 2 + 1.1);
  const drift = 0.0035 * Math.sin((t / DURATION) * TAU + 0.7);
  ctx.save();
  ctx.translate(cx + drift * rx, cy + drift * ry * 0.4);
  ctx.rotate(angle);
  ctx.drawImage(starLayer.canvas, -starLayer.bw / 2, -starLayer.bh / 2, starLayer.bw, starLayer.bh);

  // Breathing halos for the brightest stars, so the rotation feels alive.
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (const star of twinkles) {
    const x = star.x * rx;
    const y = star.y * ry;
    const px = x * cos - y * sin;
    const py = x * sin + y * cos;
    const pulse = 0.5 + 0.5 * Math.sin((t / star.period) * TAU + star.phase);
    const sprite = star.color === RGB.purple ? starLayer.sprites[1] : starLayer.sprites[0];
    const size = 14 + pulse * 8;
    ctx.globalAlpha = star.amp * (0.35 + 0.65 * pulse);
    ctx.drawImage(sprite, cx + px - size / 2, cy + py - size / 2, size, size);
  }
  ctx.restore();
}

createWallpaper({
  duration: DURATION,
  fps: 30,
  context: '2d',
  background: BG,
  dprCap: 1.5,
  async setup(state) {
    const response = await fetch('./data.json');
    if (!response.ok) throw new Error(`data.json: HTTP ${response.status}`);
    state.data = await response.json();
    state.scene = buildScene(state);
  },
  draw(state, t) {
    const scene = state.scene;
    if (!scene) return;
    const { ctx } = state;
    drawBackground(ctx, scene, t);
    drawStarfield(ctx, scene, t);
    drawRules(ctx, scene);
    drawComet(ctx, scene, t);
    drawLabels(ctx, scene, t);
  },
  onResize(state) {
    if (state.data) state.scene = buildScene(state);
  },
});
