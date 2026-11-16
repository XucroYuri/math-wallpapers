import * as THREE from '../../shared/vendor/three.module.js';
import { createWallpaper } from '../../shared/wallpaper.js';

const DURATION = 30;
const TAU = Math.PI * 2;
const COUNT = 128000;
const CORE_COUNT = 10000;
const FILAMENT_COUNT = 95000;
const VEIL_COUNT = 10000;
const HALO_COUNT = 13000;
const SEED = 0x2025a17;

const CYAN = new THREE.Color('#7ef0d4');
const VIOLET = new THREE.Color('#c8a2ff');

// One soft cavity; the larger dark lanes come from the smooth opacity field.
const VOIDS = [
  { x: 0.62, y: 0.36, z: -0.12, rx: 0.26, ry: 0.22, rz: 0.34, rot: 0.22 },
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng) {
  return (rng() + rng() + rng() + rng() - 2) * 1.7320508075688772;
}

function wispMask(x, y, z) {
  const s =
    0.55 * Math.sin(3.6 * x + 2.6 * y + 1.5 * z + 0.6) +
    0.28 * Math.sin(5.8 * x - 4.0 * y + 2.5 * z + 1.4) +
    0.17 * Math.sin(9.2 * y - 6.4 * z + 2.2 * x + 3.2);
  const v = 0.5 + 0.5 * s;
  const t = Math.min(1, Math.max(0, (v - 0.30) / 0.32));
  return t * t * (3 - 2 * t);
}

function insideVoid(x, y, z, rng) {
  for (let i = 0; i < VOIDS.length; i++) {
    const v = VOIDS[i];
    const dx = x - v.x;
    const dy = y - v.y;
    const dz = (z - v.z) / v.rz;
    const c = Math.cos(v.rot);
    const s = Math.sin(v.rot);
    const qx = (dx * c + dy * s) / v.rx;
    const qy = (-dx * s + dy * c) / v.ry;
    const q = qx * qx + qy * qy + dz * dz;
    if (q < 1) {
      const keep = 0.035 + 0.30 * q * q * q;
      if (rng() > keep) return true;
    }
  }
  return false;
}

function sampleCore(rng) {
  let x;
  let y;
  let z;
  do {
    x = gaussian(rng) * 0.30;
    y = gaussian(rng) * 0.22;
    z = gaussian(rng) * 0.26;
  } while ((x / 0.82) ** 2 + (y / 0.63) ** 2 + (z / 0.74) ** 2 > 1);
  const twist = 0.75 * Math.sqrt(x * x + y * y) + 0.4;
  const c = Math.cos(twist);
  const s = Math.sin(twist);
  const nx = x * c - y * s + 0.03;
  const ny = x * s + y * c - 0.01;
  if (insideVoid(nx, ny, z, rng)) return null;
  if (Math.abs(ny) > 1.45) return null;
  return [nx, ny, z];
}

function finishPath(points) {
  const cum = [0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    total += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    cum.push(total);
  }
  return { points, cum, total };
}

function buildFilaments(rng) {
  const paths = [];
  const spiralCount = 118;
  const arcCount = 46;

  for (let i = 0; i < spiralCount; i++) {
    const r0 = 0.025 + 0.72 * Math.pow(rng(), 1.9);
    const r1 = Math.min(1.43, r0 + 0.45 + 1.05 * Math.pow(rng(), 0.7));
    const th0 = rng() * TAU;
    const swirl = (rng() < 0.72 ? 1 : -1) * (1.1 + 2.5 * rng());
    const yScale = 0.56 + 0.20 * rng();
    const z0 = gaussian(rng) * 0.20;
    const zAmp = 0.05 + 0.24 * rng();
    const phase = rng() * TAU;
    const wobble = 0.04 + 0.11 * rng();
    const points = [];
    for (let j = 0; j < 42; j++) {
      const u = j / 41;
      const r = r0 + (r1 - r0) * u;
      const th = th0 + swirl * Math.pow(u, 0.92) + wobble * Math.sin(3.1 * u + phase);
      const x = Math.cos(th) * r + 0.04 * u * Math.sin(4.0 * u + phase);
      const y =
        Math.sin(th) * r * yScale +
        0.08 * u * Math.sin(3.3 * u + phase + 1.2);
      const z = z0 + zAmp * Math.sin(2.7 * u + phase) + 0.16 * u * Math.sin(5.0 * u + 0.5);
      points.push([x, y, z]);
    }
    paths.push({
      ...finishPath(points),
      width: 0.012 + 0.048 * Math.pow(rng(), 1.4),
      tone: 0.45 + 0.85 * rng(),
    });
  }

  for (let i = 0; i < arcCount; i++) {
    const thA = rng() * TAU;
    const thB = thA + 1.0 + 2.4 * rng();
    const rA = 0.55 + 0.82 * rng();
    const rB = 0.55 + 0.82 * rng();
    const yScale = 0.60 + 0.15 * rng();
    const ax = Math.cos(thA) * rA;
    const ay = Math.sin(thA) * rA * yScale;
    const bx = Math.cos(thB) * rB;
    const by = Math.sin(thB) * rB * yScale;
    const az = gaussian(rng) * 0.30;
    const bz = gaussian(rng) * 0.30;
    const bow = (rng() - 0.5) * 0.65;
    const perpX = -(by - ay);
    const perpY = bx - ax;
    const plen = Math.hypot(perpX, perpY) || 1;
    const cbx = (ax + bx) * 0.5 + (perpX / plen) * bow;
    const cby = (ay + by) * 0.5 + (perpY / plen) * bow;
    const cbz = (az + bz) * 0.5 + gaussian(rng) * 0.26;
    const points = [];
    for (let j = 0; j < 46; j++) {
      const u = j / 45;
      const w0 = (1 - u) * (1 - u);
      const w1 = 2 * (1 - u) * u;
      const w2 = u * u;
      const x = w0 * ax + w1 * cbx + w2 * bx;
      const y = w0 * ay + w1 * cby + w2 * by;
      const z = w0 * az + w1 * cbz + w2 * bz;
      points.push([x, y, z]);
    }
    paths.push({
      ...finishPath(points),
      width: 0.014 + 0.055 * Math.pow(rng(), 1.3),
      tone: 0.40 + 0.85 * rng(),
    });
  }

  return paths;
}

function buildHalo(rng) {
  const clumps = [];
  const totalClumps = 56;
  const weights = [];
  let weightSum = 0;
  for (let i = 0; i < totalClumps; i++) {
    const w = 0.25 + Math.pow(rng(), 1.4) * 1.75;
    weights.push(w);
    weightSum += w;
  }
  for (let i = 0; i < totalClumps; i++) {
    const theta = rng() * TAU;
    const radius = 0.72 + 0.62 * Math.pow(rng(), 0.55);
    const cx = Math.cos(theta) * radius * 1.03;
    const cy = Math.sin(theta) * radius * 0.67 + 0.10 * Math.sin(2.4 * theta + 1.1);
    const cz = gaussian(rng) * 0.32 + 0.15 * Math.sin(3.0 * theta + 0.3);
    const size = 0.055 + 0.17 * Math.pow(rng(), 1.15);
    const stretch = 0.45 + 2.4 * rng();
    const angle = rng() * TAU;
    const count = Math.max(30, Math.round((HALO_COUNT * weights[i]) / weightSum));
    clumps.push({ cx, cy, cz, size, stretch, angle, count, tone: 0.55 + 0.45 * rng() });
  }
  return clumps;
}

function samplePath(path, rng) {
  const s = rng() * path.total;
  let lo = 0;
  let hi = path.cum.length - 1;
  while (lo + 1 < hi) {
    const m = (lo + hi) >> 1;
    if (path.cum[m] <= s) lo = m;
    else hi = m;
  }
  const a = path.points[lo];
  const b = path.points[lo + 1];
  const seg = path.cum[hi] - path.cum[lo] || 1;
  const u = (s - path.cum[lo]) / seg;
  const tx = b[0] - a[0];
  const ty = b[1] - a[1];
  const tz = b[2] - a[2];
  const tl = Math.hypot(tx, ty, tz) || 1;
  const nx = tx / tl;
  const ny = ty / tl;
  const nz = tz / tl;

  let ax = 0;
  let ay = 0;
  let az = 1;
  if (Math.abs(nz) > 0.9) {
    ax = 1;
    az = 0;
  }
  const ux = ny * az - nz * ay;
  const uy = nz * ax - nx * az;
  const uz = nx * ay - ny * ax;
  const ul = Math.hypot(ux, uy, uz) || 1;
  const vx = (ny * uz - nz * uy) / ul;
  const vy = (nz * ux - nx * uz) / ul;
  const vz = (nx * uy - ny * ux) / ul;

  const w = path.width;
  const offset = gaussian(rng) * w;
  const offset2 = gaussian(rng) * w * (0.55 + 0.45 * rng());
  const m = rng() * 0.35 - 0.175;
  const px =
    a[0] + tx * u + nx * m * w + (ux / ul) * offset + vx * offset2;
  const py =
    a[1] + ty * u + ny * m * w + (uy / ul) * offset + vy * offset2;
  const pz =
    a[2] + tz * u + nz * m * w + (uz / ul) * offset + vz * offset2;

  if (insideVoid(px, py, pz, rng)) return null;
  if (Math.abs(py) > 1.45) return null;
  return [px, py, pz];
}

function sampleVeil(rng) {
  const theta = rng() * TAU;
  const base = 0.88 + 0.62 * Math.pow(rng(), 0.7);
  const radius =
    base *
    (1 + 0.10 * Math.sin(3 * theta + 0.7) + 0.06 * Math.sin(5 * theta + 2.1));
  const x = Math.cos(theta) * radius;
  const y =
    Math.sin(theta) * radius * 0.70 +
    gaussian(rng) * 0.055 +
    0.08 * Math.sin(2.2 * theta + 1.4);
  const z =
    gaussian(rng) * 0.42 +
    0.15 * Math.sin(2.8 * theta + 0.5) +
    0.05 * Math.sin(4.6 * radius + 1.1);
  if (insideVoid(x, y, z, rng)) return null;
  if (Math.abs(y) > 1.45) return null;
  return [x, y, z];
}

function sampleHalo(rng, clump) {
  const dx = gaussian(rng) * clump.size * clump.stretch;
  const dy = gaussian(rng) * clump.size * 0.55;
  const dz = gaussian(rng) * clump.size * 0.85;
  const c = Math.cos(clump.angle);
  const s = Math.sin(clump.angle);
  const x = clump.cx + dx * c - dy * s;
  const y = clump.cy + dx * s + dy * c;
  const z = clump.cz + dz;
  if (insideVoid(x, y, z, rng)) return null;
  if (Math.abs(y) > 1.45) return null;
  return [x, y, z];
}

function neonColor(x, y, z, dx, dy, dz, rng) {
  const directionMix = 0.5 + 0.28 * dx + 0.30 * dy + 0.16 * dz;
  const zone = Math.tanh(
    1.15 * Math.sin(2.1 * x + 1.25 * y + 0.75 * z + 0.9) +
      0.65 * Math.sin(3.6 * y - 2.3 * x + 1.5 * z + 2.2),
  );
  const mixRaw = Math.min(
    1,
    Math.max(0, 0.5 + 0.39 * zone + 0.17 * (directionMix - 0.5) + 0.035 * (rng() - 0.5)),
  );
  const smooth = 1 / (1 + Math.exp(-9 * (mixRaw - 0.5)));
  return [
    CYAN.r + (VIOLET.r - CYAN.r) * smooth,
    CYAN.g + (VIOLET.g - CYAN.g) * smooth,
    CYAN.b + (VIOLET.b - CYAN.b) * smooth,
  ];
}

function buildGeometry() {
  const rng = mulberry32(SEED);
  const positions = new Float32Array(COUNT * 6);
  const colors = new Float32Array(COUNT * 8);
  const midX = new Float32Array(COUNT);
  const midY = new Float32Array(COUNT);
  const midZ = new Float32Array(COUNT);
  const kind = new Uint8Array(COUNT);
  const alpha = new Float32Array(COUNT);
  let n = 0;

  const push = (p, k, a) => {
    midX[n] = p[0];
    midY[n] = p[1];
    midZ[n] = p[2];
    kind[n] = k;
    const rr = Math.hypot(p[0], p[1] * 1.35, p[2] * 0.9);
    const veil = wispMask(p[0], p[1], p[2]);
    alpha[n] = a * (0.44 + 0.56 * Math.min(1, rr / 0.92)) * (0.22 + 0.78 * veil);
    n += 1;
  };

  while (n < CORE_COUNT) {
    const p = sampleCore(rng);
    if (p) push(p, 0, 0.40 + 0.18 * rng());
  }

  const paths = buildFilaments(rng);
  const weights = paths.map((path) => path.total * (0.55 + path.width * 5) * path.tone);
  const weightSum = weights.reduce((sum, value) => sum + value, 0);
  const pathCounts = weights.map((value) => Math.max(100, Math.round((FILAMENT_COUNT * value) / weightSum)));
  let filTarget = 0;
  for (const c of pathCounts) filTarget += c;

  paths.forEach((path, pi) => {
    const target = pathCounts[pi];
    let made = 0;
    let attempts = 0;
    while (made < target && attempts < target * 4) {
      attempts += 1;
      const p = samplePath(path, rng);
      if (p) {
        push(p, 1, (0.55 + 0.18 * rng()) * path.tone * 0.62);
        made += 1;
      }
    }
  });

  while (n < CORE_COUNT + filTarget + VEIL_COUNT && n < COUNT) {
    const p = sampleVeil(rng);
    if (p) push(p, 3, 0.055 + 0.085 * rng());
  }

  const clumps = buildHalo(rng);
  let clumpIndex = 0;
  let inClump = 0;
  while (n < COUNT) {
    const clump = clumps[clumpIndex % clumps.length];
    const p = sampleHalo(rng, clump);
    if (p) push(p, 2, (0.45 + 0.25 * rng()) * clump.tone);
    inClump += 1;
    if (inClump >= clump.count) {
      inClump = 0;
      clumpIndex += 1;
    }
  }

  const perm = new Uint32Array(COUNT);
  for (let i = 0; i < COUNT; i++) perm[i] = i;
  for (let i = COUNT - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const swap = perm[i];
    perm[i] = perm[j];
    perm[j] = swap;
  }

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < COUNT; i++) {
    const di = perm[i];
    const dz = 1 - (2 * di + 1) / COUNT;
    const ring = Math.sqrt(Math.max(0, 1 - dz * dz));
    const phi = di * goldenAngle;
    const dx = ring * Math.cos(phi);
    const dy = dz;
    const dzv = ring * Math.sin(phi);

    const len = 0.04 + 0.08 * Math.pow(rng(), 1.55);
    const mx = midX[i];
    const my = midY[i];
    const mz = midZ[i];
    const hx = dx * len * 0.5;
    const hy = dy * len * 0.5;
    const hz = dzv * len * 0.5;
    const p = i * 6;
    positions[p] = mx - hx;
    positions[p + 1] = my - hy;
    positions[p + 2] = mz - hz;
    positions[p + 3] = mx + hx;
    positions[p + 4] = my + hy;
    positions[p + 5] = mz + hz;

    const [cr, cg, cb] = neonColor(mx, my, mz, dx, dy, dzv, rng);
    const viewDepth = mz * 0.93 + my * 0.37;
    let tone =
      alpha[i] * (0.72 + 0.28 * (0.68 + 0.32 * ((viewDepth + 1.2) / 2.4)));
    if (kind[i] !== 3 && rng() < 0.035) tone += 0.25;
    tone *= 0.70 + 0.40 * rng();
    tone = Math.min(1.0, Math.max(0.03, tone));

    const c = i * 8;
    colors[c] = cr;
    colors[c + 1] = cg;
    colors[c + 2] = cb;
    colors[c + 3] = tone;
    colors[c + 4] = cr;
    colors[c + 5] = cg;
    colors[c + 6] = cb;
    colors[c + 7] = tone;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  geometry.computeBoundingSphere();
  return { geometry, count: n };
}

function makeBackdrop() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uAspect: { value: 1 },
      uCenter: { value: new THREE.Vector2(0.60, 0.505) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 1.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uAspect;
      uniform vec2 uCenter;
      varying vec2 vUv;
      void main() {
        vec3 base = vec3(0.0196, 0.0275, 0.0392);
        vec2 p = vec2((vUv.x - uCenter.x) * uAspect, vUv.y - uCenter.y);
        vec2 p2 = vec2((vUv.x - 0.82) * uAspect, vUv.y - 0.16);
        float r2 = dot(p, p);
        float coreGlow = exp(-r2 * 6.5);
        float halo = exp(-r2 * 1.7);
        float violet = exp(-dot(p2, p2) * 4.5);
        vec3 col = base;
        col += vec3(0.080, 0.395, 0.330) * (0.060 * coreGlow + 0.020 * halo);
        col += vec3(0.330, 0.170, 0.560) * (0.020 * violet);
        float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        col += (dither - 0.5) * 0.0012;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return { mesh, material };
}

function makeAnnotation() {
  const W = 210;
  const H = 64;
  const S = 4;
  const canvas = document.createElement('canvas');
  canvas.width = W * S;
  canvas.height = H * S;
  const ctx = canvas.getContext('2d');
  ctx.scale(S, S);
  ctx.lineCap = 'round';

  ctx.strokeStyle = 'rgba(126, 240, 212, 0.55)';
  ctx.lineWidth = 0.65;
  ctx.beginPath();
  ctx.arc(22, 34, 15.5, Math.PI * 0.74, Math.PI * 1.43);
  ctx.stroke();
  const a0 = Math.PI * 0.74;
  const a1 = Math.PI * 1.43;
  ctx.beginPath();
  ctx.moveTo(22 + 12.5 * Math.cos(a0), 34 + 12.5 * Math.sin(a0));
  ctx.lineTo(22 + 18.5 * Math.cos(a0), 34 + 18.5 * Math.sin(a0));
  ctx.moveTo(22 + 12.5 * Math.cos(a1), 34 + 12.5 * Math.sin(a1));
  ctx.lineTo(22 + 18.5 * Math.cos(a1), 34 + 18.5 * Math.sin(a1));
  ctx.stroke();

  ctx.textBaseline = 'alphabetic';
  ctx.font = '500 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  ctx.fillStyle = 'rgba(164, 245, 226, 0.90)';
  ctx.fillText('Kakeya set ⊂ R³', 46, 26);

  ctx.font = '400 9.5px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  ctx.fillStyle = 'rgba(126, 240, 212, 0.68)';
  ctx.fillText('dim_H = 3', 46, 42);

  ctx.font = '400 8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  ctx.fillStyle = 'rgba(200, 162, 255, 0.62)';
  ctx.fillText('Wang–Zahl 2025', 46, 55);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.36,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 1000;
  sprite.frustumCulled = false;
  return { sprite, design: { w: W, h: H } };
}

function layout(state) {
  const { width, height, camera } = state;
  const aspect = width / height;
  const wide = Math.max(0, Math.min(1, (aspect - 16 / 9) / (2560 / 1080 - 16 / 9)));
  const distance = 5.25 - 0.22 * wide;
  const stretchX = 1 + 0.30 * wide;
  const stretchY = 1 - 0.10 * wide;
  const fov = 40;
  const halfH = distance * Math.tan((fov * Math.PI) / 360);
  const halfW = halfH * aspect;

  camera.fov = fov;
  camera.aspect = aspect;
  camera.near = 0.1;
  camera.far = 100;
  camera.position.set(0, 0, distance);
  camera.updateProjectionMatrix();

  state.distance = distance;
  state.halfH = halfH;
  state.halfW = halfW;
  state.stretchX = stretchX;
  state.stretchY = stretchY;
  state.fit.position.set(halfW * 0.20, 0.01, 0);
  state.fit.scale.set(stretchX, stretchY, 1);
  state.backdrop.material.uniforms.uAspect.value = aspect;

  const worldPerPixel = (2 * halfH) / height;
  const uiScale = 1 + 0.16 * Math.min(1, Math.max(0, (height - 720) / 720));
  const margin = Math.max(18, height * 0.028);
  const blockW = state.annotation.design.w * uiScale;
  const blockH = state.annotation.design.h * uiScale;
  const cxPx = width - margin - blockW * 0.5;
  const cyPx = height - margin - blockH * 0.5;
  state.annotation.sprite.position.set(
    (cxPx - width * 0.5) * worldPerPixel,
    (height * 0.5 - cyPx) * worldPerPixel,
    -distance,
  );
  state.annotation.sprite.scale.set(blockW * worldPerPixel, blockH * worldPerPixel, 1);
  state.uiScale = uiScale;
}

createWallpaper({
  duration: DURATION,
  fps: 30,
  context: 'none',
  background: '#05070a',
  setup(state) {
    const renderer = new THREE.WebGLRenderer({
      canvas: state.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(state.dpr);
    renderer.setSize(state.width, state.height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setClearColor(0x05070a, 1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, state.width / state.height, 0.1, 100);

    const { geometry } = buildGeometry();
    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.115,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const lines = new THREE.LineSegments(geometry, material);
    lines.frustumCulled = false;

    const fit = new THREE.Group();
    const tilt = new THREE.Group();
    const spin = new THREE.Group();
    tilt.rotation.set(0.55, 0.28, 0);
    spin.add(lines);
    tilt.add(spin);
    fit.add(tilt);
    scene.add(fit);

    const backdrop = makeBackdrop();
    scene.add(backdrop.mesh);

    const annotation = makeAnnotation();
    camera.add(annotation.sprite);
    scene.add(camera);

    state.renderer = renderer;
    state.scene = scene;
    state.camera = camera;
    state.fit = fit;
    state.tilt = tilt;
    state.spin = spin;
    state.lines = lines;
    state.material = material;
    state.backdrop = backdrop;
    state.annotation = annotation;
    state.baseOpacity = 0.115;
    state.geometry = geometry;

    layout(state);
  },
  draw(state, t) {
    const phase = (TAU * t) / DURATION;

    state.spin.rotation.z = -phase;
    state.tilt.rotation.x = 0.55 + 0.030 * Math.sin(phase + 0.8);
    state.tilt.rotation.y = 0.28 + 0.035 * Math.sin(2 * phase + 1.3);

    const breathe = 1 + 0.024 * Math.sin(phase) + 0.005 * Math.sin(2 * phase + 0.6);
    state.fit.scale.set(state.stretchX * breathe, state.stretchY * breathe, breathe);

    const physicalHeight = state.height * state.dpr;
    const opacityScale = Math.min(1.55, Math.max(1, Math.sqrt(physicalHeight / 720)));
    const pulse = 1 + 0.085 * Math.sin(phase + 1.7) + 0.030 * Math.sin(2 * phase + 0.4);
    state.material.opacity = state.baseOpacity * opacityScale * pulse;

    state.camera.position.set(
      0.018 * Math.sin(phase + 0.4),
      0.012 * Math.sin(2 * phase + 0.9),
      state.distance,
    );

    state.renderer.render(state.scene, state.camera);
  },
  onResize(state) {
    state.renderer.setPixelRatio(state.dpr);
    state.renderer.setSize(state.width, state.height, false);
    layout(state);
  },
});
