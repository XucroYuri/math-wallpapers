import * as THREE from '../../shared/vendor/three.module.js';
import { createWallpaper } from '../../shared/wallpaper.js';

const DURATION = 30;
const TAU = Math.PI * 2;
const COLS = 128;
const ROWS = 64;
const SPLIT_T = 21.7;

const PALETTE = {
  bg: '#05070a',
  teal: '#7ef0d4',
  purple: '#c8a2ff',
  amber: '#f0c674',
};

function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}

function smoothstep(a, b, x) {
  const u = clamp01((x - a) / (b - a));
  return u * u * (3 - 2 * u);
}

function window4(t, a, b, c, d) {
  return smoothstep(a, b, t) * (1 - smoothstep(c, d, t));
}

function mulberry32(seed) {
  return function random() {
    let a = (seed += 0x6d2b79f5);
    a = Math.imul(a ^ (a >>> 15), a | 1);
    a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
    return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
  };
}

/* Profile of the dumbbell surface of revolution, z in [-1, 1]. */
function radiusAt(z, t) {
  const pinch = neckPinchAt(t);
  const swell = smoothstep(0, 18, t) * (1 - smoothstep(21.5, 26.4, t));
  const breathe = 0.006 * Math.sin(TAU * t / DURATION);
  const lobeA = 0.560 + 0.020 * swell + breathe;
  const base = 0.055 - 0.012 * swell;
  const cap = Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(z), 8)));
  const lobe = Math.exp(-Math.pow((z - 0.47) / 0.285, 2))
    + Math.exp(-Math.pow((z + 0.47) / 0.285, 2));
  const neck = 1 - pinch * Math.exp(-Math.pow(z / 0.17, 2));
  return cap * (base + lobeA * lobe) * neck;
}

function neckPinchAt(t) {
  if (t < 21.55) {
    return 0.985 * Math.pow(smoothstep(1.5, 20.8, t), 1.85);
  }
  return 0.985 * (1 - smoothstep(22.2, 26.4, t));
}

function radiusDerivativeAt(z, t) {
  const h = 0.0025;
  return (radiusAt(z + h, t) - radiusAt(z - h, t)) / (2 * h);
}

createWallpaper({
  duration: DURATION,
  fps: 30,
  context: 'none',
  background: PALETTE.bg,
  dprCap: 2,
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
    renderer.setClearColor(PALETTE.bg, 1);
    state.renderer = renderer;

    const scene = new THREE.Scene();
    state.scene = scene;

    const camera = new THREE.PerspectiveCamera(36, state.width / state.height, 0.1, 80);
    state.camera = camera;

    const tilt = new THREE.Group();
    tilt.rotation.z = 0.085;
    scene.add(tilt);
    state.tilt = tilt;

    const spin = new THREE.Group();
    tilt.add(spin);
    state.spin = spin;

    const teal = new THREE.Color(PALETTE.teal);
    const purple = new THREE.Color(PALETTE.purple);
    const amber = new THREE.Color(PALETTE.amber);

    // Dumbbell: lathe-like grid with analytic outward normals.
    const colCount = COLS + 1;
    const rowCount = ROWS + 1;
    const vertCount = colCount * rowCount;
    const zRows = new Float32Array(rowCount);
    const cosCols = new Float32Array(colCount);
    const sinCols = new Float32Array(colCount);
    const rRows = new Float32Array(rowCount);
    const drRows = new Float32Array(rowCount);
    for (let j = 0; j < rowCount; j++) zRows[j] = -1 + (2 * j) / ROWS;
    for (let i = 0; i < colCount; i++) {
      const a = (i / COLS) * TAU;
      cosCols[i] = Math.cos(a);
      sinCols[i] = Math.sin(a);
    }

    const positions = new Float32Array(vertCount * 3);
    const normals = new Float32Array(vertCount * 3);
    const aZ = new Float32Array(vertCount);
    const aTheta = new Float32Array(vertCount);
    let p = 0;
    for (let j = 0; j < rowCount; j++) {
      for (let i = 0; i < colCount; i++) {
        aZ[p] = zRows[j];
        aTheta[p] = (i / COLS) * TAU;
        p++;
      }
    }

    const indices = new Uint16Array(COLS * ROWS * 6);
    let q = 0;
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        const a = j * colCount + i;
        const b = a + 1;
        const c = a + colCount;
        const d = c + 1;
        indices[q++] = a; indices[q++] = b; indices[q++] = c;
        indices[q++] = b; indices[q++] = d; indices[q++] = c;
      }
    }

    const dumbbellGeo = new THREE.BufferGeometry();
    dumbbellGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    dumbbellGeo.setAttribute('normal', new THREE.BufferAttribute(normals, 3).setUsage(THREE.DynamicDrawUsage));
    dumbbellGeo.setAttribute('aZ', new THREE.BufferAttribute(aZ, 1));
    dumbbellGeo.setAttribute('aTheta', new THREE.BufferAttribute(aTheta, 1));
    dumbbellGeo.setIndex(new THREE.BufferAttribute(indices, 1));

    const dumbbellUniforms = {
      uTeal: { value: teal },
      uPurple: { value: purple },
      uAmber: { value: amber },
      uWarm: { value: 0.55 },
      uGlow: { value: 0.1 },
      uAlpha: { value: 1 },
    };
    const dumbbellMat = new THREE.ShaderMaterial({
      uniforms: dumbbellUniforms,
      vertexShader: `
        attribute float aZ;
        attribute float aTheta;
        varying vec3 vNormalW;
        varying vec3 vWorldPos;
        varying float vZ;
        varying float vTheta;
        void main() {
          vNormalW = normalize(normalMatrix * normal);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          vZ = aZ;
          vTheta = aTheta;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uTeal;
        uniform vec3 uPurple;
        uniform vec3 uAmber;
        uniform float uWarm;
        uniform float uGlow;
        uniform float uAlpha;
        varying vec3 vNormalW;
        varying vec3 vWorldPos;
        varying float vZ;
        varying float vTheta;

        void main() {
          vec3 n = normalize(vNormalW);
          vec3 view = normalize(cameraPosition - vWorldPos);
          float facing = clamp(dot(n, view), 0.0, 1.0);
          vec3 keyDir = normalize(vec3(-0.52, 0.72, 0.86));
          float key = clamp(dot(n, keyDir), 0.0, 1.0);
          float shade = 0.06 + 0.34 * pow(facing, 0.85) + 0.34 * pow(key, 1.5);

          float nz = abs(vZ);
          float neck = exp(-pow(nz * 5.2, 2.0));
          float warm = clamp(uWarm * neck * 1.15, 0.0, 1.0);

          float sideMix = 0.10 + 0.52 * smoothstep(-0.6, 0.6, vZ);
          float ripple = 0.10 * (0.5 + 0.5 * sin(vTheta * 2.0 + vZ * 3.0 + 0.8));
          float mixCool = clamp(sideMix + ripple, 0.0, 0.72);
          vec3 cool = mix(uTeal, uPurple, mixCool);
          vec3 col = mix(cool, uAmber, warm);

          float tip = smoothstep(0.55, 0.98, nz);
          col *= (1.0 - 0.34 * tip);
          col *= shade * 0.72;
          col += uAmber * neck * uGlow * 0.48;

          float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = clamp(mix(vec3(luma), col, 1.28), 0.0, 1.0);

          gl_FragColor = vec4(col, uAlpha);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: true,
      depthTest: true,
      side: THREE.FrontSide,
    });
    const dumbbell = new THREE.Mesh(dumbbellGeo, dumbbellMat);
    dumbbell.rotation.y = Math.PI / 2;
    dumbbell.renderOrder = 0;
    spin.add(dumbbell);
    state.dumbbell = dumbbell;
    state.dumbbellUniforms = dumbbellUniforms;

    // Thin latitude/longitude lines laid just above the surface.
    const lineMeridians = 12;
    const lineParallels = [-0.84, -0.64, -0.44, -0.24, 0, 0.24, 0.44, 0.64, 0.84];
    const lineVertCount = lineMeridians * rowCount + lineParallels.length * colCount;
    const linePositions = new Float32Array(lineVertCount * 3);
    const lineColors = new Float32Array(lineVertCount * 3);
    const lineIndex = new Uint16Array(
      (lineMeridians * (rowCount - 1) + lineParallels.length * COLS) * 2
    );
    const lineCos = new Float32Array(lineMeridians);
    const lineSin = new Float32Array(lineMeridians);
    for (let i = 0; i < lineMeridians; i++) {
      const a = (i / lineMeridians) * TAU;
      lineCos[i] = Math.cos(a);
      lineSin[i] = Math.sin(a);
    }
    let li = 0, lv = 0;
    for (let m = 0; m < lineMeridians; m++) {
      for (let j = 0; j < rowCount - 1; j++) {
        lineIndex[li++] = m * rowCount + j;
        lineIndex[li++] = m * rowCount + j + 1;
      }
    }
    lv = lineMeridians * rowCount;
    for (let pc = 0; pc < lineParallels.length; pc++) {
      for (let i = 0; i < COLS; i++) {
        lineIndex[li++] = lv + i;
        lineIndex[li++] = lv + i + 1;
      }
      lv += colCount;
    }
    // Static cool line colors, warmed near the neck.
    const lc = new THREE.Color();
    p = 0;
    for (let m = 0; m < lineMeridians; m++) {
      for (let j = 0; j < rowCount; j++) {
        const z = zRows[j];
        lc.copy(teal).lerp(purple, 0.22 + 0.18 * Math.sin(m * 1.7));
        if (Math.abs(z) < 0.4) lc.lerp(amber, (1 - Math.abs(z) / 0.4) * 0.55);
        lineColors[p * 3] = lc.r; lineColors[p * 3 + 1] = lc.g; lineColors[p * 3 + 2] = lc.b;
        p++;
      }
    }
    for (let pc = 0; pc < lineParallels.length; pc++) {
      const z = lineParallels[pc];
      lc.copy(teal).lerp(purple, 0.2 + 0.12 * Math.cos(pc * 1.3));
      if (Math.abs(z) < 0.4) lc.lerp(amber, (1 - Math.abs(z) / 0.4) * 0.55);
      for (let i = 0; i < colCount; i++) {
        lineColors[p * 3] = lc.r; lineColors[p * 3 + 1] = lc.g; lineColors[p * 3 + 2] = lc.b;
        p++;
      }
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3).setUsage(THREE.DynamicDrawUsage));
    lineGeo.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));
    lineGeo.setIndex(new THREE.BufferAttribute(lineIndex, 1));
    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    });
    const lines = new THREE.LineSegments(lineGeo, lineMat);
    lines.rotation.y = Math.PI / 2;
    lines.renderOrder = 1;
    spin.add(lines);
    state.lines = lines;
    state.lineMat = lineMat;
    state.lineGeo = lineGeo;
    state.lineParallels = lineParallels;

    // Two spherical caps that remain after the surgery.
    const sphereGeo = new THREE.SphereGeometry(1, 48, 24);
    function makeSphereMaterial(inner) {
      const uniforms = {
        uTeal: { value: teal },
        uPurple: { value: purple },
        uAmber: { value: amber },
        uInner: { value: inner },
        uScar: { value: 0.5 },
        uAlpha: { value: 0 },
      };
      const mat = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: `
          varying vec3 vNormalW;
          varying vec3 vWorldPos;
          varying vec3 vLocal;
          varying vec2 vUv;
          void main() {
            vNormalW = normalize(normalMatrix * normal);
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            vLocal = position;
            vUv = uv;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: `
          uniform vec3 uTeal;
          uniform vec3 uPurple;
          uniform vec3 uAmber;
          uniform float uInner;
          uniform float uScar;
          uniform float uAlpha;
          varying vec3 vNormalW;
          varying vec3 vWorldPos;
          varying vec3 vLocal;
          varying vec2 vUv;

          void main() {
            vec3 n = normalize(vNormalW);
            vec3 view = normalize(cameraPosition - vWorldPos);
            float facing = clamp(dot(n, view), 0.0, 1.0);
            vec3 keyDir = normalize(vec3(-0.52, 0.72, 0.86));
            float key = clamp(dot(n, keyDir), 0.0, 1.0);
            float shade = 0.07 + 0.34 * pow(facing, 0.85) + 0.34 * pow(key, 1.5);

            float mixCool = clamp(0.34 - 0.20 * uInner + 0.12 * (0.5 + 0.5 * sin(vUv.x * 18.0 + vUv.y * 5.0)), 0.05, 0.75);
            vec3 cool = mix(uTeal, uPurple, mixCool);
            float inner = smoothstep(0.45, 0.94, vLocal.x * uInner);
            cool = mix(cool, uAmber, inner * uScar * 0.80);
            cool *= shade * 0.72;

            float du = min(fract(vUv.x * 12.0), 1.0 - fract(vUv.x * 12.0));
            float dv = min(fract(vUv.y * 8.0), 1.0 - fract(vUv.y * 8.0));
            float gu = 1.0 - smoothstep(0.0, 0.045, du);
            float gv = 1.0 - smoothstep(0.0, 0.045, dv);
            float grid = max(gu, gv) * pow(facing, 0.55) * 0.065;
            cool += mix(uTeal, vec3(1.0), 0.35) * grid;

            float luma = dot(cool, vec3(0.2126, 0.7152, 0.0722));
            cool = clamp(mix(vec3(luma), cool, 1.28), 0.0, 1.0);

            gl_FragColor = vec4(cool, uAlpha);
            #include <colorspace_fragment>
          }
        `,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        side: THREE.FrontSide,
      });
      return mat;
    }
    const sphereL = new THREE.Mesh(sphereGeo, makeSphereMaterial(1));
    const sphereR = new THREE.Mesh(sphereGeo, makeSphereMaterial(-1));
    sphereL.renderOrder = 2;
    sphereR.renderOrder = 2;
    sphereL.visible = false;
    sphereR.visible = false;
    tilt.add(sphereL, sphereR);
    state.sphereL = sphereL;
    state.sphereR = sphereR;

    // Neck glow, split flash and surgery ring.
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = 128; glowCanvas.height = 128;
    const gctx = glowCanvas.getContext('2d');
    const grad = gctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.18, 'rgba(255,255,255,0.75)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.18)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, 128, 128);
    const glowTex = new THREE.CanvasTexture(glowCanvas);
    glowTex.colorSpace = THREE.SRGBColorSpace;

    const auraMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: amber,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });
    const aura = new THREE.Sprite(auraMat);
    aura.renderOrder = 4;
    tilt.add(aura);
    state.aura = aura;
    state.auraMat = auraMat;

    const flashMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: new THREE.Color('#fff3d0'),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });
    const flash = new THREE.Sprite(flashMat);
    flash.renderOrder = 5;
    tilt.add(flash);
    state.flash = flash;
    state.flashMat = flashMat;

    const ringGeo = new THREE.TorusGeometry(1, 0.006, 8, 160);
    const ringMat = new THREE.MeshBasicMaterial({
      color: amber,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.y = Math.PI / 2;
    ring.renderOrder = 3;
    tilt.add(ring);
    state.ring = ring;
    state.ringMat = ringMat;

    // Small WebGL overlay for the tiny edge annotations, so they are also
    // present in captureStream recordings.
    const hudCanvas = document.createElement('canvas');
    hudCanvas.width = 512;
    hudCanvas.height = 144;
    const hudCtx = hudCanvas.getContext('2d');
    const hudTex = new THREE.CanvasTexture(hudCanvas);
    hudTex.colorSpace = THREE.SRGBColorSpace;
    hudTex.minFilter = THREE.LinearFilter;
    hudTex.magFilter = THREE.LinearFilter;
    const hudScene = new THREE.Scene();
    const hudCam = new THREE.OrthographicCamera(0, state.width, state.height, 0, 0.1, 100);
    hudCam.position.set(0, 0, 10);
    const hudPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: hudTex,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      })
    );
    hudScene.add(hudPlane);
    state.hud = {
      canvas: hudCanvas,
      ctx: hudCtx,
      texture: hudTex,
      scene: hudScene,
      camera: hudCam,
      plane: hudPlane,
    };

    buildBackgroundTexture(state);
    applyLayout(state);
    updateSurface(state, 0);
    renderAt(state, 0);

    function renderAt(st, t) {
      updateScene(st, t);
      drawHud(st, t);
      st.renderer.autoClear = true;
      st.renderer.render(st.scene, st.camera);
      st.renderer.autoClear = false;
      st.renderer.render(st.hud.scene, st.hud.camera);
      st.renderer.autoClear = true;
    }
    state.renderScene = renderAt;
  },
  draw(state, t) {
    state.renderScene(state, t);
  },
  onResize(state) {
    state.renderer.setPixelRatio(state.dpr);
    state.renderer.setSize(state.width, state.height, false);
    state.camera.aspect = state.width / state.height;
    state.camera.updateProjectionMatrix();
    buildBackgroundTexture(state);
    applyLayout(state);
  },
});

function applyLayout(state) {
  const w = state.width;
  const h = state.height;
  const hudCam = state.hud.camera;
  hudCam.left = 0;
  hudCam.right = w;
  hudCam.top = h;
  hudCam.bottom = 0;
  hudCam.updateProjectionMatrix();
  const hudW = 256;
  const hudH = 72;
  const marginX = Math.max(16, w * 0.028);
  const marginBottom = Math.max(14, h * 0.042);
  state.hud.plane.scale.set(hudW, hudH, 1);
  state.hud.plane.position.set(w - marginX - hudW / 2, marginBottom + hudH / 2, 0);
  state.layout = { w, h };
}

function buildBackgroundTexture(state) {
  const w = state.width;
  const h = state.height;
  const cw = Math.min(1280, Math.max(480, Math.round(w * 0.5)));
  const ch = Math.max(2, Math.round((cw * h) / w));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, cw, ch);

  const cx = cw * 0.60;
  const cy = ch * 0.49;
  const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(cw, ch) * 0.62);
  rg.addColorStop(0, 'rgba(21, 55, 61, 0.50)');
  rg.addColorStop(0.32, 'rgba(12, 30, 35, 0.28)');
  rg.addColorStop(0.7, 'rgba(7, 12, 16, 0.10)');
  rg.addColorStop(1, 'rgba(5, 7, 10, 0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, cw, ch);

  // Keep the left quarter quiet.
  const lg = ctx.createLinearGradient(0, 0, cw * 0.42, 0);
  lg.addColorStop(0, 'rgba(3, 5, 8, 0.78)');
  lg.addColorStop(0.55, 'rgba(3, 5, 8, 0.28)');
  lg.addColorStop(1, 'rgba(3, 5, 8, 0)');
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, cw, ch);

  const vg = ctx.createRadialGradient(cw * 0.55, ch * 0.5, Math.min(cw, ch) * 0.28,
    cw * 0.55, ch * 0.5, Math.max(cw, ch) * 0.78);
  vg.addColorStop(0, 'rgba(5, 7, 10, 0)');
  vg.addColorStop(1, 'rgba(3, 5, 8, 0.6)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, cw, ch);

  // Sparse dust, right side only, very low contrast.
  const rng = mulberry32(0x9e3779b9);
  for (let i = 0; i < 90; i++) {
    const x = (0.35 + 0.62 * rng()) * cw;
    const y = (0.08 + 0.84 * rng()) * ch;
    const a = 0.03 + 0.07 * rng();
    const rad = 0.35 + 0.85 * rng();
    ctx.fillStyle = `rgba(126, 240, 212, ${a})`;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, TAU);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  if (state.scene.background && state.scene.background.dispose) state.scene.background.dispose();
  state.scene.background = tex;
  state.bgTexture = tex;
}

function updateSurface(state, t) {
  const rowCount = ROWS + 1;
  const colCount = COLS + 1;
  const zRows = state.zRows || (state.zRows = new Float32Array(rowCount));
  const rRows = state.rRows || (state.rRows = new Float32Array(rowCount));
  const drRows = state.drRows || (state.drRows = new Float32Array(rowCount));
  const cosCols = state.cosCols || (state.cosCols = new Float32Array(colCount));
  const sinCols = state.sinCols || (state.sinCols = new Float32Array(colCount));
  if (!state.cosColsReady) {
    for (let j = 0; j < rowCount; j++) zRows[j] = -1 + (2 * j) / ROWS;
    for (let i = 0; i < colCount; i++) {
      const a = (i / COLS) * TAU;
      cosCols[i] = Math.cos(a);
      sinCols[i] = Math.sin(a);
    }
    state.cosColsReady = true;
  }

  for (let j = 0; j < rowCount; j++) {
    const z = zRows[j];
    rRows[j] = radiusAt(z, t);
    drRows[j] = radiusDerivativeAt(z, t);
  }

  const pos = state.dumbbell.geometry.attributes.position.array;
  const nrm = state.dumbbell.geometry.attributes.normal.array;
  let v = 0;
  for (let j = 0; j < rowCount; j++) {
    const z = zRows[j];
    const r = rRows[j];
    const dr = drRows[j];
    const inv = 1 / Math.sqrt(1 + dr * dr);
    for (let i = 0; i < colCount; i++) {
      const c = cosCols[i];
      const s = sinCols[i];
      pos[v * 3] = r * c;
      pos[v * 3 + 1] = r * s;
      pos[v * 3 + 2] = z;
      nrm[v * 3] = c * inv;
      nrm[v * 3 + 1] = s * inv;
      nrm[v * 3 + 2] = -dr * inv;
      v++;
    }
  }
  state.dumbbell.geometry.attributes.position.needsUpdate = true;
  state.dumbbell.geometry.attributes.normal.needsUpdate = true;

  // Latitude/longitude lines, lifted slightly off the surface.
  const lpos = state.lines.geometry.attributes.position.array;
  let lp = 0;
  for (let m = 0; m < 12; m++) {
    const cs = Math.cos((m / 12) * TAU);
    const sn = Math.sin((m / 12) * TAU);
    for (let j = 0; j < rowCount; j++) {
      const rr = rRows[j] + 0.004;
      lpos[lp * 3] = rr * cs;
      lpos[lp * 3 + 1] = rr * sn;
      lpos[lp * 3 + 2] = zRows[j];
      lp++;
    }
  }
  for (let pc = 0; pc < state.lineParallels.length; pc++) {
    const rr = radiusAt(state.lineParallels[pc], t) + 0.004;
    for (let i = 0; i < colCount; i++) {
      lpos[lp * 3] = rr * cosCols[i];
      lpos[lp * 3 + 1] = rr * sinCols[i];
      lpos[lp * 3 + 2] = state.lineParallels[pc];
      lp++;
    }
  }
  state.lines.geometry.attributes.position.needsUpdate = true;
}

function updateScene(state, t) {
  updateSurface(state, t);

  state.spin.rotation.x = 0.10 * Math.sin(TAU * t / DURATION + 0.4);

  const pinch = neckPinchAt(t);
  const glow = smoothstep(12, 20, t) * (1 - smoothstep(21.8, 24, t));
  const flash = Math.exp(-Math.pow((t - SPLIT_T) / 0.36, 2));
  const dumbbellAlpha = t <= 21.58
    ? 1
    : t < 21.78
      ? 1 - smoothstep(21.58, 21.78, t)
      : t < 27.8
        ? 0
        : smoothstep(27.8, 29.9, t);
  const sphereAlpha = smoothstep(21.58, 21.82, t) * (1 - smoothstep(26.8, 29.3, t));

  state.dumbbellUniforms.uWarm.value = 0.62 + 0.38 * glow;
  state.dumbbellUniforms.uGlow.value = 0.12 + 0.25 * glow + 0.55 * flash;
  state.dumbbellUniforms.uAlpha.value = dumbbellAlpha;
  const showDumbbell = dumbbellAlpha > 0.005;
  state.dumbbell.visible = showDumbbell;
  state.lines.visible = showDumbbell;
  state.lineMat.opacity = 0.14 * dumbbellAlpha;

  const spread = smoothstep(21.5, 27.5, t);
  const sep = 0.620 + 0.075 * spread;
  const rx = 0.570 + 0.020 * spread;
  const ry = 0.535 + 0.025 * spread;
  for (const [mesh, side] of [[state.sphereL, -1], [state.sphereR, 1]]) {
    const show = sphereAlpha > 0.005;
    mesh.visible = show;
    if (!show) continue;
    mesh.position.x = side * sep;
    mesh.scale.set(rx, ry, ry);
    mesh.material.uniforms.uAlpha.value = sphereAlpha;
    mesh.material.uniforms.uScar.value = 0.55 * (1 - smoothstep(22, 26, t));
  }

  // Warm aura around the neck before the break, then a brief flash.
  const auraAmt = window4(t, 14.5, 19.0, 21.6, 24.0);
  state.aura.visible = auraAmt > 0.01;
  state.auraMat.opacity = 0.18 * auraAmt;
  state.aura.scale.setScalar(0.45 + 0.40 * auraAmt);
  const flashAmt = flash * 1.0;
  state.flash.visible = flashAmt > 0.02;
  state.flashMat.opacity = 0.55 * flashAmt;
  state.flash.scale.setScalar(0.58 + 0.95 * flashAmt);

  const ringAmt = window4(t, 20.4, 21.6, 22.8, 24.2);
  state.ring.visible = ringAmt > 0.01;
  state.ringMat.opacity = 0.36 * ringAmt;
  const ringScale = 0.16 + 0.54 * smoothstep(20.4, 23.6, t);
  state.ring.scale.setScalar(ringScale);

  const cam = state.camera;
  const aspect = state.width / state.height;
  const fovRad = THREE.MathUtils.degToRad(cam.fov);
  const tanV = Math.tan(fovRad / 2);
  const tanH = tanV * aspect;
  const baseDist = 4.25 * Math.pow(1.777 / aspect, 0.32);
  const push = 1 + 0.032 * Math.cos(TAU * t / DURATION);
  const dist = baseDist * push;
  const az = 0.12 + 0.12 * Math.sin(TAU * t / DURATION - 0.2);
  const elev = 0.95 + 0.14 * Math.sin(TAU * t / DURATION + 0.9);
  cam.position.set(Math.sin(az) * dist, elev, Math.cos(az) * dist);
  const ndcShift = 0.19;
  const lookX = -ndcShift * tanH * dist;
  cam.lookAt(lookX, -0.06, 0);
}

function drawHud(state, t) {
  const texture = state.hud.texture;
  const ctx = state.hud.ctx;
  ctx.clearRect(0, 0, 512, 144);

  const neckAmt = window4(t, 5.5, 8, 20.6, 23.6);
  const surgeryAmt = window4(t, 20, 22.6, 27.2, 29.4);
  const rows = [
    ['Ricci flow', 0.25],
    ['neckpinch', 0.11 + 0.29 * neckAmt],
    ['surgery', 0.11 + 0.29 * surgeryAmt],
  ];
  ctx.font = '500 23px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  const x = 500;
  const ys = [44, 82, 120];
  for (let i = 0; i < rows.length; i++) {
    const [text, alpha] = rows[i];
    ctx.fillStyle = `rgba(126, 240, 212, ${Math.min(0.4, alpha).toFixed(3)})`;
    ctx.fillText(text, x, ys[i]);
  }
  texture.needsUpdate = true;
}
