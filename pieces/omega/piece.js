import { createWallpaper } from '../../shared/wallpaper.js';

const DURATION = 40;
const FPS = 30;
const BUDGET = 2400;
const STATIONS = 18;
const TAPE_LEN = 36;
const VIEW_OFFSET = 3;
const VIEW_CELLS = 30;
const MAX_FRAMES = 22;

const COL = {
  bg: '#05070a',
  cyan: '#7ef0d4',
  amber: '#f0c674',
  violet: '#c8a2ff',
};
const RGB = {
  cyan: [126, 240, 212],
  amber: [240, 198, 116],
  violet: [200, 162, 255],
  slate: [122, 146, 156],
};
const MONO = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, "DejaVu Sans Mono", monospace';

// A fixed, illustrative 64-bit window. Only the leading prefix is determined by the enumeration below.
const OMEGA_BITS = '1101000010000001110001001101001000100011110101011111110011000010';

// 18 small machines in scan order. Rules are [write, move, nextState], -1 = halt.
// Initial tapes are 36 cells with the head at index 18.
const MACHINE_DEFS = [
  { rules: [[[1, 1, 0], [0, -1, -1]], [[1, 1, 0], [0, -1, 1]]], tape: '000000000000000001001010000000000000' },
  { rules: [[[0, 1, 0], [1, -1, 0]], [[1, -1, 1], [1, -1, 0]]], tape: '000000000000010011101001000000000000' },
  { rules: [[[1, -1, -1], [0, -1, 0]], [[1, -1, 0], [1, -1, 0]]], tape: '000000000000111111101010110000000000' },
  { rules: [[[0, 1, 2], [0, 1, 2]], [[0, -1, -1], [0, 1, 2]], [[0, -1, 0], [0, 1, 1]]], tape: '000000000000000001101010000000000000' },
  { rules: [[[1, -1, 0], [0, -1, 1]], [[0, 1, -1], [1, 1, 0]]], tape: '000000000000011111100000000000000000' },
  { rules: [[[1, -1, 3], [1, 1, 3]], [[0, 1, 2], [0, -1, 2]], [[0, 1, 3], [1, 1, 3]], [[0, -1, 2], [0, 1, 1]]], tape: '000000000000000000100100110000000000' },
  { rules: [[[1, 1, 1], [1, 1, -1]], [[0, 1, 2], [1, 1, 1]], [[1, -1, 2], [1, -1, 0]]], tape: '000000000000000000000000000000000000' },
  { rules: [[[0, -1, 1], [1, 1, 1]], [[0, -1, 1], [1, -1, 0]]], tape: '000000000000101101110100000000000000' },
  { rules: [[[1, -1, -1], [1, -1, 1]], [[0, -1, 2], [1, 1, 1]], [[1, 1, 0], [0, 1, 2]]], tape: '000000000000000001111010101011000000' },
  { rules: [[[0, -1, 1], [0, -1, 2]], [[0, -1, 0], [1, 1, 0]], [[1, -1, 0], [1, -1, -1]]], tape: '000000000000010101000000000000000000' },
  { rules: [[[1, -1, 1], [0, 1, 3]], [[0, 1, 3], [0, 1, -1]], [[0, -1, 0], [1, 1, 0]], [[1, -1, 2], [1, 1, 3]]], tape: '000000000000000000000000000000000000' },
  { rules: [[[0, -1, 2], [1, 1, 1]], [[0, 1, 3], [0, 1, 1]], [[1, 1, 0], [1, -1, 1]], [[0, -1, 0], [1, -1, 1]]], tape: '000000000000011101101101001100000000' },
  { rules: [[[0, -1, 2], [1, -1, 3]], [[0, 1, 4], [1, -1, 0]], [[1, 1, 1], [1, -1, 1]], [[1, 1, 3], [0, -1, 4]], [[1, 1, -1], [1, 1, 1]]], tape: '000000000000001111111110011110000000' },
  { rules: [[[0, -1, 4], [1, 1, 4]], [[1, -1, 4], [0, 1, 1]], [[0, -1, 4], [0, -1, 0]], [[0, -1, 4], [1, 1, 0]], [[0, 1, 3], [0, 1, 0]]], tape: '000000000000100100111000000000000000' },
  { rules: [[[0, -1, -1], [0, -1, 1]], [[1, -1, 2], [0, 1, 0]], [[1, -1, 3], [1, 1, 2]], [[0, 1, 2], [1, 1, 1]]], tape: '000000000000000000111111100110100000' },
  { rules: [[[1, -1, 4], [1, 1, 3]], [[0, 1, 4], [0, 1, 1]], [[1, -1, 2], [0, 1, 1]], [[0, -1, 3], [1, -1, 2]], [[0, -1, 1], [1, -1, 0]]], tape: '000000000000001000111001100100000000' },
  { rules: [[[1, -1, 2], [0, -1, 0]], [[1, -1, -1], [1, 1, 0]], [[0, 1, 2], [1, 1, 1]], [[0, -1, 1], [1, -1, 0]]], tape: '000000000001010111101010100000000000' },
  { rules: [[[1, 1, 1], [1, -1, 1]], [[1, -1, 0], [0, -1, 2]], [[1, 1, -1], [1, -1, 3]], [[1, 1, 3], [0, 1, 0]]], tape: '000000000000000000000000000000000000' },
];

// BB(5) champion (Marxen–Buntrock table, S = 47,176,870). We only need a short
// visible window of its tape; the reported total is the known champion value.
const BB5_RULES = [
  [[1, 1, 1], [1, -1, 2]],
  [[1, 1, 2], [1, 1, 1]],
  [[1, 1, 3], [0, -1, 4]],
  [[1, -1, 0], [1, -1, 3]],
  [[1, 1, -1], [0, -1, 0]],
];
const BB5_STEPS = 47176870;

function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function mod(x, n) {
  return ((x % n) + n) % n;
}

function wrapSigned(x, n) {
  return mod(x + n / 2, n) - n / 2;
}

function rgba(rgb, alpha) {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

function mulberry32(a) {
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function formatNumber(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function roundedRect(g, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.lineTo(x + w - rr, y);
  g.quadraticCurveTo(x + w, y, x + w, y + rr);
  g.lineTo(x + w, y + h - rr);
  g.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  g.lineTo(x + rr, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - rr);
  g.lineTo(x, y + rr);
  g.quadraticCurveTo(x, y, x + rr, y);
  g.closePath();
}

function snapshotTape(tape, head, state) {
  const bits = new Uint8Array(VIEW_CELLS);
  for (let i = 0; i < VIEW_CELLS; i++) bits[i] = tape[VIEW_OFFSET + i];
  return { bits, head: head - VIEW_OFFSET, state };
}

function simulateMachine(def) {
  const tape = new Uint8Array(TAPE_LEN);
  for (let i = 0; i < TAPE_LEN; i++) tape[i] = def.tape.charCodeAt(i) === 49 ? 1 : 0;
  let head = 18;
  let state = 0;
  let halted = false;
  let haltStep = 0;
  const frames = [];
  const capture = () => {
    frames.push(snapshotTape(tape, head, state));
    if (frames.length > MAX_FRAMES) frames.shift();
  };

  capture();
  for (let step = 1; step <= BUDGET; step++) {
    if (head < 0 || head >= TAPE_LEN) break;
    const rule = def.rules[state] && def.rules[state][tape[head]];
    if (!rule) break;
    tape[head] = rule[0];
    head += rule[1];
    if (head < 0 || head >= TAPE_LEN) break;
    if (rule[2] < 0) {
      state = -1;
      halted = true;
      haltStep = step;
      capture();
      break;
    }
    state = rule[2];
    capture();
  }
  return { frames, halted, haltStep };
}

function simulateBB5() {
  const tape = new Uint8Array(TAPE_LEN);
  let head = 18;
  let state = 0;
  const frames = [];
  for (let step = 0; step < 60; step++) {
    if (step % 2 === 0) frames.push(snapshotTape(tape, head, state));
    const rule = BB5_RULES[state][tape[head]];
    if (!rule || head < 2 || head > TAPE_LEN - 3) break;
    tape[head] = rule[0];
    head += rule[1];
    if (rule[2] < 0) break;
    state = rule[2];
  }
  return frames;
}

const BB5_FRAMES = simulateBB5();

const MACHINES = MACHINE_DEFS.map(simulateMachine);
let prefixLength = 0;
for (const machine of MACHINES) {
  if (machine.halted) {
    machine.bitIndex = prefixLength;
    machine.bitValue = OMEGA_BITS[prefixLength];
    prefixLength++;
  }
}

function computeLayout(width, height) {
  const aspect = width / height;
  const superwide = aspect > 2.05;
  const x0 = width * (superwide ? 0.225 : 0.235);
  const x1 = width * 0.968;
  const y0 = height * 0.145;
  const y1 = height * 0.945;
  const rows = height >= 1000 ? 6 : 5;
  const targetTileW = superwide
    ? clamp(width / 18, 132, 175)
    : clamp(width / 14, 100, 190);
  const cols = clamp(Math.round((x1 - x0) / targetTileW), 8, superwide ? 13 : 10);
  const gap = clamp((x1 - x0) / cols * 0.075, 5, superwide ? 11 : 14);
  const tileW = ((x1 - x0) - gap * (cols - 1)) / cols;
  const tileH = ((y1 - y0) - gap * (rows - 1)) / rows;
  return { width, height, aspect, superwide, x0, x1, y0, y1, rows, cols, gap, tileW, tileH };
}

function stationRowCounts(rows) {
  if (rows >= 6) return [3, 3, 3, 3, 3, 3];
  if (rows === 5) return [4, 4, 4, 3, 3];
  const base = Math.floor(STATIONS / rows);
  const extra = STATIONS - base * rows;
  return Array.from({ length: rows }, (_, i) => base + (i < extra ? 1 : 0));
}

function stationCells(layout) {
  const counts = stationRowCounts(layout.rows);
  const cells = [];
  let index = 0;
  for (let r = 0; r < layout.rows; r++) {
    const k = counts[r];
    const row = [];
    for (let j = 0; j < k; j++) {
      const c = k === 1
        ? Math.floor((layout.cols - 1) / 2)
        : Math.round((j * (layout.cols - 1)) / (k - 1));
      row.push({ r, c });
    }
    if (r % 2 === 1) row.reverse();
    for (const cell of row) {
      cell.index = index++;
      cells.push(cell);
    }
  }
  return cells;
}

function chooseBB5Cell(layout, cells) {
  const occupied = new Set(cells.map((cell) => `${cell.r}:${cell.c}`));
  const targetR = Math.floor((layout.rows - 1) * 0.5);
  const targetC = Math.round((layout.cols - 1) * 0.64);
  let best = { r: targetR, c: targetC };
  let bestD = Infinity;
  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.cols; c++) {
      if (occupied.has(`${r}:${c}`)) continue;
      const d = (r - targetR) * (r - targetR) * 0.8 + (c - targetC) * (c - targetC);
      if (d < bestD) {
        bestD = d;
        best = { r, c };
      }
    }
  }
  return best;
}

function drawBackground(g, width, height) {
  g.fillStyle = COL.bg;
  g.fillRect(0, 0, width, height);

  const glow = g.createRadialGradient(
    width * 0.72, height * 0.26, 0,
    width * 0.72, height * 0.26, Math.max(width, height) * 0.72
  );
  glow.addColorStop(0, 'rgba(28,48,54,0.16)');
  glow.addColorStop(0.45, 'rgba(12,22,27,0.06)');
  glow.addColorStop(1, 'rgba(5,7,10,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, width, height);

  const left = g.createLinearGradient(0, 0, width * 0.36, 0);
  left.addColorStop(0, 'rgba(2,4,7,0.42)');
  left.addColorStop(1, 'rgba(2,4,7,0)');
  g.fillStyle = left;
  g.fillRect(0, 0, width * 0.36, height);

  const quiet = g.createRadialGradient(
    width * 0.17, height * 0.56, 0,
    width * 0.17, height * 0.56, width * 0.32
  );
  quiet.addColorStop(0, 'rgba(24,44,50,0.055)');
  quiet.addColorStop(0.6, 'rgba(12,24,28,0.025)');
  quiet.addColorStop(1, 'rgba(5,7,10,0)');
  g.fillStyle = quiet;
  g.fillRect(0, 0, width * 0.5, height);

  const vignette = g.createRadialGradient(
    width * 0.63, height * 0.5, Math.min(width, height) * 0.24,
    width * 0.63, height * 0.5, Math.max(width, height) * 0.82
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(0.72, 'rgba(0,0,0,0.12)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.38)');
  g.fillStyle = vignette;
  g.fillRect(0, 0, width, height);

  const rng = mulberry32(4717);
  for (let i = 0; i < 150; i++) {
    const x = rng() * width;
    const y = rng() * height;
    const a = 0.012 + rng() * 0.045;
    const s = 0.5 + rng() * 0.9;
    g.fillStyle = rgba(RGB.cyan, a);
    g.fillRect(x, y, s, s);
  }
}

function drawWallWash(g, layout) {
  const grad = g.createLinearGradient(layout.x0, 0, layout.x1, 0);
  grad.addColorStop(0, 'rgba(16,31,36,0)');
  grad.addColorStop(0.12, 'rgba(16,31,36,0.06)');
  grad.addColorStop(0.55, 'rgba(18,35,40,0.085)');
  grad.addColorStop(1, 'rgba(18,35,40,0.025)');
  g.fillStyle = grad;
  g.fillRect(layout.x0, layout.y0 - 26, layout.x1 - layout.x0, layout.y1 - layout.y0 + 52);
}

function drawWallBrackets(g, layout) {
  const len = Math.min(34, layout.tileW * 0.4);
  g.strokeStyle = rgba(RGB.cyan, 0.05);
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(layout.x0 - 13, layout.y0 - 15);
  g.lineTo(layout.x0 - 13 + len, layout.y0 - 15);
  g.moveTo(layout.x0 - 13, layout.y0 - 15);
  g.lineTo(layout.x0 - 13, layout.y0 - 15 + len * 0.7);
  g.moveTo(layout.x1 + 8, layout.y1 + 14);
  g.lineTo(layout.x1 + 8 - len, layout.y1 + 14);
  g.moveTo(layout.x1 + 8, layout.y1 + 14);
  g.lineTo(layout.x1 + 8, layout.y1 + 14 - len * 0.7);
  g.stroke();
}

function drawTileBase(g, tile) {
  const r = Math.min(tile.w, tile.h) * 0.08;
  roundedRect(g, tile.x, tile.y, tile.w, tile.h, r);
  const fillAlpha = 0.49 + ((tile.index * 37) % 11) * 0.009;
  g.fillStyle = `rgba(14,23,30,${fillAlpha.toFixed(3)})`;
  g.fill();
  g.strokeStyle = rgba(RGB.cyan, 0.058 + ((tile.index * 17) % 7) * 0.002);
  g.lineWidth = 1;
  g.stroke();

  g.fillStyle = rgba(RGB.cyan, 0.052);
  g.fillRect(tile.x + tile.w * 0.07, tile.y + 1, 5, 1);
}

function drawStaticTape(g, tile, bits, head) {
  const pad = tile.w * 0.065;
  const slot = (tile.w - pad * 2) / VIEW_CELLS;
  const cw = slot * 0.62;
  const cellH = tile.h * 0.20;
  const tapeY = tile.y + tile.h * 0.535 - cellH / 2;
  g.fillStyle = 'rgba(2,6,9,0.30)';
  g.fillRect(tile.x + pad - 2, tapeY - 2, tile.w - pad * 2 + 4, cellH + 4);
  for (let i = 0; i < VIEW_CELLS; i++) {
    const x = tile.x + pad + i * slot + (slot - cw) / 2;
    g.fillStyle = rgba(RGB.cyan, bits[i] ? 0.075 : 0.022);
    g.fillRect(x, tapeY, cw, cellH);
  }
  if (head >= 0) {
    const x = tile.x + pad + (head + 0.5) * slot;
    g.fillStyle = rgba(RGB.amber, 0.045);
    g.fillRect(x - 0.5, tapeY - 3, 1, cellH + 6);
  }
  g.fillStyle = rgba(RGB.cyan, 0.04);
  g.fillRect(tile.x + pad, tapeY + cellH + 3, tile.w - pad * 2, 0.5);
}

function drawStaticTile(g, tile) {
  drawTileBase(g, tile);
  const rng = mulberry32(1000 + tile.index * 79);
  const bits = new Uint8Array(VIEW_CELLS);
  for (let i = 0; i < VIEW_CELLS; i++) bits[i] = rng() < 0.24 ? 1 : 0;
  const head = tile.stationIndex >= 0 ? 4 + Math.floor(rng() * (VIEW_CELLS - 8)) : -1;
  drawStaticTape(g, tile, bits, head);

  const pad = tile.w * 0.065;
  g.fillStyle = rgba(RGB.cyan, tile.stationIndex >= 0 ? 0.18 : 0.09);
  g.beginPath();
  g.arc(tile.x + tile.w - pad - 1.5, tile.y + tile.h * 0.15, tile.stationIndex >= 0 ? 1.5 : 1.1, 0, Math.PI * 2);
  g.fill();

  if (tile.stationIndex >= 0) {
    g.font = `${clamp(tile.w * 0.082, 7, 10)}px ${MONO}`;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillStyle = rgba(RGB.amber, 0.20);
    g.fillText(`M${String(tile.stationIndex + 1).padStart(2, '0')}`, tile.x + pad, tile.y + tile.h * 0.15);
  }

  if (tile.isBB5) {
    g.strokeStyle = rgba(RGB.violet, 0.09);
    g.lineWidth = 1;
    roundedRect(g, tile.x + 0.5, tile.y + 0.5, tile.w - 1, tile.h - 1, Math.min(tile.w, tile.h) * 0.08);
    g.stroke();
  }
}

function drawHeaderStatic(g, scene) {
  const { header } = scene;
  g.font = `${header.labelFont}px ${MONO}`;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillStyle = rgba(RGB.cyan, 0.38);
  g.fillText('Ω prefix = 0.', scene.layout.x0, header.baseline);

  const bitFont = header.bitFont;
  g.font = `${bitFont}px ${MONO}`;
  g.textAlign = 'center';
  for (let i = 0; i < 64; i++) {
    const known = i < prefixLength;
    const one = OMEGA_BITS[i] === '1';
    if (known) {
      g.fillStyle = rgba(RGB.cyan, one ? 0.44 : 0.32);
    } else {
      g.fillStyle = rgba(RGB.slate, one ? 0.115 : 0.070);
    }
    g.fillText(OMEGA_BITS[i], header.bitX[i], header.baseline);
  }

  const lastPrefixX = prefixLength > 0
    ? header.bitX[prefixLength - 1] + header.slot / 2
    : header.startX;
  g.strokeStyle = rgba(RGB.cyan, 0.18);
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(header.startX - header.slot / 2, header.baseline + 6);
  g.lineTo(lastPrefixX, header.baseline + 6);
  g.moveTo(header.startX - header.slot / 2, header.baseline + 4);
  g.lineTo(header.startX - header.slot / 2, header.baseline + 6);
  g.moveTo(lastPrefixX, header.baseline + 4);
  g.lineTo(lastPrefixX, header.baseline + 6);
  g.stroke();

  g.strokeStyle = rgba(RGB.cyan, 0.055);
  g.lineWidth = 1;
  for (let group = 1; group < 8; group++) {
    const x = header.startX + group * header.slotUnit;
    g.beginPath();
    g.moveTo(x, header.baseline - bitFont * 0.9);
    g.lineTo(x, header.baseline - bitFont * 0.35);
    g.stroke();
  }
}

function drawFooter(g, scene) {
  const { layout } = scene;
  const size = clamp(layout.width / 150, 8, 10);
  g.font = `${size}px ${MONO}`;
  g.textAlign = 'right';
  g.textBaseline = 'alphabetic';
  g.fillStyle = rgba(RGB.cyan, 0.22);
  g.fillText(`fixed enumeration · step budget ${formatNumber(BUDGET)}`, layout.x1, layout.height - Math.max(10, layout.height * 0.018));
}

function buildScene(state) {
  const { width, height, dpr } = state;
  const layout = computeLayout(width, height);
  const cells = stationCells(layout);
  const bb5Cell = chooseBB5Cell(layout, cells);
  const stationMap = new Map(cells.map((cell) => [`${cell.r}:${cell.c}`, cell.index]));
  const bb5Key = `${bb5Cell.r}:${bb5Cell.c}`;

  const tiles = [];
  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.cols; c++) {
      const index = r * layout.cols + c;
      const key = `${r}:${c}`;
      tiles.push({
        r, c, index,
        x: layout.x0 + c * (layout.tileW + layout.gap),
        y: layout.y0 + r * (layout.tileH + layout.gap),
        w: layout.tileW,
        h: layout.tileH,
        stationIndex: stationMap.has(key) ? stationMap.get(key) : -1,
        isBB5: key === bb5Key,
      });
    }
  }

  const stations = cells.map((cell) => {
    const tile = tiles.find((t) => t.r === cell.r && t.c === cell.c);
    const machine = MACHINES[cell.index];
    return { ...cell, tile, machine };
  });
  const bb5Tile = tiles.find((tile) => tile.isBB5);

  const staticCanvas = document.createElement('canvas');
  staticCanvas.width = Math.max(1, Math.round(width * dpr));
  staticCanvas.height = Math.max(1, Math.round(height * dpr));
  const g = staticCanvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  drawBackground(g, width, height);
  drawWallWash(g, layout);
  drawWallBrackets(g, layout);
  for (const tile of tiles) drawStaticTile(g, tile);

  const labelFont = clamp(width / 110, 11, 13);
  const bitFont = clamp(width / 128, 10, 12);
  g.font = `${labelFont}px ${MONO}`;
  const labelWidth = g.measureText('Ω prefix = 0.').width;
  const header = {
    labelFont,
    bitFont,
    baseline: Math.round(height * 0.078),
    startX: layout.x0 + labelWidth + Math.max(10, width * 0.008),
    endX: layout.x1,
    groupGap: Math.max(3, (layout.x1 - layout.x0) * 0.0035),
  };
  header.slotUnit = ((header.endX - header.startX) - header.groupGap * 7) / 64;
  header.slot = header.slotUnit;
  header.bitX = [];
  for (let i = 0; i < 64; i++) {
    header.bitX.push(header.startX + i * header.slotUnit + Math.floor(i / 8) * header.groupGap + header.slotUnit / 2);
  }

  drawHeaderStatic(g, { layout, header });
  drawFooter(g, { layout, height });

  return {
    layout,
    width,
    height,
    dpr,
    staticCanvas,
    tiles,
    stations,
    bb5Tile,
    header,
    bb5CounterBase: 47169400,
  };
}

function activeCurve(scan, center) {
  const v = wrapSigned(scan - center, STATIONS);
  const env = 1 - smoothstep(0.30, 0.62, Math.abs(v));
  return { v, env };
}

function drawStationGlow(g, station, env) {
  if (env <= 0.002) return;
  const { tile } = station;
  const cx = tile.x + tile.w / 2;
  const cy = tile.y + tile.h / 2;
  const radius = Math.max(tile.w, tile.h) * 0.95;
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = env;
  const grad = g.createRadialGradient(cx, cy, tile.w * 0.12, cx, cy, radius);
  grad.addColorStop(0, rgba(RGB.amber, 0.155));
  grad.addColorStop(0.34, rgba(RGB.amber, 0.058));
  grad.addColorStop(1, rgba(RGB.amber, 0));
  g.fillStyle = grad;
  g.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  g.restore();
}

function drawScanTape(g, station, tile, runP) {
  const frames = station.machine.frames;
  if (!frames.length) return;
  const pos = clamp(runP, 0, 1) * (frames.length - 1);
  const i0 = Math.floor(pos);
  const i1 = Math.min(frames.length - 1, i0 + 1);
  const fr = pos - i0;
  const f0 = frames[i0];
  const f1 = frames[i1];

  const pad = tile.w * 0.065;
  const slot = (tile.w - pad * 2) / VIEW_CELLS;
  const cw = slot * 0.62;
  const cellH = tile.h * 0.24;
  const tapeY = tile.y + tile.h * 0.535 - cellH / 2;
  const head = f0.head + (f1.head - f0.head) * fr;
  const headCell = clamp(Math.floor(head), 0, VIEW_CELLS - 1);

  g.fillStyle = 'rgba(2,6,9,0.46)';
  g.fillRect(tile.x + pad - 2, tapeY - 2, tile.w - pad * 2 + 4, cellH + 4);
  for (let i = 0; i < VIEW_CELLS; i++) {
    const value = f0.bits[i] * (1 - fr) + f1.bits[i] * fr;
    const x = tile.x + pad + i * slot + (slot - cw) / 2;
    const near = Math.max(0, 1 - Math.abs(i - head) / 3);
    g.fillStyle = rgba(RGB.cyan, 0.040 + value * 0.34);
    g.fillRect(x, tapeY, cw, cellH);
    if (near > 0) {
      g.fillStyle = rgba(RGB.amber, near * 0.065);
      g.fillRect(x, tapeY, cw, cellH);
    }
  }

  const hx = tile.x + pad + (head + 0.5) * slot;
  g.fillStyle = rgba(RGB.amber, 0.16);
  g.fillRect(tile.x + pad + headCell * slot + (slot - cw) / 2, tapeY, cw, cellH);
  g.fillStyle = rgba(RGB.amber, 0.72);
  g.fillRect(hx - 0.7, tapeY - 3, 1.4, cellH + 6);
  g.fillStyle = rgba(RGB.amber, 0.12);
  g.fillRect(hx - 2.7, tapeY - 3, 5.4, cellH + 6);
  g.beginPath();
  g.moveTo(hx, tapeY - 4);
  g.lineTo(hx - 2.2, tapeY - 7.5);
  g.lineTo(hx + 2.2, tapeY - 7.5);
  g.closePath();
  g.fillStyle = rgba(RGB.amber, 0.55);
  g.fill();

  g.fillStyle = rgba(RGB.cyan, 0.05);
  g.fillRect(tile.x + pad, tapeY + cellH + 3, tile.w - pad * 2, 0.5);
}

function drawStationContent(g, station, v, env) {
  const { tile, machine } = station;
  const runP = clamp(0.5 + v / 1.24, 0, 1);
  const haltPulse = machine.halted
    ? Math.exp(-Math.pow((v - 0.397) / 0.09, 2))
    : 0;
  const post = machine.halted ? clamp((v - 0.397) / 0.16, 0, 1) : 0;
  const pad = tile.w * 0.065;
  const fsize = clamp(tile.w * 0.082, 7, 10);

  g.save();
  g.globalAlpha = env;
  const radius = Math.min(tile.w, tile.h) * 0.08;
  roundedRect(g, tile.x, tile.y, tile.w, tile.h, radius);
  g.fillStyle = 'rgba(7,12,16,0.92)';
  g.fill();
  roundedRect(g, tile.x + 0.5, tile.y + 0.5, tile.w - 1, tile.h - 1, radius);
  g.strokeStyle = rgba(RGB.amber, 0.38);
  g.lineWidth = 1;
  g.stroke();
  roundedRect(g, tile.x - 1.5, tile.y - 1.5, tile.w + 3, tile.h + 3, radius + 1.5);
  g.strokeStyle = rgba(RGB.amber, 0.10);
  g.stroke();

  const sheen = g.createLinearGradient(0, tile.y, 0, tile.y + tile.h);
  sheen.addColorStop(0, rgba(RGB.amber, 0.045));
  sheen.addColorStop(0.55, rgba(RGB.amber, 0.0));
  g.fillStyle = sheen;
  g.fillRect(tile.x, tile.y, tile.w, tile.h);

  if (machine.halted && haltPulse > 0.02) {
    const cx = tile.x + tile.w / 2;
    const cy = tile.y + tile.h / 2;
    const rad = Math.max(tile.w, tile.h) * 0.9;
    g.save();
    g.globalCompositeOperation = 'lighter';
    const flash = g.createRadialGradient(cx, cy, tile.w * 0.2, cx, cy, rad);
    flash.addColorStop(0, rgba(RGB.cyan, 0.055 * haltPulse));
    flash.addColorStop(1, rgba(RGB.cyan, 0));
    g.fillStyle = flash;
    g.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    g.restore();
    roundedRect(g, tile.x - 1.5, tile.y - 1.5, tile.w + 3, tile.h + 3, radius + 1.5);
    g.strokeStyle = rgba(RGB.cyan, 0.26 * haltPulse);
    g.lineWidth = 1.5;
    g.stroke();
    g.fillStyle = rgba(RGB.cyan, 0.22 * haltPulse);
    g.fillRect(tile.x + pad, tile.y + tile.h - 1.5, tile.w - pad * 2, 1);
  }

  g.fillStyle = rgba(RGB.amber, 0.065);
  g.fillRect(tile.x + tile.w * 0.07, tile.y + 1, tile.w * 0.18, 1);

  drawScanTape(g, station, tile, runP);

  g.font = `${fsize}px ${MONO}`;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillStyle = rgba(RGB.amber, 0.42);
  g.fillText(`M${String(station.index + 1).padStart(2, '0')}`, tile.x + pad, tile.y + tile.h * 0.15);

  const dotX = tile.x + tile.w - pad - 1.5;
  const dotY = tile.y + tile.h * 0.15;
  const dotRadius = clamp(tile.w * 0.018, 1.4, 2.6);
  const glow = g.createRadialGradient(dotX, dotY, 0, dotX, dotY, dotRadius * 6);
  glow.addColorStop(0, rgba(RGB.amber, 0.30));
  glow.addColorStop(1, rgba(RGB.amber, 0));
  g.fillStyle = glow;
  g.beginPath();
  g.arc(dotX, dotY, dotRadius * 6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = rgba(RGB.amber, 0.80);
  g.beginPath();
  g.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
  g.fill();

  if (machine.halted && (haltPulse > 0.02 || post > 0)) {
    const flash = Math.max(haltPulse * 0.9, (1 - post) * 0.5);
    g.fillStyle = rgba(RGB.cyan, flash);
    g.beginPath();
    g.arc(dotX, dotY, dotRadius * (1 + haltPulse * 0.8), 0, Math.PI * 2);
    g.fill();
    if (post > 0) {
      g.strokeStyle = rgba(RGB.cyan, (1 - post) * 0.30);
      g.lineWidth = 1;
      g.beginPath();
      g.arc(dotX, dotY, dotRadius + post * 10, 0, Math.PI * 2);
      g.stroke();
    }
  }

  if (machine.halted && post > 0) {
    g.font = `${fsize}px ${MONO}`;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    g.fillStyle = rgba(RGB.cyan, 0.38 * (1 - post * 0.2));
    g.fillText(machine.bitValue, tile.x + tile.w - pad, tile.y + tile.h - pad * 0.9);
  }
  g.restore();
}

function drawBB5(g, scene, t) {
  const { bb5Tile } = scene;
  if (!bb5Tile) return;
  const { tile } = { tile: bb5Tile };
  const phase = clamp(t / DURATION, 0, 1);
  const wave = 0.5 - 0.5 * Math.cos(Math.PI * 2 * phase);
  const frameIndex = BB5_FRAMES.length
    ? Math.min(BB5_FRAMES.length - 1, Math.round(wave * (BB5_FRAMES.length - 1)))
    : 0;
  const frame = BB5_FRAMES[frameIndex] || null;
  const pad = tile.w * 0.065;
  const radius = Math.min(tile.w, tile.h) * 0.08;
  const pulse = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);

  g.save();
  const halo = g.createRadialGradient(
    tile.x + tile.w / 2, tile.y + tile.h / 2, tile.w * 0.1,
    tile.x + tile.w / 2, tile.y + tile.h / 2, tile.w * 1.1
  );
  halo.addColorStop(0, rgba(RGB.amber, 0.050));
  halo.addColorStop(1, rgba(RGB.amber, 0));
  g.fillStyle = halo;
  g.fillRect(tile.x - tile.w, tile.y - tile.h, tile.w * 3, tile.h * 3);

  roundedRect(g, tile.x, tile.y, tile.w, tile.h, radius);
  g.fillStyle = 'rgba(9,14,18,0.92)';
  g.fill();
  g.strokeStyle = rgba(RGB.violet, 0.14);
  g.lineWidth = 1;
  g.stroke();

  g.fillStyle = rgba(RGB.violet, 0.075);
  g.fillRect(tile.x + tile.w * 0.07, tile.y + 1, tile.w * 0.16, 1);

  if (frame) {
    const slot = (tile.w - pad * 2) / VIEW_CELLS;
    const cw = slot * 0.62;
    const cellH = tile.h * 0.16;
    const tapeY = tile.y + tile.h * 0.665 - cellH / 2;
    for (let i = 0; i < VIEW_CELLS; i++) {
      const x = tile.x + pad + i * slot + (slot - cw) / 2;
      g.fillStyle = rgba(RGB.cyan, frame.bits[i] ? 0.29 : 0.026);
      g.fillRect(x, tapeY, cw, cellH);
    }
    const hx = tile.x + pad + (frame.head + 0.5) * slot;
    g.fillStyle = rgba(RGB.amber, 0.14);
    g.fillRect(tile.x + pad + frame.head * slot + (slot - cw) / 2, tapeY, cw, cellH);
    g.fillStyle = rgba(RGB.amber, 0.58);
    g.fillRect(hx - 0.6, tapeY - 2, 1.2, cellH + 4);
  }

  const labelSize = clamp(tile.w * 0.070, 7, 9.5);
  g.font = `${labelSize}px ${MONO}`;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillStyle = rgba(RGB.violet, 0.42);
  g.fillText('BB(5)', tile.x + pad, tile.y + tile.h * 0.13);

  const sSize = clamp(tile.w * 0.095, 8, 12);
  g.font = `${sSize}px ${MONO}`;
  g.textBaseline = 'alphabetic';
  g.fillStyle = rgba(RGB.amber, 0.44);
  g.fillText('S = 47,176,870', tile.x + pad, tile.y + tile.h * 0.335);
  g.strokeStyle = rgba(RGB.violet, 0.06);
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(tile.x + pad, tile.y + tile.h * 0.365);
  g.lineTo(tile.x + tile.w - pad, tile.y + tile.h * 0.365);
  g.stroke();

  const nSize = clamp(tile.w * 0.060, 7, 9);
  g.font = `${nSize}px ${MONO}`;
  g.fillStyle = rgba(RGB.cyan, 0.34);
  const n = scene.bb5CounterBase + Math.floor(phase * 40);
  g.fillText(`n ${formatNumber(n)}`, tile.x + pad, tile.y + tile.h * 0.465);

  const dotX = tile.x + tile.w - pad - 1.5;
  const dotY = tile.y + tile.h * 0.13;
  const dotR = clamp(tile.w * 0.015, 1.1, 2.1);
  g.strokeStyle = rgba(RGB.violet, 0.10 + pulse * 0.04);
  g.lineWidth = 1;
  g.beginPath();
  g.arc(dotX, dotY, dotR + 2.2, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = rgba(RGB.amber, 0.32 + pulse * 0.08);
  g.beginPath();
  g.arc(dotX, dotY, dotR, 0, Math.PI * 2);
  g.fill();

  g.restore();
}

function drawHeaderPulses(g, scene, scan) {
  const { header, stations } = scene;
  g.save();
  g.font = `${header.bitFont}px ${MONO}`;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  for (const station of stations) {
    if (!station.machine.halted) continue;
    const { v } = activeCurve(scan, station.index + 0.5);
    const pulse = Math.exp(-Math.pow((v - 0.397) / 0.11, 2));
    if (pulse < 0.02) continue;
    const x = header.bitX[station.machine.bitIndex];
    const y = header.baseline;

    g.globalCompositeOperation = 'lighter';
    const glow = g.createRadialGradient(x, y - 2, 0, x, y - 2, header.bitFont * 1.5);
    glow.addColorStop(0, rgba(RGB.cyan, 0.18 * pulse));
    glow.addColorStop(1, rgba(RGB.cyan, 0));
    g.fillStyle = glow;
    g.beginPath();
    g.arc(x, y - 2, header.bitFont * 1.5, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'source-over';

    g.fillStyle = rgba(RGB.cyan, 0.10 + pulse * 0.5);
    g.fillRect(x - header.bitFont * 0.38, y + 3.2, header.bitFont * 0.76, 1.2);

    g.fillStyle = rgba(RGB.cyan, Math.min(0.45, 0.28 + pulse * 0.17));
    g.fillText(OMEGA_BITS[station.machine.bitIndex], x, y);
  }
  g.restore();
}

function drawFrame(state, t) {
  const { ctx, width, height } = state;
  if (!scene) return;
  ctx.drawImage(scene.staticCanvas, 0, 0, width, height);

  const scan = mod((t / DURATION) * STATIONS + 0.5, STATIONS);
  const active = [];
  for (const station of scene.stations) {
    const { v, env } = activeCurve(scan, station.index + 0.5);
    if (env > 0.002) active.push({ station, v, env });
  }

  for (const item of active) drawStationGlow(ctx, item.station, item.env);
  for (const item of active) drawStationContent(ctx, item.station, item.v, item.env);
  drawBB5(ctx, scene, t);
  drawHeaderPulses(ctx, scene, scan);
}

let scene = null;

createWallpaper({
  duration: DURATION,
  fps: FPS,
  context: '2d',
  dprCap: 2,
  background: COL.bg,
  setup(state) {
    scene = buildScene(state);
  },
  draw(state, t) {
    drawFrame(state, t);
  },
  onResize(state) {
    scene = buildScene(state);
  },
});
