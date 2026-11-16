import { createWallpaper } from '../../shared/wallpaper.js';

const DURATION = 30;
const EVENT_START = 0.9;
const EVENT_INTERVAL = 1.65;
const MORPH_TIME = 0.55;
const FLASH_TIME = 0.5;
const FADE_START = 28;
const BASE_ALPHA = 0.52;
const VISUAL_CHECKPOINTS = [
  0, 2, 4, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
];

const CYAN = '126,240,212';
const AMBER = '240,198,116';
const VIOLET = '200,162,255';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (v) => {
  const u = clamp(v, 0, 1);
  return u * u * (3 - 2 * u);
};

let dataPromise;

function loadData() {
  if (!dataPromise) {
    dataPromise = fetch(new URL('./data.json', import.meta.url), {
      cache: 'force-cache',
    }).then((response) => {
      if (!response.ok) throw new Error(`data.json ${response.status}`);
      return response.json();
    });
  }
  return dataPromise;
}

function makeEdgeSet(tour, n) {
  const edges = new Int32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const a = tour[i];
    const b = tour[(i + 1) % n];
    if (a < b) {
      edges[i * 2] = a;
      edges[i * 2 + 1] = b;
    } else {
      edges[i * 2] = b;
      edges[i * 2 + 1] = a;
    }
  }
  return edges;
}

function edgeKey(a, b, n) {
  return a < b ? a * n + b : b * n + a;
}

function makeTransition(edgesA, edgesB, n, points) {
  const inA = new Map();
  const inB = new Map();
  for (let i = 0; i < edgesA.length; i += 2) {
    inA.set(edgeKey(edgesA[i], edgesA[i + 1], n), i);
  }
  for (let i = 0; i < edgesB.length; i += 2) {
    inB.set(edgeKey(edgesB[i], edgesB[i + 1], n), i);
  }

  const stable = [];
  const removed = [];
  const added = [];
  for (let i = 0; i < edgesA.length; i += 2) {
    const key = edgeKey(edgesA[i], edgesA[i + 1], n);
    if (inB.has(key)) stable.push(edgesA[i], edgesA[i + 1]);
    else removed.push([edgesA[i], edgesA[i + 1]]);
  }
  for (let i = 0; i < edgesB.length; i += 2) {
    const key = edgeKey(edgesB[i], edgesB[i + 1], n);
    if (!inA.has(key)) added.push([edgesB[i], edgesB[i + 1]]);
  }

  const used = new Uint8Array(added.length);
  const oldA = [];
  const oldB = [];
  const newA = [];
  const newB = [];
  const oldLeft = [];
  const newLeft = [];

  const mid = (edge) => [
    (points[edge[0]][0] + points[edge[1]][0]) * 0.5,
    (points[edge[0]][1] + points[edge[1]][1]) * 0.5,
  ];

  for (const edge of removed) {
    let best = -1;
    let bestShare = false;
    let bestDist = Infinity;
    for (let j = 0; j < added.length; j++) {
      if (used[j]) continue;
      const candidate = added[j];
      const share =
        candidate[0] === edge[0] ||
        candidate[0] === edge[1] ||
        candidate[1] === edge[0] ||
        candidate[1] === edge[1];
      const ma = mid(edge);
      const mb = mid(candidate);
      const dist =
        (ma[0] - mb[0]) * (ma[0] - mb[0]) +
        (ma[1] - mb[1]) * (ma[1] - mb[1]);
      if (
        best < 0 ||
        (share && !bestShare) ||
        (share === bestShare && dist < bestDist)
      ) {
        best = j;
        bestShare = share;
        bestDist = dist;
      }
    }
    if (best < 0) {
      oldLeft.push(edge[0], edge[1]);
    } else {
      used[best] = 1;
      oldA.push(edge[0]);
      oldB.push(edge[1]);
      newA.push(added[best][0]);
      newB.push(added[best][1]);
    }
  }

  for (let j = 0; j < added.length; j++) {
    if (!used[j]) newLeft.push(added[j][0], added[j][1]);
  }

  let nodeX = 0.5;
  let nodeY = 0.5;
  const allNew = new Int32Array(newA.length * 2 + newLeft.length);
  for (let i = 0; i < newA.length; i++) {
    allNew[i * 2] = newA[i];
    allNew[i * 2 + 1] = newB[i];
  }
  for (let i = 0; i < newLeft.length; i++) {
    allNew[newA.length * 2 + i] = newLeft[i];
  }
  if (added.length) {
    let mx = 0;
    let my = 0;
    for (const edge of added) {
      const m = mid(edge);
      mx += m[0];
      my += m[1];
    }
    mx /= added.length;
    my /= added.length;
    let closest = Infinity;
    for (const edge of added) {
      const m = mid(edge);
      const d = (m[0] - mx) * (m[0] - mx) + (m[1] - my) * (m[1] - my);
      if (d < closest) {
        closest = d;
        nodeX = m[0];
        nodeY = m[1];
      }
    }
  }

  return {
    stable: new Int32Array(stable),
    count: oldA.length,
    oldA: new Int32Array(oldA),
    oldB: new Int32Array(oldB),
    newA: new Int32Array(newA),
    newB: new Int32Array(newB),
    oldLeft: new Int32Array(oldLeft),
    newLeft: new Int32Array(newLeft),
    allNew,
    nodeX,
    nodeY,
  };
}

function makeView(state) {
  const { ctx, width: w, height: h, data } = state;
  const wide = w / h > 2.0;
  const left = (wide ? 0.22 : 0.23) * w;
  const right = (wide ? 0.83 : 0.825) * w;
  const top = (wide ? 0.14 : 0.15) * h;
  const bottom = (wide ? 0.86 : 0.85) * h;

  const g0 = (data.initialLength - data.lowerBound) / data.lowerBound;
  const gapMax = Math.max(1.0, Math.ceil(g0 * 10) / 10 + 0.15);
  const gapMin = 0.1;
  const gapTicks = [5, 3, 2, 1, 0.5, 0.2, 0.1].filter(
    (value) => value <= gapMax * 0.985 && value >= gapMin
  );

  const bgGlow = ctx.createRadialGradient(
    (left + right) * 0.5,
    (top + bottom) * 0.5,
    0,
    (left + right) * 0.5,
    (top + bottom) * 0.5,
    Math.max(w, h) * 0.58
  );
  bgGlow.addColorStop(0, 'rgba(20,54,62,0.13)');
  bgGlow.addColorStop(0.42, 'rgba(8,24,31,0.05)');
  bgGlow.addColorStop(1, 'rgba(5,7,10,0)');

  const vignette = ctx.createRadialGradient(
    w * 0.55,
    h * 0.5,
    Math.min(w, h) * 0.3,
    w * 0.55,
    h * 0.5,
    Math.max(w, h) * 0.75
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.28)');

  return {
    w,
    h,
    left,
    right,
    top,
    bottom,
    cx: (left + right) * 0.5,
    cy: (top + bottom) * 0.5,
    innerW: right - left,
    innerH: bottom - top,
    mapW: right - left,
    mapH: bottom - top,
    rulerX: (wide ? 0.88 : 0.866) * w,
    rulerTop: 0.18 * h,
    rulerBottom: 0.85 * h,
    rulerAmp: clamp(w * 0.0045, 5, 11),
    gapMin,
    gapMax,
    gapTicks,
    lineW: clamp(w * 0.00055, 0.8, 1.4),
    cityR: clamp(w * 0.00058, 0.85, 1.6),
    fontMain: clamp(w * 0.0082, 9, 13),
    fontSmall: clamp(w * 0.006, 7.5, 9.5),
    fontNumeric: clamp(w * 0.0075, 9, 11.5),
    bgGlow,
    vignette,
    px: new Float32Array(data.n),
    py: new Float32Array(data.n),
  };
}

function cameraAt(view, t) {
  const phase = (t / DURATION) * Math.PI * 2;
  return {
    zoom: 1 + 0.01 * Math.sin(phase * 2 + 0.7),
    dx:
      view.mapW *
      (0.006 * Math.sin(phase + 0.4) + 0.0025 * Math.sin(phase * 3 + 1.3)),
    dy: view.mapH * 0.005 * Math.sin(phase * 2 + 2.1),
    cos: Math.cos(0.0035 * Math.sin(phase * 2 + 0.4)),
    sin: Math.sin(0.0035 * Math.sin(phase * 2 + 0.4)),
  };
}

function projectPoints(view, data, cam) {
  const px = view.px;
  const py = view.py;
  const { innerW, innerH, cx, cy } = view;
  const { zoom, dx, dy, cos, sin } = cam;
  for (let i = 0; i < data.n; i++) {
    const x = (data.points[i][0] - 0.5) * innerW * zoom;
    const y = (data.points[i][1] - 0.5) * innerH * zoom;
    px[i] = cx + x * cos - y * sin + dx;
    py[i] = cy + x * sin + y * cos + dy;
  }
}

function mapNorm(view, cam, nx, ny) {
  const x = (nx - 0.5) * view.innerW * cam.zoom;
  const y = (ny - 0.5) * view.innerH * cam.zoom;
  return {
    x: view.cx + x * cam.cos - y * cam.sin + cam.dx,
    y: view.cy + x * cam.sin + y * cam.cos + cam.dy,
  };
}

function frameAt(state, t) {
  const lengths = state.stateLengths;
  const finalIndex = lengths.length - 1;

  if (t >= FADE_START) {
    const fade = smooth((t - FADE_START) / (DURATION - FADE_START));
    return {
      fade,
      morph: false,
      index: finalIndex,
      length:
        lengths[finalIndex] +
        (lengths[0] - lengths[finalIndex]) * fade,
    };
  }

  const rel = t - EVENT_START;
  if (rel < 0) {
    return { fade: 0, morph: false, index: 0, length: lengths[0] };
  }

  const k = Math.floor(rel / EVENT_INTERVAL);
  if (k >= state.events) {
    return { fade: 0, morph: false, index: finalIndex, length: lengths[finalIndex] };
  }

  const start = EVENT_START + k * EVENT_INTERVAL;
  const u = (t - start) / MORPH_TIME;
  if (u < 1) {
    const e = smooth(u);
    return {
      fade: 0,
      morph: true,
      index: k,
      e,
      length:
        lengths[k] + (lengths[k + 1] - lengths[k]) * e,
    };
  }

  const after = t - (start + MORPH_TIME);
  if (after < FLASH_TIME) {
    return {
      fade: 0,
      morph: false,
      index: k + 1,
      length: lengths[k + 1],
      flash: 1 - smooth(after / FLASH_TIME),
      flashIndex: k,
    };
  }

  return { fade: 0, morph: false, index: k + 1, length: lengths[k + 1] };
}

function drawBackground(ctx, view) {
  ctx.fillStyle = '#05070a';
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.fillStyle = view.bgGlow;
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.fillStyle = view.vignette;
  ctx.fillRect(0, 0, view.w, view.h);
}

function drawGrid(ctx, view, cam) {
  ctx.beginPath();
  for (let i = 0; i <= 8; i++) {
    const nx = i / 8;
    const a = mapNorm(view, cam, nx, 0);
    const b = mapNorm(view, cam, nx, 1);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  for (let i = 0; i <= 6; i++) {
    const ny = i / 6;
    const a = mapNorm(view, cam, 0, ny);
    const b = mapNorm(view, cam, 1, ny);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.strokeStyle = 'rgba(74,128,140,0.055)';
  ctx.lineWidth = 0.7;
  ctx.stroke();
}

function drawEdges(ctx, view, edges, alpha, width) {
  if (!edges || edges.length === 0 || alpha <= 0.002) return;
  ctx.beginPath();
  for (let i = 0; i < edges.length; i += 2) {
    const a = edges[i];
    const b = edges[i + 1];
    ctx.moveTo(view.px[a], view.py[a]);
    ctx.lineTo(view.px[b], view.py[b]);
  }
  ctx.lineWidth = width * 7;
  ctx.strokeStyle = `rgba(${CYAN},${(alpha * 0.022).toFixed(3)})`;
  ctx.stroke();
  ctx.lineWidth = width * 3.2;
  ctx.strokeStyle = `rgba(${CYAN},${(alpha * 0.09).toFixed(3)})`;
  ctx.stroke();
  ctx.lineWidth = width;
  ctx.strokeStyle = `rgba(${CYAN},${alpha.toFixed(3)})`;
  ctx.stroke();
}

function drawOverlay(ctx, view, edges, alpha, width) {
  if (!edges || edges.length === 0 || alpha <= 0.004) return;
  ctx.beginPath();
  for (let i = 0; i < edges.length; i += 2) {
    const a = edges[i];
    const b = edges[i + 1];
    ctx.moveTo(view.px[a], view.py[a]);
    ctx.lineTo(view.px[b], view.py[b]);
  }
  ctx.lineWidth = width * 2.2;
  ctx.strokeStyle = `rgba(190,255,238,${alpha.toFixed(3)})`;
  ctx.stroke();
}

function drawPairEdges(ctx, view, a, b, alpha, width) {
  if (!a || a.length === 0 || alpha <= 0.002) return;
  const px = view.px;
  const py = view.py;
  ctx.beginPath();
  for (let i = 0; i < a.length; i++) {
    const p = a[i];
    const q = b[i];
    if (p === q) continue;
    ctx.moveTo(px[p], py[p]);
    ctx.lineTo(px[q], py[q]);
  }
  ctx.lineWidth = width * 7;
  ctx.strokeStyle = `rgba(${CYAN},${(alpha * 0.022).toFixed(3)})`;
  ctx.stroke();
  ctx.lineWidth = width * 3.2;
  ctx.strokeStyle = `rgba(${CYAN},${(alpha * 0.09).toFixed(3)})`;
  ctx.stroke();
  ctx.lineWidth = width;
  ctx.strokeStyle = `rgba(${CYAN},${alpha.toFixed(3)})`;
  ctx.stroke();
}

function drawCities(ctx, view, state) {
  const px = view.px;
  const py = view.py;
  ctx.fillStyle = `rgba(${AMBER},0.75)`;
  ctx.beginPath();
  for (let i = 0; i < state.data.n; i++) {
    const r = view.cityR * state.cityScale[i];
    ctx.rect(px[i] - r, py[i] - r, r * 2, r * 2);
  }
  ctx.fill();
}

function rulerGeometry(view, u) {
  const y = view.rulerBottom - u * (view.rulerBottom - view.rulerTop);
  const x = view.rulerX - view.rulerAmp * Math.sin(Math.PI * u);
  return { x, y };
}

function gapU(view, gap) {
  const g = clamp(gap, view.gapMin, view.gapMax);
  return (
    Math.log(g / view.gapMin) / Math.log(view.gapMax / view.gapMin)
  );
}

function drawRuler(ctx, view, gap) {
  const uNow = clamp(gapU(view, gap), 0, 1);
  const top = rulerGeometry(view, 1);
  const bottom = rulerGeometry(view, 0);

  ctx.beginPath();
  for (let i = 0; i <= 24; i++) {
    const p = rulerGeometry(view, i / 24);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = `rgba(${CYAN},0.1)`;
  ctx.lineWidth = 0.75;
  ctx.stroke();

  if (uNow > 0.004) {
    const steps = Math.max(2, Math.round(24 * uNow));
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const u = (i / steps) * uNow;
      const p = rulerGeometry(view, u);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = `rgba(${CYAN},0.16)`;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  ctx.font = `${view.fontSmall}px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'right';

  for (const value of view.gapTicks) {
    const u = clamp(gapU(view, value), 0, 1);
    const p = rulerGeometry(view, u);
    ctx.beginPath();
    ctx.moveTo(p.x - 3.5, p.y);
    ctx.lineTo(p.x + 3.5, p.y);
    ctx.strokeStyle = `rgba(190,224,224,0.17)`;
    ctx.lineWidth = 0.7;
    ctx.stroke();
    ctx.fillStyle = `rgba(190,224,224,0.28)`;
    ctx.fillText(`${Math.round(value * 100)}%`, p.x - 7, p.y + view.fontSmall * 0.35);
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = `rgba(${CYAN},0.34)`;
  ctx.font = `${view.fontMain}px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`;
  ctx.fillText('gap', top.x, top.y - view.fontSmall * 1.3);

  ctx.textAlign = 'left';
  const marker = rulerGeometry(view, uNow);
  ctx.fillStyle = `rgba(${CYAN},0.36)`;
  ctx.font = `${view.fontNumeric}px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`;
  ctx.fillText(`${Math.round(gap * 100)}%`, marker.x + 13, marker.y + view.fontNumeric * 0.35);

  ctx.fillStyle = `rgba(${CYAN},0.8)`;
  ctx.beginPath();
  ctx.arc(marker.x, marker.y, clamp(view.fontNumeric * 0.18, 1.2, 2), 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.font = `${view.fontSmall}px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`;
  ctx.fillStyle = `rgba(${AMBER},0.27)`;
  ctx.fillText('MST lower bound', bottom.x, bottom.y + view.fontSmall * 1.7);
}

function drawNode(ctx, view, cam, tr, e) {
  const flash = Math.sin(Math.PI * e);
  if (flash < 0.02) return;
  const p = mapNorm(view, cam, tr.nodeX, tr.nodeY);
  ctx.fillStyle = `rgba(${VIOLET},${(0.4 * flash).toFixed(3)})`;
  ctx.beginPath();
  ctx.arc(p.x, p.y, clamp(view.cityR * 2.1, 2, 3.4), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(235,222,255,${(0.24 * flash).toFixed(3)})`;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 1, 0, Math.PI * 2);
  ctx.fill();
}

function drawLabels(ctx, view, state) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `${view.fontMain}px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`;
  ctx.fillStyle = 'rgba(198,228,226,0.32)';
  ctx.fillText('TSP · 2-opt', view.w * 0.028, view.h * 0.072);
  ctx.font = `${view.fontSmall}px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`;
  ctx.fillStyle = 'rgba(198,228,226,0.26)';
  ctx.fillText(`n = ${state.data.n}`, view.w * 0.028, view.h * 0.072 + view.fontMain * 1.7);
}

function draw(state, t) {
  const { ctx, width, height } = state;
  if (!state.view || state.view.w !== width || state.view.h !== height) {
    state.view = makeView(state);
  }
  const view = state.view;
  const data = state.data;
  const frame = frameAt(state, t);
  const cam = cameraAt(view, t);

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  drawBackground(ctx, view);
  drawGrid(ctx, view, cam);
  projectPoints(view, data, cam);

  if (frame.fade > 0) {
    const f = frame.fade;
    drawEdges(ctx, view, state.states[state.states.length - 1], BASE_ALPHA * (1 - f), view.lineW);
    drawEdges(ctx, view, state.states[0], BASE_ALPHA * f, view.lineW);
  } else if (frame.morph) {
    const tr = state.transitions[frame.index];
    const e = frame.e;
    drawEdges(ctx, view, tr.stable, BASE_ALPHA, view.lineW);
    drawPairEdges(ctx, view, tr.oldA, tr.oldB, BASE_ALPHA * (1 - e), view.lineW);
    drawEdges(ctx, view, tr.oldLeft, BASE_ALPHA * (1 - e), view.lineW);
    drawPairEdges(ctx, view, tr.newA, tr.newB, BASE_ALPHA * e, view.lineW);
    drawEdges(ctx, view, tr.newLeft, BASE_ALPHA * e, view.lineW);
  } else {
    drawEdges(ctx, view, state.states[frame.index], BASE_ALPHA, view.lineW);
  }

  if (frame.flash > 0) {
    drawOverlay(
      ctx,
      view,
      state.transitions[frame.flashIndex].allNew,
      0.15 * frame.flash,
      view.lineW
    );
  }

  drawCities(ctx, view, state);

  if (frame.morph) {
    drawNode(ctx, view, cam, state.transitions[frame.index], frame.e);
  }

  drawRuler(
    ctx,
    view,
    (frame.length - data.lowerBound) / data.lowerBound
  );
  drawLabels(ctx, view, state);
}

async function setup(state) {
  const data = await loadData();
  const n = data.n;
  state.data = data;
  state.events = data.checkpoints.length - 1;
  state.edgeSets = data.checkpoints.map((cp) => makeEdgeSet(cp.tour, n));
  const indices = VISUAL_CHECKPOINTS.filter((i) => i < state.edgeSets.length);
  state.states = indices.map((i) => state.edgeSets[i]);
  state.stateLengths = indices.map((i) => data.checkpoints[i].length);
  state.events = state.states.length - 1;
  state.transitions = [];
  for (let i = 0; i < state.events; i++) {
    state.transitions.push(
      makeTransition(state.states[i], state.states[i + 1], n, data.points)
    );
  }
  state.cityScale = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const hash = Math.sin(i * 12.9898 + data.seed * 0.001) * 43758.5453;
    state.cityScale[i] = 0.78 + 0.35 * (hash - Math.floor(hash));
  }
  state.view = makeView(state);
}

createWallpaper({
  duration: DURATION,
  fps: 30,
  context: '2d',
  background: '#05070a',
  setup,
  draw,
  onResize(state) {
    if (state.data) state.view = makeView(state);
  },
});
