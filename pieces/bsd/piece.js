import { createWallpaper } from '../../shared/wallpaper.js';

const DURATION = 30;
const TAU = Math.PI * 2;

const BG = '#05070a';
const CYAN = '126,240,212';
const AMBER = '240,198,116';
const VIOLET = '200,162,255';
const INK = '226,239,241';
const FONT = '"DejaVu Sans Mono","Liberation Mono",ui-monospace,Menlo,Consolas,monospace';

const WORLD = { xMin: 0.35, xMax: 6.35, yMin: -16.3, yMax: 16.3 };
const X0 = Math.cbrt(2);

const P = { x: 3, y: 5 };
const P2 = { x: 129 / 100, y: -383 / 1000 };
const P3 = { x: 164323 / 29241, y: -66234835 / 5000211 };
const R3 = { x: P3.x, y: -P3.y };
const R2 = { x: P2.x, y: -P2.y };

const TANGENT_SLOPE = 2.7;
const TANGENT_A = { x: 0.95, y: 5 + TANGENT_SLOPE * (0.95 - 3) };
const TANGENT_B = { x: 4.35, y: 5 + TANGENT_SLOPE * (4.35 - 3) };

const EVENTS = [
  { type: 'chord', start: 3.5, end: 8.3 },
  { type: 'tangent', start: 11.2, end: 16.0 },
  { type: 'chord', start: 18.2, end: 23.2 },
];

const STAR_PRESENCE = {
  P: [1.1, 2.8],
  '2P': [2.5, 4.1],
  '3P': [3.9, 5.7],
};

const BG_STARS = buildBackgroundStars();

function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function smooth(x) {
  const u = clamp01(x);
  return u * u * (3 - 2 * u);
}

function frac(x) {
  return x - Math.floor(x);
}

function smoothstep(a, b, x) {
  return smooth((x - a) / (b - a));
}

function buildBackgroundStars() {
  let seed = 0x51f15e;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const out = [];
  for (let i = 0; i < 120; i++) {
    let x = rand();
    if (x < 0.23) x += 0.23;
    const y = 0.08 + rand() * 0.84;
    const amber = rand() < 0.16;
    const alpha = 0.032 + rand() * 0.085;
    const radius = 0.5 + rand() * 0.9;
    const phase = rand() * TAU;
    const cycles = 1 + Math.floor(rand() * 3);
    out.push({ x, y, amber, alpha, radius, phase, cycles });
  }
  return out;
}

function makeCurveSamples() {
  const n = 1400;
  const cx = new Float32Array(n);
  const cy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const x = X0 + (WORLD.xMax - X0) * u;
    cx[i] = x;
    cy[i] = Math.sqrt(Math.max(0, x * x * x - 2));
  }
  return { n, cx, cy };
}

const CURVE = makeCurveSamples();

function computeLayout(width, height) {
  const wide = width / height >= 2.0;
  const plot = wide
    ? { x: width * 0.18, y: height * 0.10, w: width * 0.50, h: height * 0.84 }
    : { x: width * 0.20, y: height * 0.09, w: width * 0.605, h: height * 0.82 };

  const side = wide
    ? { x: width * 0.705, y: height * 0.08, w: width * 0.25, h: height * 0.84 }
    : { x: width * 0.80, y: height * 0.55, w: width * 0.175, h: height * 0.39 };

  const sx = plot.w / (WORLD.xMax - WORLD.xMin);
  const sy = plot.h / (WORLD.yMax - WORLD.yMin);

  const map = (p) => ({
    x: plot.x + (p.x - WORLD.xMin) * sx,
    y: plot.y + (WORLD.yMax - p.y) * sy,
  });

  const torus = wide
    ? {
        cx: side.x + side.w * 0.52,
        cy: height * 0.32,
        r: Math.min(side.w * 0.42, side.h * 0.235),
      }
    : {
        cx: side.x + side.w * 0.53,
        cy: height * 0.815,
        r: Math.min(side.w * 0.42, side.h * 0.24),
      };

  const lpanel = wide
    ? { x: side.x + side.w * 0.06, y: height * 0.60, w: side.w * 0.88, h: height * 0.15 }
    : { x: side.x + side.w * 0.03, y: height * 0.55, w: side.w * 0.94, h: height * 0.13 };

  return {
    width,
    height,
    wide,
    plot,
    side,
    torus,
    lpanel,
    sx,
    sy,
    map,
    sP: map(P),
    sP2: map(P2),
    sP3: map(P3),
    sR3: map(R3),
    sR2: map(R2),
    sTA: map(TANGENT_A),
    sTB: map(TANGENT_B),
  };
}

function screenX(layout, x) {
  return layout.plot.x + (x - WORLD.xMin) * layout.sx;
}

function screenY(layout, y) {
  return layout.plot.y + (WORLD.yMax - y) * layout.sy;
}

function buildCurvePath(layout) {
  const { n, cx, cy } = CURVE;
  const path = new Path2D();
  path.moveTo(screenX(layout, cx[0]), screenY(layout, cy[0]));
  for (let i = 1; i < n; i++) path.lineTo(screenX(layout, cx[i]), screenY(layout, cy[i]));
  path.moveTo(screenX(layout, cx[0]), screenY(layout, -cy[0]));
  for (let i = 1; i < n; i++) path.lineTo(screenX(layout, cx[i]), screenY(layout, -cy[i]));
  return path;
}

function buildAxisPaths(layout) {
  const axis = new Path2D();
  const y0 = screenY(layout, 0);
  axis.moveTo(screenX(layout, WORLD.xMin), y0);
  axis.lineTo(screenX(layout, WORLD.xMax), y0);
  const ticks = new Path2D();
  for (let k = 1; k <= 6; k++) {
    const px = screenX(layout, k);
    ticks.moveTo(px, y0 - 2.2);
    ticks.lineTo(px, y0 + 2.2);
  }
  return { axis, ticks };
}

function drawBackground(ctx, state, t) {
  const { width: w, height: h, bgGlow, bgGlowRect } = state;
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = bgGlow;
  ctx.fillRect(bgGlowRect.x, bgGlowRect.y, bgGlowRect.w, bgGlowRect.h);

  const phase = TAU * t / DURATION;
  for (const s of BG_STARS) {
    const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(phase * s.cycles + s.phase));
    ctx.fillStyle = s.amber ? `rgb(${AMBER})` : `rgb(${CYAN})`;
    ctx.globalAlpha = s.alpha * tw;
    ctx.fillRect(s.x * w, s.y * h, s.radius, s.radius);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function drawCurve(ctx, state, t) {
  const breathe = 0.90 + 0.10 * Math.sin(TAU * t / DURATION + 0.8);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.strokeStyle = `rgb(${CYAN})`;
  ctx.lineWidth = 0.65;
  ctx.globalAlpha = 0.10 * breathe;
  ctx.stroke(state.axisPath);
  ctx.globalAlpha = 0.11 * breathe;
  ctx.stroke(state.tickPath);

  const passes = [
    [14.0, 0.018],
    [6.5, 0.042],
    [2.8, 0.10],
    [0.9, 0.55],
  ];
  for (const [width, alpha] of passes) {
    ctx.lineWidth = width;
    ctx.globalAlpha = alpha * breathe;
    ctx.stroke(state.curvePath);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function drawStar(ctx, x, y, size, alpha) {
  const r = size / 2;
  const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
  glow.addColorStop(0, 'rgba(255,248,226,1)');
  glow.addColorStop(0.05, 'rgba(255,238,191,0.92)');
  glow.addColorStop(0.18, 'rgba(240,198,116,0.38)');
  glow.addColorStop(0.52, 'rgba(240,198,116,0.09)');
  glow.addColorStop(1, 'rgba(240,198,116,0)');

  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = glow;
  ctx.fillRect(x - r, y - r, size, size);

  ctx.strokeStyle = 'rgba(255,240,204,0.78)';
  ctx.lineCap = 'round';
  ctx.globalAlpha = alpha * 0.30;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(x - 0.86 * r, y);
  ctx.lineTo(x + 0.86 * r, y);
  ctx.moveTo(x, y - 0.86 * r);
  ctx.lineTo(x, y + 0.86 * r);
  ctx.stroke();

  ctx.globalAlpha = alpha * 0.16;
  ctx.lineWidth = 0.65;
  ctx.beginPath();
  ctx.moveTo(x - 0.52 * r, y - 0.52 * r);
  ctx.lineTo(x + 0.52 * r, y + 0.52 * r);
  ctx.moveTo(x + 0.52 * r, y - 0.52 * r);
  ctx.lineTo(x - 0.52 * r, y + 0.52 * r);
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function starPresence(key, t) {
  const [a, b] = STAR_PRESENCE[key];
  const fadeOut = 1 - smoothstep(27.0, 29.55, t);
  return smoothstep(a, b, t) * fadeOut;
}

function starPulse(key, t) {
  for (const e of EVENTS) {
    const u = (t - e.start) / (e.end - e.start);
    if (u <= 0.48 || u >= 0.82) continue;
    const p = Math.sin(Math.PI * clamp01((u - 0.48) / 0.34));
    if (p <= 0) continue;
    if (e.type === 'chord' && key === '3P') return p;
    if (e.type === 'tangent' && key === '2P') return p;
  }
  return 0;
}

function text(ctx, str, x, y, size, alpha, color, align = 'left', baseline = 'middle') {
  if (alpha <= 0.002) return;
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillStyle = `rgba(${color},${alpha})`;
  ctx.fillText(str, x, y);
}

function drawRationalStars(ctx, state, t) {
  const layout = state.layout;
  const unit = Math.min(state.width, state.height) / 720;
  const size = 74 * unit;
  const entries = [
    { key: 'P', p: layout.sP, label: '(3, 5)', exact: true, dx: 13, dy: -26, align: 'left' },
    { key: '2P', p: layout.sP2, label: '(1.29, \u22120.383)', exact: false, dx: 13, dy: 22, align: 'left' },
    { key: '3P', p: layout.sP3, label: '(5.62, \u221213.25)', exact: false, dx: -14, dy: -13, align: 'right' },
  ];

  for (const entry of entries) {
    const presence = starPresence(entry.key, t);
    if (presence <= 0.004) continue;
    const pulse = starPulse(entry.key, t);
    const twinkle = 0.86 + 0.14 * Math.sin(TAU * t / 3 + entry.key.length * 1.7);
    const glow = presence * twinkle * (0.78 + 0.22 * pulse);
    drawStar(ctx, entry.p.x, entry.p.y, size * (1 + 0.10 * pulse), glow);

    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,245,218,${0.82 * presence})`;
    ctx.beginPath();
    ctx.arc(entry.p.x, entry.p.y, 1.8 * unit * (1 + 0.35 * pulse), 0, TAU);
    ctx.fill();
    const ringAlpha = 0.12 * pulse;
    if (ringAlpha > 0.004) {
      ctx.strokeStyle = `rgba(${VIOLET},${ringAlpha})`;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(entry.p.x, entry.p.y, (8 + 26 * (1 - Math.cos(Math.PI * 0.5 * pulse))) * unit, 0, TAU);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    const tx = entry.p.x + entry.dx * unit;
    const ty = entry.p.y + entry.dy * unit;
    text(ctx, entry.key, tx, ty, 12, 0.37 * presence, AMBER, entry.align);
    text(
      ctx,
      entry.exact ? entry.label : `\u2248 ${entry.label}`,
      tx,
      ty + 13 * unit,
      9.5,
      0.25 * presence,
      INK,
      entry.align,
    );
  }
}

function drawTorus(ctx, state, t) {
  const { cx, cy, r } = state.layout.torus;
  const phase = TAU * t / DURATION;
  const angle = -0.20 + 0.045 * Math.sin(phase);
  const ux = Math.cos(angle) * r * 0.60;
  const uy = Math.sin(angle) * r * 0.60;
  const va = angle + 1.12;
  const vx = Math.cos(va) * r * 0.58;
  const vy = Math.sin(va) * r * 0.58;
  const alpha = state.layout.wide ? 1.0 : 0.86;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.20, r * 0.84, 0, 0, TAU);
  ctx.clip();

  ctx.strokeStyle = `rgb(${CYAN})`;
  ctx.globalAlpha = 0.06 * alpha;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.06, r * 0.67, 0.16, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.88, r * 0.50, 0.16, 0, TAU);
  ctx.stroke();

  ctx.globalAlpha = 0.075 * alpha;
  ctx.lineWidth = 0.55;
  const ext = 4;
  for (let k = -ext; k <= ext; k++) {
    ctx.beginPath();
    ctx.moveTo(k * vx - ext * ux, k * vy - ext * uy);
    ctx.lineTo(k * vx + ext * ux, k * vy + ext * uy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(k * ux - ext * vx, k * uy - ext * vy);
    ctx.lineTo(k * ux + ext * vx, k * uy + ext * vy);
    ctx.stroke();
  }

  ctx.globalAlpha = 0.14 * alpha;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  const corners = [
    [-0.5 * ux - 0.5 * vx, -0.5 * uy - 0.5 * vy],
    [0.5 * ux - 0.5 * vx, 0.5 * uy - 0.5 * vy],
    [0.5 * ux + 0.5 * vx, 0.5 * uy + 0.5 * vy],
    [-0.5 * ux + 0.5 * vx, -0.5 * uy + 0.5 * vy],
  ];
  corners.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.stroke();

  const su = frac(0.18 + t / DURATION * 2);
  const sv = frac(0.64 + t / DURATION * 3);
  const px = (su - 0.5) * ux + (sv - 0.5) * vx;
  const py = (su - 0.5) * uy + (sv - 0.5) * vy;

  for (let i = 1; i <= 6; i++) {
    const tu = frac(0.18 + (t - i * 0.45) / DURATION * 2);
    const tv = frac(0.64 + (t - i * 0.45) / DURATION * 3);
    const tx = (tu - 0.5) * ux + (tv - 0.5) * vx;
    const ty = (tu - 0.5) * uy + (tv - 0.5) * vy;
    ctx.globalAlpha = (0.05 - i * 0.006) * alpha;
    ctx.fillStyle = `rgb(${CYAN})`;
    ctx.beginPath();
    ctx.arc(tx, ty, 0.9, 0, TAU);
    ctx.fill();
  }

  ctx.globalAlpha = 0.18 * alpha;
  ctx.fillStyle = `rgb(${CYAN})`;
  ctx.beginPath();
  ctx.arc(px, py, 4.2, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = (0.52 + 0.12 * Math.sin(phase + 1.0)) * alpha;
  ctx.fillStyle = 'rgb(223,255,247)';
  ctx.beginPath();
  ctx.arc(px, py, 1.15, 0, TAU);
  ctx.fill();

  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  text(ctx, '\u2102 / \u039b', cx, cy - r * 1.17, 10.5, 0.30, CYAN, 'center');
  text(ctx, 'period lattice', cx, cy + r * 1.16, 9, 0.20, CYAN, 'center');
}

function drawLPanel(ctx, state, t) {
  const p = state.layout.lpanel;
  const ax = p.x;
  const ay = p.y + p.h * 0.52;
  const aw = p.w;
  const s1 = ax + aw * 0.52;
  const phase = TAU * t / DURATION;

  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgb(${CYAN})`;
  ctx.globalAlpha = 0.13;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax + aw, ay);
  ctx.stroke();

  ctx.globalAlpha = 0.10;
  for (let i = 1; i <= 6; i++) {
    const tx = ax + aw * (i / 7);
    ctx.beginPath();
    ctx.moveTo(tx, ay - 1.7);
    ctx.lineTo(tx, ay + 1.7);
    ctx.stroke();
  }

  ctx.setLineDash([2, 3.2]);
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = `rgb(${VIOLET})`;
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  ctx.moveTo(s1, ay - p.h * 0.35);
  ctx.lineTo(s1, ay + p.h * 0.24);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.globalAlpha = 0.17;
  ctx.strokeStyle = `rgb(${CYAN})`;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let i = 0; i <= 44; i++) {
    const u = i / 44;
    const sx = ax + aw * (0.08 + u * 0.84);
    const x = 0.58 + u * 0.84;
    const l = (x - 1) + 0.09 * (x - 1) * (x - 1) * (x - 1);
    const sy = ay - l * p.h * 0.72;
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  ctx.stroke();

  const pulse = 0.5 + 0.5 * Math.sin(phase + 0.4);
  ctx.globalAlpha = 0.28 + 0.08 * pulse;
  ctx.fillStyle = `rgb(${VIOLET})`;
  ctx.beginPath();
  ctx.arc(s1, ay, 2.4, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.016;
  ctx.beginPath();
  ctx.arc(s1, ay, 8 + 4 * pulse, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  text(ctx, 'L(E,s)', ax, p.y + p.h * 0.10, 10.5, 0.34, CYAN);
  text(ctx, 's = 1', s1 + 4, ay + p.h * 0.12, 9, 0.26, VIOLET);
  const lowerY = p.y + p.h * 0.80;
  text(ctx, 'ord_{s=1} L = r', ax, lowerY, 10, 0.36, INK);
  text(ctx, 'rank r = 1', ax + aw * 0.56, lowerY, 10, 0.36, AMBER);
  text(ctx, 'visual schematic', ax, p.y + p.h * 0.96, 8.5, 0.21, INK);
}

function chordLine(ctx, state, progress, alpha) {
  const l = state.layout;
  const ax = l.sP2;
  const bx = l.sR3;
  const ex = ax.x + (bx.x - ax.x) * progress;
  const ey = ax.y + (bx.y - ax.y) * progress;

  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgb(${VIOLET})`;
  ctx.globalAlpha = 0.09 * alpha;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(ax.x, ax.y);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.globalAlpha = 0.44 * alpha;
  ctx.lineWidth = 0.95;
  ctx.beginPath();
  ctx.moveTo(ax.x, ax.y);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function tangentLine(ctx, state, progress, alpha) {
  const l = state.layout;
  const ax = l.sTA;
  const bx = l.sTB;
  const ex = ax.x + (bx.x - ax.x) * progress;
  const ey = ax.y + (bx.y - ax.y) * progress;

  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgb(${VIOLET})`;
  ctx.globalAlpha = 0.085 * alpha;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(ax.x, ax.y);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.globalAlpha = 0.42 * alpha;
  ctx.lineWidth = 0.95;
  ctx.beginPath();
  ctx.moveTo(ax.x, ax.y);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function reflectLine(ctx, from, to, progress, alpha, unit) {
  const ey = from.y + (to.y - from.y) * progress;
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgb(${VIOLET})`;
  ctx.globalAlpha = 0.30 * alpha;
  ctx.lineWidth = 0.8;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(from.x, ey);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  if (progress > 0.3) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.2 * alpha;
    ctx.fillStyle = `rgb(${VIOLET})`;
    ctx.beginPath();
    ctx.arc(from.x, ey, 1.8 * unit, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

function drawConstruct(ctx, state, t, event) {
  const u = (t - event.start) / (event.end - event.start);
  if (u < 0 || u > 1) return;
  const alpha = smoothstep(0, 0.05, u) * (1 - smoothstep(0.82, 1, u));
  if (alpha <= 0.002) return;

  const l = state.layout;
  const unit = Math.min(state.width, state.height) / 720;
  const lineProgress = smoothstep(0, 0.16, u);
  const appear = smoothstep(0.10, 0.25, u);
  const reflectProgress = smoothstep(0.24, 0.52, u);
  const pulse = u > 0.48 && u < 0.82 ? Math.sin(Math.PI * clamp01((u - 0.48) / 0.34)) : 0;

  if (event.type === 'chord') {
    chordLine(ctx, state, lineProgress, alpha);
    if (appear > 0) {
      const sR = l.sR3;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.38 * appear * alpha;
      ctx.fillStyle = `rgb(${VIOLET})`;
      ctx.beginPath();
      ctx.arc(sR.x, sR.y, 2.2 * unit, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.12 * appear * alpha;
      ctx.beginPath();
      ctx.arc(sR.x, sR.y, (6 + 10 * appear) * unit, 0, TAU);
      ctx.strokeStyle = `rgb(${VIOLET})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      text(ctx, 'R = \u22123P', sR.x + 9 * unit, sR.y - 11 * unit, 10, 0.31 * appear * alpha, VIOLET);
    }
    if (u > 0.19) {
      const lx = (l.sP.x + l.sR3.x) / 2 - 7 * unit;
      const ly = (l.sP.y + l.sR3.y) / 2 - 14 * unit;
      text(ctx, 'P + 2P = 3P', lx, ly, 10.5, 0.35 * alpha, VIOLET);
    }
    reflectLine(ctx, l.sR3, l.sP3, reflectProgress, alpha, unit);
  } else {
    tangentLine(ctx, state, lineProgress, alpha);
    if (appear > 0) {
      const sR = l.sR2;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 * appear * alpha;
      ctx.fillStyle = `rgb(${VIOLET})`;
      ctx.beginPath();
      ctx.arc(sR.x, sR.y, 2.0 * unit, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    if (u > 0.18) {
      text(ctx, 'P + P = 2P', l.sP.x + 16 * unit, l.sP.y + 31 * unit, 10.5, 0.35 * alpha, VIOLET);
      text(ctx, 'tangent at P', l.sP.x + 16 * unit, l.sP.y + 44 * unit, 9, 0.23 * alpha, VIOLET);
    }
    reflectLine(ctx, l.sR2, l.sP2, reflectProgress, alpha, unit);
  }

  if (pulse > 0.01) {
    const target = event.type === 'chord' ? l.sP3 : l.sP2;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgb(${VIOLET})`;
    ctx.globalAlpha = 0.20 * pulse;
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.arc(target.x, target.y, (6 + 22 * pulse) * unit, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

function drawGhosts(ctx, state, t) {
  const l = state.layout;
  const fade = 1 - smoothstep(27.2, 29.7, t);
  if (fade <= 0.002) return;
  for (const e of EVENTS) {
    if (t <= e.end) continue;
    const ghost = 0.075 * fade;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgb(${VIOLET})`;
    ctx.globalAlpha = ghost;
    ctx.lineWidth = 0.7;
    if (e.type === 'chord') {
      ctx.beginPath();
      ctx.moveTo(l.sP2.x, l.sP2.y);
      ctx.lineTo(l.sR3.x, l.sR3.y);
      ctx.stroke();
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(l.sR3.x, l.sR3.y);
      ctx.lineTo(l.sP3.x, l.sP3.y);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.beginPath();
      ctx.moveTo(l.sTA.x, l.sTA.y);
      ctx.lineTo(l.sTB.x, l.sTB.y);
      ctx.stroke();
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(l.sR2.x, l.sR2.y);
      ctx.lineTo(l.sP2.x, l.sP2.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

function drawLeftCaption(ctx, state) {
  const { width: w, height: h } = state;
  const x = w * 0.045;
  text(ctx, 'E: y\u00b2 = x\u00b3 \u2212 2', x, h * 0.885, 11, 0.28, CYAN);
  text(ctx, 'P = (3, 5) \u2208 E(\u211a)', x, h * 0.885 + 14, 9.5, 0.22, INK);
  text(ctx, 'BSD', x, h * 0.925, 9, 0.16, VIOLET);
}

function draw(state, t) {
  const { ctx } = state;

  drawBackground(ctx, state, t);
  drawCurve(ctx, state, t);
  drawGhosts(ctx, state, t);

  for (const e of EVENTS) drawConstruct(ctx, state, t, e);

  drawTorus(ctx, state, t);
  drawLPanel(ctx, state, t);
  drawRationalStars(ctx, state, t);
  drawLeftCaption(ctx, state);

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function buildScene(state) {
  const layout = computeLayout(state.width, state.height);
  state.layout = layout;
  state.curvePath = buildCurvePath(layout);
  const axisPaths = buildAxisPaths(layout);
  state.axisPath = axisPaths.axis;
  state.tickPath = axisPaths.ticks;

  const { ctx, width, height } = state;
  const cx = width * (layout.wide ? 0.47 : 0.55);
  const cy = height * 0.47;
  const radius = Math.min(height * 0.46, width * 0.30);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  g.addColorStop(0, 'rgba(13,44,50,0.34)');
  g.addColorStop(0.38, 'rgba(8,23,29,0.10)');
  g.addColorStop(1, 'rgba(5,7,10,0)');
  state.bgGlow = g;
  state.bgGlowRect = { x: cx - radius, y: cy - radius, w: radius * 2, h: radius * 2 };
}

createWallpaper({
  duration: DURATION,
  fps: 30,
  context: '2d',
  background: BG,
  setup(state) {
    buildScene(state);
  },
  draw(state, t) {
    draw(state, t);
  },
  onResize(state) {
    buildScene(state);
  },
});
