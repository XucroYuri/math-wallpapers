import * as THREE from '../../shared/vendor/three.module.js';
import { createWallpaper } from '../../shared/wallpaper.js';

const DURATION = 30;
const TAU = Math.PI * 2;
const W = TAU / DURATION;

const BG = '#05070a';
const CYAN = '#7ef0d4';
const PURPLE = '#c8a2ff';
const AMBER = '#f0c674';

const N = 10;
const SPACING = 1.20;
const LINK_COUNT = 3 * N * N * (N - 1);

const R_MIN = 0.95;
const R_MAX = 2.55;
const TUBE_CENTER = new THREE.Vector3(0.55, 0.10, 0.12);

const FOV = 48;
const TARGET_Y = 0.05;

const FONT_STACK = '"DejaVu Sans Mono", "Liberation Mono", "Courier New", monospace';
const LABEL_FONT = 64;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

function hash32(x) {
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x = x ^ (x >>> 16);
  return x >>> 0;
}

function linkPhase(i, j, k, axis) {
  const h = hash32(
    Math.imul(i + 1, 73856093) ^
      Math.imul(j + 1, 19349663) ^
      Math.imul(k + 1, 83492791) ^
      Math.imul(axis + 1, 2654435761)
  );
  return (h / 4294967296) * TAU;
}

function createGlowTexture(rgb, innerAlpha) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(255, 255, 255, ${innerAlpha})`);
  g.addColorStop(0.16, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${innerAlpha * 0.72})`);
  g.addColorStop(0.48, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${innerAlpha * 0.16})`);
  g.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

function makeLabelTexture(text, rgb, alpha) {
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = `${LABEL_FONT}px ${FONT_STACK}`;
  const textWidth = Math.ceil(measure.measureText(text).width);
  const padX = 26;
  const padY = 14;
  const canvas = document.createElement('canvas');
  canvas.width = textWidth + padX * 2;
  canvas.height = LABEL_FONT + padY * 2;
  const ctx = canvas.getContext('2d');
  ctx.font = `${LABEL_FONT}px ${FONT_STACK}`;
  ctx.textBaseline = 'middle';

  ctx.save();
  ctx.shadowColor = 'rgba(5, 7, 10, 0.75)';
  ctx.shadowBlur = 22;
  ctx.fillStyle = 'rgba(5, 7, 10, 0.20)';
  ctx.fillRect(7, 7, canvas.width - 14, canvas.height - 14);
  ctx.restore();

  ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
  ctx.shadowColor = 'rgba(5, 7, 10, 0.85)';
  ctx.shadowBlur = 10;
  ctx.fillText(text, padX, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return { texture: tex, canvas };
}

function buildLattice() {
  const positions = new Float32Array(LINK_COUNT * 6);
  const colors = new Float32Array(LINK_COUNT * 6);

  const cyan = new THREE.Color(CYAN);
  const purple = new THREE.Color(PURPLE);
  const color = new THREE.Color();
  const half = (N - 1) / 2;
  const jitter = 0.05;

  const offsets = new Float32Array(N * N * N * 3);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      for (let k = 0; k < N; k++) {
        const base = ((i * N + j) * N + k) * 3;
        for (let c = 0; c < 3; c++) {
          const h = hash32(
            Math.imul(i + 1, 73856093) ^
              Math.imul(j + 1, 19349663) ^
              Math.imul(k + 1, 83492791) ^
              Math.imul(c + 1, 2654435761) ^
              0x9e3779b9
          );
          offsets[base + c] = (h / 4294967296 - 0.5) * 2 * jitter;
        }
      }
    }
  }

  const node = (i, j, k, out) => {
    const idx = ((i * N + j) * N + k) * 3;
    out[0] = (i - half) * SPACING + offsets[idx];
    out[1] = (j - half) * SPACING + offsets[idx + 1];
    out[2] = (k - half) * SPACING + offsets[idx + 2];
    return out;
  };

  const a = [0, 0, 0];
  const b = [0, 0, 0];
  let p = 0;
  for (let axis = 0; axis < 3; axis++) {
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        for (let k = 0; k < N; k++) {
          if ((axis === 0 && i === N - 1) || (axis === 1 && j === N - 1) || (axis === 2 && k === N - 1)) continue;

          const ni = i + (axis === 0 ? 1 : 0);
          const nj = j + (axis === 1 ? 1 : 0);
          const nk = k + (axis === 2 ? 1 : 0);
          node(i, j, k, a);
          node(ni, nj, nk, b);

          const phase = linkPhase(i, j, k, axis);
          const w = 0.5 + 0.5 * Math.sin(phase);
          const mix = clamp((w - 0.32) / 0.36, 0, 1);
          const bright = 0.20 + 0.60 * Math.pow(0.5 + 0.5 * Math.sin(phase * 1.7 + 0.8), 1.3);
          color.copy(cyan).lerp(purple, mix).multiplyScalar(bright);

          positions[p] = a[0];
          positions[p + 1] = a[1];
          positions[p + 2] = a[2];
          positions[p + 3] = b[0];
          positions[p + 4] = b[1];
          positions[p + 5] = b[2];
          p += 6;

          for (let v = 0; v < 2; v++) {
            colors[p - 6 + v * 3] = color.r;
            colors[p - 5 + v * 3] = color.g;
            colors[p - 4 + v * 3] = color.b;
          }
        }
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geo.computeBoundingSphere();

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: { value: 0.62 },
      uNear: { value: 1.10 },
      uExtent: { value: ((N - 1) * SPACING) / 2 },
    },
    vertexShader: `
      attribute vec3 aColor;
      varying vec3 vColor;
      varying vec3 vPos;
      varying float vViewZ;
      void main() {
        vColor = aColor;
        vPos = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewZ = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      uniform float uNear;
      uniform float uExtent;
      varying vec3 vColor;
      varying vec3 vPos;
      varying float vViewZ;
      void main() {
        float nearFade = smoothstep(uNear, uNear + 2.4, vViewZ);
        float farFade = exp(-pow(vViewZ * 0.135, 2.0));
        float edge = max(max(abs(vPos.x), abs(vPos.y)), abs(vPos.z)) / uExtent;
        float edgeFade = 1.0 - smoothstep(0.50, 0.98, edge);
        gl_FragColor = vec4(vColor, uOpacity * nearFade * farFade * edgeFade);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
  });

  const lines = new THREE.LineSegments(geo, mat);
  lines.renderOrder = 0;
  return lines;
}

function buildTubeGeometry(radialSegments = 22, lengthSegments = 56) {
  const positions = [];
  const indices = [];
  for (let i = 0; i <= lengthSegments; i++) {
    const s = i / lengthSegments;
    const profile = 0.72 + 0.28 * Math.pow(Math.sin(Math.PI * s), 0.45);
    for (let j = 0; j < radialSegments; j++) {
      const a = (j / radialSegments) * TAU;
      positions.push(s - 0.5, profile * Math.cos(a), profile * Math.sin(a));
    }
  }
  for (let i = 0; i < lengthSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * radialSegments + j;
      const b = i * radialSegments + ((j + 1) % radialSegments);
      const c = (i + 1) * radialSegments + j;
      const d = (i + 1) * radialSegments + ((j + 1) % radialSegments);
      indices.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

function buildModeGeometry(rings = 78, sides = 6) {
  const positions = new Float32Array((rings + 1) * sides * 3);
  const indices = [];
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * sides + j;
      const b = i * sides + ((j + 1) % sides);
      const c = (i + 1) * sides + j;
      const d = (i + 1) * sides + ((j + 1) % sides);
      indices.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return { geo, rings, sides, positions };
}

function makeGraphCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');
  const bg = ctx.createRadialGradient(330, 220, 20, 330, 220, 360);
  bg.addColorStop(0, 'rgba(5, 7, 10, 0.30)');
  bg.addColorStop(0.7, 'rgba(5, 7, 10, 0.16)');
  bg.addColorStop(1, 'rgba(5, 7, 10, 0)');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return { canvas, ctx, bg, tex };
}

function drawGraph(graph, t, ramp) {
  const { ctx, canvas, bg } = graph;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const x0 = 84;
  const x1 = 604;
  const y0 = 330;
  const y1 = 52;
  const gapY = y0 - 44;

  ctx.strokeStyle = 'rgba(170, 190, 210, 0.22)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x0, y1 - 8);
  ctx.lineTo(x0, y0);
  ctx.lineTo(x1, y0);
  ctx.stroke();

  ctx.setLineDash([7, 9]);
  ctx.strokeStyle = 'rgba(240, 198, 116, 0.20)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x0, gapY);
  ctx.lineTo(x1, gapY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = 'rgba(126, 240, 212, 0.40)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x0, gapY);
  ctx.lineTo(x1, y1);
  ctx.stroke();

  const dotX = x0 + ramp * (x1 - x0);
  const dotY = gapY + ramp * (y1 - gapY);
  ctx.setLineDash([3, 7]);
  ctx.strokeStyle = 'rgba(240, 198, 116, 0.12)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(dotX, dotY);
  ctx.lineTo(dotX, y0);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.shadowColor = 'rgba(240, 198, 116, 0.55)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = 'rgba(240, 198, 116, 0.72)';
  ctx.beginPath();
  ctx.arc(dotX, dotY, 6, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.font = `20px ${FONT_STACK}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(240, 198, 116, 0.38)';
  ctx.fillText('Δ', x0 - 38, gapY + 7);
  ctx.fillStyle = 'rgba(170, 190, 210, 0.24)';
  ctx.fillText('r', x1 - 4, y0 + 32);

  graph.tex.needsUpdate = true;
}

function buildOverlay(scene) {
  const gradient = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(BG) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          float leftFade = (1.0 - smoothstep(0.0, 0.28, vUv.x)) * 0.60;
          float topFade = smoothstep(0.80, 1.0, vUv.y) * 0.70;
          float rightFade = smoothstep(0.78, 1.0, vUv.x) * 0.45;
          gl_FragColor = vec4(uColor, max(max(leftFade, topFade), rightFade));
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
  );
  gradient.renderOrder = 0;
  scene.add(gradient);

  const labels = [
    {
      key: 'su3',
      mesh: null,
      tex: null,
      rgb: [126, 240, 212],
      alpha: 0.40,
      text: 'SU(3)',
    },
    {
      key: 'flux',
      mesh: null,
      tex: null,
      rgb: [126, 240, 212],
      alpha: 0.38,
      text: 'flux tube',
    },
    {
      key: 'gap',
      mesh: null,
      tex: null,
      rgb: [240, 198, 116],
      alpha: 0.40,
      text: 'mass gap Δ',
    },
    {
      key: 'energy',
      mesh: null,
      tex: null,
      rgb: [126, 240, 212],
      alpha: 0.38,
      text: 'E(r) ~ σr',
    },
  ];

  for (const label of labels) {
    const { texture, canvas } = makeLabelTexture(label.text, label.rgb, label.alpha);
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.renderOrder = 1;
    scene.add(mesh);
    label.mesh = mesh;
    label.canvas = canvas;
  }

  const graph = makeGraphCanvas();
  const graphMat = new THREE.MeshBasicMaterial({
    map: graph.tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const graphMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), graphMat);
  graphMesh.renderOrder = 2;
  scene.add(graphMesh);

  const leaderGeo = new THREE.BufferGeometry();
  leaderGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const leader = new THREE.Line(
    leaderGeo,
    new THREE.LineBasicMaterial({
      color: AMBER,
      transparent: true,
      opacity: 0.11,
      depthTest: false,
      depthWrite: false,
    })
  );
  leader.renderOrder = 0.5;
  leader.frustumCulled = false;
  scene.add(leader);

  return { gradient, labels, graph, graphMesh, leader };
}

createWallpaper({
  duration: DURATION,
  fps: 30,
  context: 'none',
  background: BG,

  setup(state) {
    const renderer = new THREE.WebGLRenderer({
      canvas: state.canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(state.dpr);
    renderer.setSize(state.width, state.height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);

    const camera = new THREE.PerspectiveCamera(FOV, state.width / state.height, 0.1, 60);
    camera.updateProjectionMatrix();

    const overlayScene = new THREE.Scene();
    const overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
    overlayCamera.position.set(0, 0, 10);
    overlayCamera.lookAt(0, 0, 0);
    overlayCamera.updateMatrixWorld();

    const lattice = buildLattice();
    lattice.rotation.set(0.04, 0.09, 0.02);
    scene.add(lattice);

    const tubeGeo = buildTubeGeometry();
    const shells = [
      { radial: 1.0, color: '#b98cff', opacity: 0.13, mesh: null },
      { radial: 0.58, color: CYAN, opacity: 0.38, mesh: null },
      { radial: 0.26, color: '#c4ffef', opacity: 0.92, mesh: null },
    ];
    const tubeGroup = new THREE.Group();
    tubeGroup.position.copy(TUBE_CENTER);
    for (const shell of shells) {
      const mat = new THREE.MeshBasicMaterial({
        color: shell.color,
        transparent: true,
        opacity: shell.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
        side: THREE.FrontSide,
      });
      const mesh = new THREE.Mesh(tubeGeo, mat);
      mesh.renderOrder = 1;
      tubeGroup.add(mesh);
      shell.mesh = mesh;
    }
    scene.add(tubeGroup);

    const mode = buildModeGeometry();
    const modeMat = new THREE.MeshBasicMaterial({
      color: AMBER,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    });
    const modeMesh = new THREE.Mesh(mode.geo, modeMat);
    modeMesh.frustumCulled = false;
    modeMesh.renderOrder = 2;
    modeMesh.position.copy(TUBE_CENTER);
    scene.add(modeMesh);

    const glowTexCyan = createGlowTexture([126, 240, 212], 0.95);
    const glowTexPurple = createGlowTexture([200, 162, 255], 0.9);
    const quarkMats = [
      new THREE.SpriteMaterial({
        map: glowTexCyan,
        transparent: true,
        opacity: 0.58,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
        toneMapped: false,
      }),
      new THREE.SpriteMaterial({
        map: glowTexPurple,
        transparent: true,
        opacity: 0.52,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
        toneMapped: false,
      }),
    ];
    const quarks = [new THREE.Sprite(quarkMats[0]), new THREE.Sprite(quarkMats[1])];
    for (const q of quarks) {
      q.scale.set(0.13, 0.13, 1);
      q.renderOrder = 3;
      scene.add(q);
    }

    const gapTex = createGlowTexture([240, 198, 116], 1.0);
    const gapMat = new THREE.SpriteMaterial({
      map: gapTex,
      transparent: true,
      opacity: 0.68,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
    });
    const gapMarker = new THREE.Sprite(gapMat);
    gapMarker.scale.set(0.068, 0.068, 1);
    gapMarker.renderOrder = 4;
    scene.add(gapMarker);

    const overlay = buildOverlay(overlayScene);

    const tmp = new THREE.Vector3();
    const labelPos = new THREE.Vector2();
    const tubeAnchor = new THREE.Vector3();
    const antinode = new THREE.Vector3();
    let aspect = state.width / state.height;

    function applySize(s) {
      aspect = s.width / s.height;
      renderer.setPixelRatio(s.dpr);
      renderer.setSize(s.width, s.height, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      overlayCamera.left = -aspect;
      overlayCamera.right = aspect;
      overlayCamera.top = 1;
      overlayCamera.bottom = -1;
      overlayCamera.updateProjectionMatrix();
      overlay.gradient.scale.set(aspect * 2, 2, 1);
    }
    applySize(state);

    function projectAnchor(world, dxPx, dyPx) {
      tmp.copy(world).project(camera);
      const u = 2 / state.height;
      labelPos.set(tmp.x * aspect + dxPx * u, tmp.y + dyPx * u);
      return labelPos;
    }

    function placeLabel(label, x, y, fontPx) {
      const uh = (label.canvas.height / LABEL_FONT) * fontPx * (2 / state.height);
      const uw = uh * (label.canvas.width / label.canvas.height);
      label.mesh.scale.set(uw, uh, 1);
      label.mesh.position.set(x, y, 0.15);
      return { w: uw, h: uh };
    }

    function updateLabelSizes(height) {
      return clamp(height * 0.017, 10, 14);
    }

    function updateCamera(t) {
      aspect = state.width / state.height;
      const rampRaw = 0.5 - 0.5 * Math.cos(W * t);
      const ramp = Math.pow(rampRaw, 0.72);
      const dist = 4.95 + 0.15 * Math.cos(W * t);
      const az = 0.36 + 0.16 * Math.sin(W * t);
      const el = 0.30 + 0.045 * Math.sin(W * t + 1.2);
      const halfH = Math.tan((FOV * Math.PI) / 360) * dist;
      const halfW = halfH * aspect;
      const tx = TUBE_CENTER.x - 0.28 * halfW;
      const ty = TARGET_Y;
      const tz = 0.0;
      camera.position.set(
        tx + dist * Math.sin(az) * Math.cos(el),
        ty + dist * Math.sin(el),
        tz + dist * Math.cos(az) * Math.cos(el)
      );
      camera.lookAt(tx, ty, tz);
      camera.updateMatrixWorld();
      return { ramp };
    }

    const stateRefs = { renderer, scene, camera, overlayScene, overlayCamera, overlay, shells, mode, modeMesh, quarks, gapMarker, tubeGroup, graph: overlay.graph };

    state.ym = stateRefs;

    state.ym.draw = (t) => {
      const { ramp } = updateCamera(t);

      const sep = R_MIN + (R_MAX - R_MIN) * ramp;
      const radius = 0.046 + 0.070 * (1 - ramp);
      const energy = 0.45 + 0.55 * ramp;

      for (const shell of shells) {
        shell.mesh.scale.set(sep, radius * shell.radial, radius * shell.radial);
        shell.mesh.material.opacity = shell.opacity * energy;
      }

      const qx = sep / 2;
      quarks[0].position.set(TUBE_CENTER.x - qx, TUBE_CENTER.y, TUBE_CENTER.z);
      quarks[1].position.set(TUBE_CENTER.x + qx, TUBE_CENTER.y, TUBE_CENTER.z);

      const modeAmp = (0.060 + radius * 0.90) * Math.cos(W * t + 2.0);
      const modeZ = modeAmp * 0.24 * Math.cos(W * t + 1.1);
      const rMode = 0.018 + radius * 0.10;
      const arr = mode.positions;
      const rings = mode.rings;
      const sides = mode.sides;
      let idx = 0;
      for (let i = 0; i <= rings; i++) {
        const s = i / rings;
        const env = Math.sin(Math.PI * s);
        const cx = (s - 0.5) * sep;
        const cy = modeAmp * env;
        const cz = modeZ * env;
        for (let j = 0; j < sides; j++) {
          const a = (j / sides) * TAU;
          arr[idx++] = cx;
          arr[idx++] = cy + rMode * Math.cos(a);
          arr[idx++] = cz + rMode * Math.sin(a);
        }
      }
      mode.geo.attributes.position.needsUpdate = true;

      gapMarker.position.set(TUBE_CENTER.x, TUBE_CENTER.y + modeAmp, TUBE_CENTER.z + modeZ);

      drawGraph(overlay.graph, t, ramp);

      const fontPx = updateLabelSizes(state.height);
      const u = 2 / state.height;

      const su = overlay.labels[0];
      {
        const uh = (su.canvas.height / LABEL_FONT) * fontPx * u;
        const uw = uh * (su.canvas.width / su.canvas.height);
        const marginX = state.width * 0.035 * u;
        const marginY = state.height * 0.065 * u;
        placeLabel(su, aspect - marginX - uw / 2, 1 - marginY - uh / 2, fontPx);
      }

      const flux = overlay.labels[1];
      {
        tubeAnchor.set(TUBE_CENTER.x + 0.30 * sep, TUBE_CENTER.y, TUBE_CENTER.z);
        const pos = projectAnchor(tubeAnchor, 16, 28);
        const uh = (flux.canvas.height / LABEL_FONT) * fontPx * u;
        const uw = uh * (flux.canvas.width / flux.canvas.height);
        placeLabel(flux, pos.x + uw / 2 + 12 * u, pos.y + uh / 2 + 9 * u, fontPx);
      }

      const gap = overlay.labels[2];
      {
        antinode.set(TUBE_CENTER.x, TUBE_CENTER.y, TUBE_CENTER.z);
        const pos = projectAnchor(antinode, 0, 0);
        const ax = pos.x;
        const ay = pos.y;
        const dxPx = state.height * 0.012;
        const dyPx = -state.height * 0.050;
        const uh = (gap.canvas.height / LABEL_FONT) * fontPx * u;
        const uw = uh * (gap.canvas.width / gap.canvas.height);
        const lx = ax + dxPx * u + uw / 2 + 9 * u;
        const ly = ay + dyPx * u - uh / 2 - 9 * u;
        placeLabel(gap, lx, ly, fontPx);

        const lead = overlay.leader.geometry.attributes.position;
        lead.setXYZ(0, lx - uw / 2 + 5 * u, ly + uh / 2 + 2 * u, 0.1);
        lead.setXYZ(1, ax, ay, 0.1);
        lead.needsUpdate = true;
      }

      const gh = state.height * 0.19 * u;
      const gw = gh * (overlay.graph.canvas.width / overlay.graph.canvas.height);
      const graphMarginX = state.width * 0.032 * u;
      const graphMarginY = state.height * 0.055 * u;
      const graphX = aspect - graphMarginX - gw / 2;
      const graphY = -1 + graphMarginY + gh / 2;
      overlay.graphMesh.scale.set(gw, gh, 1);
      overlay.graphMesh.position.set(graphX, graphY, 0.2);

      const energyLabel = overlay.labels[3];
      {
        const uh = (energyLabel.canvas.height / LABEL_FONT) * fontPx * u;
        const uw = uh * (energyLabel.canvas.width / energyLabel.canvas.height);
        const graphLeft = graphX - gw / 2;
        const graphTop = graphY + gh / 2;
        placeLabel(energyLabel, graphLeft + uw / 2, graphTop + uh / 2 + 8 * u, fontPx);
      }

      renderer.render(scene, camera);
      renderer.autoClear = false;
      renderer.render(overlayScene, overlayCamera);
      renderer.autoClear = true;
    };

    drawGraph(overlay.graph, 0, 0);
  },

  draw(state, t) {
    state.ym.draw(t);
  },

  onResize(state) {
    const ym = state.ym;
    if (!ym) return;
    const renderer = ym.renderer;
    const aspect = state.width / state.height;
    renderer.setPixelRatio(state.dpr);
    renderer.setSize(state.width, state.height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    ym.camera.aspect = aspect;
    ym.camera.updateProjectionMatrix();
    ym.overlayCamera.left = -aspect;
    ym.overlayCamera.right = aspect;
    ym.overlayCamera.top = 1;
    ym.overlayCamera.bottom = -1;
    ym.overlayCamera.updateProjectionMatrix();
    ym.overlay.gradient.scale.set(aspect * 2, 2, 1);
  },
});
