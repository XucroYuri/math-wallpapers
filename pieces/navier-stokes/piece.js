import { createWallpaper } from '../../shared/wallpaper.js';

const DURATION = 30;
const FPS = 30;
const SIM_HZ = 30;
const RES = 512;
const PRE_STEPS = 40;
const SOLVE_EVERY = 3;
const SOLVE_ITERS = 7;
const DEEP_EVERY = 90;
const DEEP_ITERS = 24;
const METRIC_EVERY = 6;
const OMEGA_CLAMP = 12.0;
const MAXW_BYTE_SCALE = 32.0;
const ENST_BYTE_SCALE = 12.0;
const MAXW_PLOT = 18.0;
const ENST_PLOT = 1.2;
const HUD_W = 168;
const HUD_H = 62;
const HUD_SCALE = 2;
const TAU = Math.PI * 2;
const debugView = new URLSearchParams(location.search).get('debug') === '1';

const VS = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const ADVECT_FWD_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uOmega;
uniform sampler2D uVel;
uniform vec2 uTexel;
uniform float uDt;
uniform float uTime;

const float TAU = 6.28318530718;

vec2 bgFlow(vec2 p, float t) {
  float a = 0.010;
  float ph1 = TAU * t / 15.0;
  float ph2 = TAU * t / 10.0;
  float ax = TAU * (p.x + 0.16 * sin(ph1));
  float ay = TAU * (2.0 * p.y + 0.20 * cos(ph2));
  return vec2(
    a * sin(ax) * cos(ay) * 2.0 * TAU,
    -a * cos(ax) * sin(ay) * TAU
  );
}

void main() {
  vec2 p = vUv;
  float stage = 0.16 + 0.84 * smoothstep(0.10, 0.36, p.x);
  vec2 u = texture(uVel, p).rg + bgFlow(p, uTime) * stage;
  vec2 src = p - u * uDt;
  fragColor = vec4(texture(uOmega, src).r, 0.0, 0.0, 1.0);
}`;

const ADVECT_COR_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uOmega;
uniform sampler2D uTmp;
uniform sampler2D uVel;
uniform vec2 uTexel;
uniform float uDt;
uniform float uTime;

const float TAU = 6.28318530718;

float envelope(float t, float t0, float w) {
  float z = (t - t0) / w;
  return exp(-0.5 * z * z);
}

float pairField(vec2 p, vec2 c, float ang, float sep, float sig, float amp) {
  vec2 q = p - c;
  float ca = cos(ang);
  float sa = sin(ang);
  q = vec2(ca * q.x + sa * q.y, -sa * q.x + ca * q.y);
  float d = 0.5 * sep;
  float ss = 2.0 * sig * sig;
  float g1 = exp(-((q.x - d) * (q.x - d) + 0.75 * q.y * q.y) / ss);
  float g2 = exp(-((q.x + d) * (q.x + d) + 0.75 * q.y * q.y) / ss);
  return amp * (g1 - g2);
}

float sheetField(vec2 p, vec2 c, float ang, float len, float wid, float amp) {
  vec2 q = p - c;
  float ca = cos(ang);
  float sa = sin(ang);
  q = vec2(ca * q.x + sa * q.y, -sa * q.x + ca * q.y);
  return amp * exp(-q.y * q.y / (2.0 * wid * wid)) * exp(-q.x * q.x / (2.0 * len * len));
}

vec2 bgFlow(vec2 p, float t) {
  float a = 0.010;
  float ph1 = TAU * t / 15.0;
  float ph2 = TAU * t / 10.0;
  float ax = TAU * (p.x + 0.16 * sin(ph1));
  float ay = TAU * (2.0 * p.y + 0.20 * cos(ph2));
  return vec2(
    a * sin(ax) * cos(ay) * 2.0 * TAU,
    -a * cos(ax) * sin(ay) * TAU
  );
}

float forcing(vec2 p, float t) {
  float f = 0.0;
  f += pairField(p, vec2(0.59, 0.33), 0.55 + 0.020 * t, 0.020, 0.009, 3.3) * envelope(t, 4.6, 0.70);
  f += sheetField(p, vec2(0.63, 0.46), 0.20 + 0.012 * t, 0.095, 0.0040, 6.0) * envelope(t, 8.4, 0.50);
  f += pairField(p, vec2(0.75, 0.62), 1.25 + 0.030 * t, 0.022, 0.010, 3.0) * envelope(t, 12.0, 0.70);
  f += sheetField(p, vec2(0.72, 0.52), 1.30 + 0.015 * t, 0.080, 0.0041, -5.4) * envelope(t, 16.0, 0.50);
  f += pairField(p, vec2(0.54, 0.58), 0.20 + 0.020 * t, 0.016, 0.008, 3.0) * envelope(t, 20.0, 0.65);
  f += pairField(p, vec2(0.80, 0.38), 1.70 + 0.020 * t, 0.020, 0.010, 3.3) * envelope(t, 24.4, 0.65);
  f += sheetField(p, vec2(0.68, 0.58), 0.75, 0.060, 0.0038, 2.7) * envelope(t, 26.8, 0.45);
  f += pairField(p, vec2(0.86, 0.52), 1.00, 0.014, 0.007, 0.50)
     * (0.5 + 0.5 * sin(TAU * t / 10.0));
  // Spin-up impulses, silent once the loop starts.
  f += pairField(p, vec2(0.57, 0.47), 0.80, 0.016, 0.0085, 2.7) * envelope(t, -1.05, 0.28);
  f += sheetField(p, vec2(0.70, 0.52), 0.70, 0.075, 0.0040, 4.5) * envelope(t, -0.55, 0.25);
  return f;
}

void main() {
  vec2 p = vUv;
  float stage = 0.16 + 0.84 * smoothstep(0.10, 0.36, p.x);
  vec2 u = texture(uVel, p).rg + bgFlow(p, uTime) * stage;
  vec2 fwd = p + u * uDt;

  float wHat = texture(uTmp, p).r;
  float wOld = texture(uOmega, p).r;
  float wBack = texture(uTmp, fwd).r;
  float w = wHat + 0.5 * (wOld - wBack);

  float left = 1.0 - smoothstep(0.075, 0.34, p.x);
  w *= 1.0 - uDt * (0.012 + 1.25 * left);
  w += forcing(p, uTime) * uDt;
  w = clamp(w, ${(-OMEGA_CLAMP).toFixed(1)}, ${OMEGA_CLAMP.toFixed(1)});
  fragColor = vec4(w, 0.0, 0.0, 1.0);
}`;

const POISSON_FS = `#version 300 es
precision highp float;
uniform sampler2D uPsi;
uniform sampler2D uOmega;
uniform int uRes;
out vec4 fragColor;

void main() {
  int n = uRes;
  ivec2 p = ivec2(gl_FragCoord.xy);
  float l = texelFetch(uPsi, ivec2((p.x - 1 + n) % n, p.y), 0).r;
  float r = texelFetch(uPsi, ivec2((p.x + 1) % n, p.y), 0).r;
  float b = texelFetch(uPsi, ivec2(p.x, (p.y - 1 + n) % n), 0).r;
  float t = texelFetch(uPsi, ivec2(p.x, (p.y + 1) % n), 0).r;
  float w = texelFetch(uOmega, p, 0).r;
  float next = 0.25 * (l + r + b + t) + 0.25 * w;
  fragColor = vec4(next, 0.0, 0.0, 1.0);
}`;

const VELOCITY_FS = `#version 300 es
precision highp float;
uniform sampler2D uPsi;
uniform int uRes;
out vec4 fragColor;

void main() {
  int n = uRes;
  ivec2 p = ivec2(gl_FragCoord.xy);
  float l = texelFetch(uPsi, ivec2((p.x - 1 + n) % n, p.y), 0).r;
  float r = texelFetch(uPsi, ivec2((p.x + 1) % n, p.y), 0).r;
  float b = texelFetch(uPsi, ivec2(p.x, (p.y - 1 + n) % n), 0).r;
  float t = texelFetch(uPsi, ivec2(p.x, (p.y + 1) % n), 0).r;
  float inv = 1.0 / (2.0 * float(n));
  fragColor = vec4((t - b) * inv, -(r - l) * inv, 0.0, 1.0);
}`;

const DISPLAY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uOmega;
uniform sampler2D uOmegaInit;
uniform vec2 uTexel;
uniform float uBlend;
uniform float uTime;
uniform float uDebug;

const float TAU = 6.28318530718;
const vec3 CYAN = vec3(0.494, 0.941, 0.831);
const vec3 MAGENTA = vec3(1.0, 0.435, 0.690);
const vec3 PURPLE = vec3(0.784, 0.635, 1.0);

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  float wCur = texture(uOmega, vUv).r;
  float wInit = texture(uOmegaInit, vUv).r;
  float w = mix(wCur, wInit, uBlend);

  float wc;
  float wr;
  vec2 o = uTexel * 4.0;
  if (uBlend > 0.5) {
    wc = wInit;
    wr = texture(uOmegaInit, vUv + vec2(o.x, 0.0)).r
       + texture(uOmegaInit, vUv - vec2(o.x, 0.0)).r
       + texture(uOmegaInit, vUv + vec2(0.0, o.y)).r
       + texture(uOmegaInit, vUv - vec2(0.0, o.y)).r;
  } else {
    wc = wCur;
    wr = texture(uOmega, vUv + vec2(o.x, 0.0)).r
       + texture(uOmega, vUv - vec2(o.x, 0.0)).r
       + texture(uOmega, vUv + vec2(0.0, o.y)).r
       + texture(uOmega, vUv - vec2(0.0, o.y)).r;
  }
  float wb = (wc + wr) * 0.2;

  float aw = abs(w);
  float line = smoothstep(0.10, 0.80, abs(wc - wb));
  float core = smoothstep(1.0, 4.8, aw) * 0.42;
  float halo = smoothstep(0.5, 2.8, abs(wb)) * 0.065;
  float side = clamp(w * 4.0, -1.0, 1.0);

  vec3 c = mix(MAGENTA, CYAN, 0.5 + 0.5 * side);
  c = mix(c, PURPLE, 0.34 * max(-side, 0.0) * (1.0 - core));
  float lum = 0.86 * line + core + halo;
  lum *= 0.10 + 0.90 * smoothstep(0.12, 0.38, vUv.x);

  vec3 bg = vec3(0.0196, 0.0275, 0.0392);
  float hz = exp(-(pow((vUv.x - 0.64) / 0.42, 2.0) + pow((vUv.y - 0.48) / 0.34, 2.0)));
  bg += hz * vec3(0.010, 0.022, 0.025);

  float breath = 0.92 + 0.08 * sin(TAU * uTime / 15.0);
  vec3 col = bg + c * lum * breath * 1.05;
  if (uDebug > 0.5) {
    float g = pow(clamp(abs(w) / 3.0, 0.0, 1.0), 0.75);
    col = vec3(0.004, 0.006, 0.008) + vec3(g);
  }
  float vig = clamp(length((vUv - 0.5) * vec2(1.02, 1.15)) * 1.22, 0.0, 1.0);
  col *= 0.94 + 0.06 * (1.0 - vig * vig);
  col += (hash21(gl_FragCoord.xy + vec2(3.7, 9.1)) - 0.5) * 0.0035;
  fragColor = vec4(col, 1.0);
}`;

const COPY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
out vec4 fragColor;
void main() {
  fragColor = texture(uTex, vUv);
}`;

const REDUCE_FIRST_FS = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
out vec4 fragColor;
void main() {
  ivec2 base = ivec2(gl_FragCoord.xy) * 4;
  float mx = 0.0;
  float ss = 0.0;
  for (int j = 0; j < 4; j++) {
    for (int i = 0; i < 4; i++) {
      float w = texelFetch(uSrc, base + ivec2(i, j), 0).r;
      mx = max(mx, abs(w));
      ss += w * w;
    }
  }
  fragColor = vec4(
    clamp(mx / ${MAXW_BYTE_SCALE.toFixed(1)}, 0.0, 1.0),
    clamp((ss / 16.0) / ${ENST_BYTE_SCALE.toFixed(1)}, 0.0, 1.0),
    0.0, 1.0);
}`;

const REDUCE_FS = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
out vec4 fragColor;
void main() {
  ivec2 base = ivec2(gl_FragCoord.xy) * 4;
  float mx = 0.0;
  float sg = 0.0;
  for (int j = 0; j < 4; j++) {
    for (int i = 0; i < 4; i++) {
      vec4 v = texelFetch(uSrc, base + ivec2(i, j), 0);
      mx = max(mx, v.r);
      sg += v.g;
    }
  }
  fragColor = vec4(mx, sg / 16.0, 0.0, 1.0);
}`;

const REDUCE2_FS = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
out vec4 fragColor;
void main() {
  ivec2 base = ivec2(gl_FragCoord.xy) * 2;
  float mx = 0.0;
  float sg = 0.0;
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < 2; i++) {
      vec4 v = texelFetch(uSrc, base + ivec2(i, j), 0);
      mx = max(mx, v.r);
      sg += v.g;
    }
  }
  fragColor = vec4(mx, sg / 4.0, 0.0, 1.0);
}`;

const HUD_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uHud;
uniform float uAlpha;
out vec4 fragColor;
void main() {
  fragColor = texture(uHud, vec2(vUv.x, 1.0 - vUv.y)) * uAlpha;
}`;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildInitialField() {
  const S = RES * RES;
  const psiS = new Float32Array(S);
  const omega = new Float32Array(S);

  for (let y = 0; y < RES; y++) {
    const py = (y + 0.5) / RES;
    for (let x = 0; x < RES; x++) {
      const px = (x + 0.5) / RES;
      let psi = 0.00130 * Math.sin(TAU * (px + 0.17)) * Math.sin(TAU * (py + 0.31));
      psi += 0.00055 * Math.sin(TAU * (2 * px + 0.62)) * Math.sin(TAU * (py + 0.05));
      psi += 0.00028 * Math.sin(TAU * (3 * px + 0.11)) * Math.sin(TAU * (2 * py + 0.74));
      psiS[y * RES + x] = psi * S;
    }
  }

  function addGauss(cx, cy, sx, sy, omegaPeak, ang) {
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const invx = 1 / (2 * sx * sx);
    const invy = 1 / (2 * sy * sy);
    const amp = omegaPeak / (1 / (sx * sx) + 1 / (sy * sy));
    const rad = Math.ceil(3.4 * Math.max(sx, sy) * RES);
    const cxPix = Math.floor(cx * RES);
    const cyPix = Math.floor(cy * RES);
    for (let j = cyPix - rad; j <= cyPix + rad; j++) {
      const dy = (j + 0.5) / RES - cy;
      const yy = ((j % RES) + RES) % RES;
      for (let i = cxPix - rad; i <= cxPix + rad; i++) {
        const dx = (i + 0.5) / RES - cx;
        const xx = ((i % RES) + RES) % RES;
        const rx = ca * dx + sa * dy;
        const ry = -sa * dx + ca * dy;
        psiS[yy * RES + xx] += amp * S * Math.exp(-(rx * rx * invx + ry * ry * invy));
      }
    }
  }

  function addEllipse(cx, cy, a, b, width, omegaPeak, ang) {
    const amp = omegaPeak * width * width;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const r0 = Math.max(a, b) + 3.4 * width;
    const rad = Math.ceil(r0 * RES);
    const cxPix = Math.floor(cx * RES);
    const cyPix = Math.floor(cy * RES);
    for (let j = cyPix - rad; j <= cyPix + rad; j++) {
      const dy = (j + 0.5) / RES - cy;
      const yy = ((j % RES) + RES) % RES;
      for (let i = cxPix - rad; i <= cxPix + rad; i++) {
        const dx = (i + 0.5) / RES - cx;
        const xx = ((i % RES) + RES) % RES;
        const rx = ca * dx + sa * dy;
        const ry = -sa * dx + ca * dy;
        const q = Math.sqrt((rx / a) * (rx / a) + (ry / b) * (ry / b)) - 1;
        const dist = q * (a + b) * 0.5;
        psiS[yy * RES + xx] += amp * S * Math.exp(-(dist * dist) / (2 * width * width));
      }
    }
  }

  const vortices = [
    [0.60, 0.35, 0.014, 0.014, 11.2, 0.2],
    [0.71, 0.57, 0.020, 0.011, -9.6, 0.7],
    [0.54, 0.55, 0.012, 0.012, 8.8, 0.4],
    [0.80, 0.44, 0.024, 0.009, 8.8, 0.1],
    [0.66, 0.71, 0.014, 0.014, -8.8, 0.9],
    [0.48, 0.64, 0.010, 0.010, -7.2, 0.3],
    [0.66, 0.45, 0.010, 0.010, 7.0, 0.0],
    [0.73, 0.55, 0.009, 0.009, -6.0, 0.6],
    [0.79, 0.47, 0.008, 0.008, 6.0, 0.2],
    [0.86, 0.62, 0.011, 0.011, -5.5, 0.4],
  ];
  for (const [x, y, sx, sy, w, a] of vortices) addGauss(x, y, sx, sy, w, a);

  const ridges = [
    [0.64, 0.48, 0.060, 0.0048, 12.8, 0.35],
    [0.72, 0.42, 0.045, 0.0050, -10.4, -0.55],
    [0.56, 0.66, 0.050, 0.0042, 9.6, 1.10],
    [0.79, 0.64, 0.040, 0.0040, -8.0, 0.20],
    [0.50, 0.43, 0.038, 0.0040, -7.6, 1.40],
    [0.84, 0.52, 0.034, 0.0038, 7.6, 1.75],
    [0.58, 0.42, 0.050, 0.0046, 9.0, -0.90],
    [0.69, 0.52, 0.044, 0.0044, -8.0, 0.95],
    [0.75, 0.48, 0.036, 0.0045, 7.0, 1.55],
    [0.62, 0.60, 0.055, 0.0048, -7.5, 0.05],
    [0.83, 0.58, 0.030, 0.0042, 6.5, -1.20],
    [0.48, 0.52, 0.032, 0.0044, 6.0, 0.70],
    [0.57, 0.30, 0.030, 0.0044, -6.0, 1.30],
    [0.68, 0.38, 0.040, 0.0045, 7.0, 0.10],
    [0.76, 0.55, 0.050, 0.0045, -6.0, -0.30],
    [0.88, 0.46, 0.040, 0.0040, 6.0, 1.40],
    [0.56, 0.36, 0.040, 0.0040, -5.5, -1.20],
    [0.60, 0.72, 0.050, 0.0045, 5.5, 0.20],
    [0.86, 0.68, 0.030, 0.0040, -5.0, 0.60],
    [0.52, 0.60, 0.040, 0.0040, 5.0, 1.50],
  ];
  for (const [x, y, sx, sy, w, a] of ridges) addGauss(x, y, sx, sy, w, a);

  addEllipse(0.70, 0.50, 0.085, 0.050, 0.0050, 7.0, 0.55);
  addEllipse(0.62, 0.55, 0.055, 0.035, 0.0045, -6.0, -0.35);

  let mean = 0;
  for (let i = 0; i < S; i++) mean += psiS[i];
  mean /= S;
  for (let i = 0; i < S; i++) psiS[i] -= mean;

  for (let y = 0; y < RES; y++) {
    const ym = (y - 1 + RES) % RES;
    const yp = (y + 1) % RES;
    for (let x = 0; x < RES; x++) {
      const xm = (x - 1 + RES) % RES;
      const xp = (x + 1) % RES;
      const c = psiS[y * RES + x];
      omega[y * RES + x] = 4 * c
        - psiS[y * RES + xm] - psiS[y * RES + xp]
        - psiS[ym * RES + x] - psiS[yp * RES + x];
    }
  }
  return { psi: psiS, omega };
}

function createGl(gl) {
  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error(`Shader compile failed: ${log}`);
    }
    return s;
  }

  const vs = compile(gl.VERTEX_SHADER, VS);

  function program(fsSource) {
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSource));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(`Program link failed: ${gl.getProgramInfoLog(p)}`);
    }
    p._locs = Object.create(null);
    return p;
  }

  function loc(p, name) {
    let l = p._locs[name];
    if (l === undefined) {
      l = gl.getUniformLocation(p, name);
      p._locs[name] = l;
    }
    return l;
  }

  function target(w, h, internal, format, type, filter, wrap) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Framebuffer incomplete: ${status} (${internal})`);
    }
    return { tex, fbo, w, h, internal, format, type };
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  return { program, loc, target, vao };
}

let sim = null;

createWallpaper({
  duration: DURATION,
  fps: FPS,
  context: 'webgl2',
  background: '#05070a',
  dprCap: 1,
  setup(state) {
    sim = initSimulation(state);
    sim.start();
  },
  draw(state, t) {
    if (sim) sim.frame(t);
  },
});

function initSimulation(state) {
  const gl = state.ctx;
  const canvas = state.canvas;
  if (!gl) throw new Error('WebGL2 context unavailable');
  const ext = gl.getExtension('EXT_color_buffer_float');
  if (!ext) throw new Error('EXT_color_buffer_float unavailable');

  const g = createGl(gl);
  const advectFwdP = g.program(ADVECT_FWD_FS);
  const advectCorP = g.program(ADVECT_COR_FS);
  const poissonP = g.program(POISSON_FS);
  const velocityP = g.program(VELOCITY_FS);
  const displayP = g.program(DISPLAY_FS);
  const copyP = g.program(COPY_FS);
  const reduceFirstP = g.program(REDUCE_FIRST_FS);
  const reduceP = g.program(REDUCE_FS);
  const reduce2P = g.program(REDUCE2_FS);
  const hudP = g.program(HUD_FS);

  const linear = gl.LINEAR;
  const nearest = gl.NEAREST;
  const repeat = gl.REPEAT;
  const clamp = gl.CLAMP_TO_EDGE;

  const omegaA = g.target(RES, RES, gl.R16F, gl.RED, gl.HALF_FLOAT, linear, repeat);
  const omegaB = g.target(RES, RES, gl.R16F, gl.RED, gl.HALF_FLOAT, linear, repeat);
  const omegaTmp = g.target(RES, RES, gl.R16F, gl.RED, gl.HALF_FLOAT, linear, repeat);
  const psiA = g.target(RES, RES, gl.R32F, gl.RED, gl.FLOAT, nearest, repeat);
  const psiB = g.target(RES, RES, gl.R32F, gl.RED, gl.FLOAT, nearest, repeat);
  const vel = g.target(RES, RES, gl.RG16F, gl.RG, gl.HALF_FLOAT, linear, repeat);
  const omegaInit = g.target(RES, RES, gl.R16F, gl.RED, gl.HALF_FLOAT, linear, repeat);
  const psiInit = g.target(RES, RES, gl.R32F, gl.RED, gl.FLOAT, nearest, repeat);

  const red128 = g.target(128, 128, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, nearest, clamp);
  const red32 = g.target(32, 32, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, nearest, clamp);
  const red8 = g.target(8, 8, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, nearest, clamp);
  const red2 = g.target(2, 2, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, nearest, clamp);
  const red1 = g.target(1, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, nearest, clamp);

  const hudCanvas = document.createElement('canvas');
  hudCanvas.width = HUD_W * HUD_SCALE;
  hudCanvas.height = HUD_H * HUD_SCALE;
  const hudCtx = hudCanvas.getContext('2d');
  const hudTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, hudTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, linear);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, linear);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, clamp);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, clamp);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, hudCanvas);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

  let omegaRead = omegaA;
  let omegaWrite = omegaB;
  let psiRead = psiA;
  let psiWrite = psiB;

  let step = 0;
  let solveTick = 0;
  let deepTick = 0;
  let metricKey = '';
  let hudWasEmpty = true;
  const metricT = [];
  const metricM = [];
  const metricE = [];
  const metricPx = new Uint8Array(4);
  const initial = buildInitialField();

  function bindTex(unit, name, p, tex) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(g.loc(p, name), unit);
  }

  function draw(target, p) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    if (target) gl.viewport(0, 0, target.w, target.h);
    else gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(p);
    gl.bindVertexArray(g.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function copy(srcTex, dst) {
    gl.useProgram(copyP);
    bindTex(0, 'uTex', copyP, srcTex);
    draw(dst, copyP);
  }

  function solvePhi(iters) {
    gl.useProgram(poissonP);
    for (let i = 0; i < iters; i++) {
      bindTex(0, 'uPsi', poissonP, psiRead.tex);
      bindTex(1, 'uOmega', poissonP, omegaRead.tex);
      gl.uniform1i(g.loc(poissonP, 'uRes'), RES);
      draw(psiWrite, poissonP);
      const swap = psiRead;
      psiRead = psiWrite;
      psiWrite = swap;
    }
  }

  function computeVelocity() {
    gl.useProgram(velocityP);
    bindTex(0, 'uPsi', velocityP, psiRead.tex);
    gl.uniform1i(g.loc(velocityP, 'uRes'), RES);
    draw(vel, velocityP);
  }

  function stepOnce(t) {
    gl.useProgram(advectFwdP);
    bindTex(0, 'uOmega', advectFwdP, omegaRead.tex);
    bindTex(1, 'uVel', advectFwdP, vel.tex);
    gl.uniform2f(g.loc(advectFwdP, 'uTexel'), 1 / RES, 1 / RES);
    gl.uniform1f(g.loc(advectFwdP, 'uDt'), 1 / SIM_HZ);
    gl.uniform1f(g.loc(advectFwdP, 'uTime'), t);
    draw(omegaTmp, advectFwdP);

    gl.useProgram(advectCorP);
    bindTex(0, 'uOmega', advectCorP, omegaRead.tex);
    bindTex(1, 'uTmp', advectCorP, omegaTmp.tex);
    bindTex(2, 'uVel', advectCorP, vel.tex);
    gl.uniform2f(g.loc(advectCorP, 'uTexel'), 1 / RES, 1 / RES);
    gl.uniform1f(g.loc(advectCorP, 'uDt'), 1 / SIM_HZ);
    gl.uniform1f(g.loc(advectCorP, 'uTime'), t);
    draw(omegaWrite, advectCorP);
    const swap = omegaRead;
    omegaRead = omegaWrite;
    omegaWrite = swap;

    solveTick++;
    if (solveTick >= SOLVE_EVERY) {
      solveTick = 0;
      solvePhi(SOLVE_ITERS);
      computeVelocity();
    }
    deepTick++;
    if (deepTick >= DEEP_EVERY) {
      deepTick = 0;
      solvePhi(DEEP_ITERS);
      computeVelocity();
    }
  }

  function reset() {
    copy(omegaInit.tex, omegaA);
    copy(omegaInit.tex, omegaB);
    copy(psiInit.tex, psiA);
    copy(psiInit.tex, psiB);
    omegaRead = omegaA;
    omegaWrite = omegaB;
    psiRead = psiA;
    psiWrite = psiB;
    solveTick = 0;
    deepTick = 0;
    step = 0;
    metricT.length = 0;
    metricM.length = 0;
    metricE.length = 0;
    metricKey = '';
    computeVelocity();
  }

  function measure() {
    gl.useProgram(reduceFirstP);
    bindTex(0, 'uSrc', reduceFirstP, omegaRead.tex);
    draw(red128, reduceFirstP);

    gl.useProgram(reduceP);
    bindTex(0, 'uSrc', reduceP, red128.tex);
    draw(red32, reduceP);
    bindTex(0, 'uSrc', reduceP, red32.tex);
    draw(red8, reduceP);
    bindTex(0, 'uSrc', reduceP, red8.tex);
    draw(red2, reduceP);

    gl.useProgram(reduce2P);
    bindTex(0, 'uSrc', reduce2P, red2.tex);
    draw(red1, reduce2P);

    gl.bindFramebuffer(gl.FRAMEBUFFER, red1.fbo);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, metricPx);
    metricT.push(step / SIM_HZ);
    metricM.push((metricPx[0] / 255) * MAXW_BYTE_SCALE);
    metricE.push((metricPx[1] / 255) * ENST_BYTE_SCALE);
  }

  function advanceTo(target) {
    if (target < step) reset();
    while (step < target) {
      stepOnce((step + 1) / SIM_HZ);
      step++;
      if (step % METRIC_EVERY === 0) measure();
    }
  }

  function loopBlend(t) {
    const u = (t - (DURATION - 2.6)) / 2.6;
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    return u * u * (3 - 2 * u);
  }

  function drawHud(t, alpha) {
    const key = `${step}:${metricT.length}:${t.toFixed(2)}`;
    if (key !== metricKey) {
      metricKey = key;
      renderHudCanvas(t);
      gl.bindTexture(gl.TEXTURE_2D, hudTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, hudCanvas);
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(hudP);
    const dpr = state.dpr;
    const wpx = Math.round(HUD_W * dpr);
    const hpx = Math.round(HUD_H * dpr);
    const margin = Math.round(16 * dpr);
    gl.viewport(canvas.width - wpx - margin, margin, wpx, hpx);
    bindTex(0, 'uHud', hudP, hudTex);
    gl.uniform1f(g.loc(hudP, 'uAlpha'), alpha);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.BLEND);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function renderHudCanvas(t) {
    const ctx = hudCtx;
    ctx.setTransform(HUD_SCALE, 0, 0, HUD_SCALE, 0, 0);
    ctx.clearRect(0, 0, HUD_W, HUD_H);

    const plotX = 5;
    const plotY = 15;
    const plotW = HUD_W - 10;
    const plotH = 24;
    const span = 10.0;
    const start = t - span;

    ctx.lineWidth = 1;

    ctx.strokeStyle = 'rgba(126, 240, 212, 0.10)';
    ctx.beginPath();
    ctx.moveTo(plotX, plotY + plotH);
    ctx.lineTo(plotX + plotW, plotY + plotH);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(200, 162, 255, 0.05)';
    ctx.beginPath();
    ctx.moveTo(plotX, plotY + plotH * 0.5);
    ctx.lineTo(plotX + plotW, plotY + plotH * 0.5);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(126, 240, 212, 0.16)';
    ctx.beginPath();
    ctx.moveTo(plotX + plotW - 0.5, plotY);
    ctx.lineTo(plotX + plotW - 0.5, plotY + plotH);
    ctx.stroke();

    const n = metricT.length;
    const xs = [];
    const mxs = [];
    const ens = [];
    for (let i = 0; i < n; i++) {
      const st = metricT[i];
      if (st < start) continue;
      xs.push(plotX + plotW * ((st - start) / span));
      mxs.push(plotY + plotH * (1 - Math.min(metricM[i] / MAXW_PLOT, 1)));
      ens.push(plotY + plotH * (1 - Math.min(metricE[i] / ENST_PLOT, 1)));
    }

    if (xs.length > 1) {
      ctx.strokeStyle = 'rgba(255, 111, 176, 0.30)';
      ctx.beginPath();
      for (let i = 0; i < xs.length; i++) {
        if (i === 0) ctx.moveTo(xs[i], ens[i]);
        else ctx.lineTo(xs[i], ens[i]);
      }
      ctx.stroke();

      ctx.strokeStyle = 'rgba(126, 240, 212, 0.58)';
      ctx.beginPath();
      for (let i = 0; i < xs.length; i++) {
        if (i === 0) ctx.moveTo(xs[i], mxs[i]);
        else ctx.lineTo(xs[i], mxs[i]);
      }
      ctx.stroke();

      const lx = xs[xs.length - 1];
      const ly = mxs[mxs.length - 1];
      ctx.fillStyle = 'rgba(126, 240, 212, 0.72)';
      ctx.fillRect(lx - 0.5, ly - 0.5, 1.2, 1.2);
    }

    ctx.font = '600 6px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx.fillStyle = 'rgba(126, 240, 212, 0.42)';
    ctx.fillText('‖ω‖∞', plotX, 9);
    ctx.fillStyle = 'rgba(255, 111, 176, 0.32)';
    ctx.fillText('enstrophy', plotX + 30, 9);
    ctx.fillStyle = 'rgba(200, 162, 255, 0.26)';
    ctx.fillText('3D N–S: blow-up? · 2D proxy', plotX, HUD_H - 4);

    if (n > 0) {
      ctx.fillStyle = 'rgba(126, 240, 212, 0.50)';
      ctx.textAlign = 'right';
      ctx.fillText(metricM[n - 1].toFixed(2), plotX + plotW, 9);
      ctx.textAlign = 'left';
    }
  }

  function start() {
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);

    gl.bindTexture(gl.TEXTURE_2D, psiA.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, RES, RES, 0, gl.RED, gl.FLOAT, initial.psi);
    gl.bindTexture(gl.TEXTURE_2D, omegaA.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, RES, RES, 0, gl.RED, gl.FLOAT, initial.omega);
    copy(psiA.tex, psiB);
    copy(omegaA.tex, omegaB);
    psiRead = psiA;
    psiWrite = psiB;
    omegaRead = omegaA;
    omegaWrite = omegaB;
    computeVelocity();

    for (let i = 0; i < PRE_STEPS; i++) {
      stepOnce((i + 1 - PRE_STEPS) / SIM_HZ);
    }
    solvePhi(DEEP_ITERS);
    computeVelocity();

    copy(omegaRead.tex, omegaInit);
    copy(psiRead.tex, psiInit);
    reset();

    metricKey = '';
    window.__ns = {
      metrics: () => ({ t: metricT.slice(), m: metricM.slice(), e: metricE.slice() }),
      getStep: () => step,
    };
  }

  function frame(t) {
    const target = Math.floor(t * SIM_HZ + 1e-7);
    advanceTo(target);

    const blend = loopBlend(t);
    gl.disable(gl.BLEND);
    gl.useProgram(displayP);
    bindTex(0, 'uOmega', displayP, omegaRead.tex);
    bindTex(1, 'uOmegaInit', displayP, omegaInit.tex);
    gl.uniform2f(g.loc(displayP, 'uTexel'), 1 / RES, 1 / RES);
    gl.uniform1f(g.loc(displayP, 'uBlend'), blend);
    gl.uniform1f(g.loc(displayP, 'uTime'), t);
    gl.uniform1f(g.loc(displayP, 'uDebug'), debugView ? 1 : 0);
    draw(null, displayP);

    const fade = Math.max(0, Math.min(1, Math.min(t / 1.4, (DURATION - t) / 1.4)));
    if (fade > 0.002) {
      drawHud(t, 0.92 * fade);
    }
  }

  return { start, frame };
}
