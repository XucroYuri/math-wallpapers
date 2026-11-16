import * as THREE from '../../shared/vendor/three.module.js';
import { createWallpaper } from '../../shared/wallpaper.js';

const DURATION = 36;
const BG = '#05070a';
const TEAL = '#7ef0d4';
const PURPLE = '#c8a2ff';
const AMBER = '#f0c674';

const TREE_R = 100;
const NODE_CAP = 150000;
const DEPTH_SINK = 5;
const TWO_PI = Math.PI * 2;

const TRAJECTORY_SPECS = [
  { seed: 27, theta: -1.10, wind: 1.45, delay: 2.0, span: 29.5, height: 18 },
  { seed: 97, theta: 1.05, wind: -1.90, delay: 3.0, span: 28.5, height: 20 },
  { seed: 871, theta: 2.30, wind: 1.25, delay: 1.2, span: 31.0, height: 18 },
];

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* Reverse Collatz tree: from 1, edges n -> 2n and n -> (n-1)/3. */
function generateTree() {
  const values = new Float64Array(NODE_CAP);
  const depths = new Uint16Array(NODE_CAP);
  const parents = new Int32Array(NODE_CAP);
  const childA = new Int32Array(NODE_CAP).fill(-1);
  const childB = new Int32Array(NODE_CAP).fill(-1);
  const trunk = new Uint8Array(NODE_CAP);
  const seen = new Set();

  let count = 1;
  values[0] = 1;
  parents[0] = -1;
  trunk[0] = 1;
  seen.add(1);

  let head = 0;
  let maxDepth = 0;

  const push = (parent, value) => {
    if (count >= NODE_CAP || seen.has(value)) return false;
    if (childA[parent] >= 0 && childB[parent] >= 0) return false;
    const id = count++;
    values[id] = value;
    depths[id] = depths[parent] + 1;
    parents[id] = parent;
    seen.add(value);
    if (childA[parent] < 0) childA[parent] = id;
    else childB[parent] = id;
    if (depths[id] > maxDepth) maxDepth = depths[id];
    return true;
  };

  while (head < count && count < NODE_CAP) {
    const i = head++;
    const n = values[i];
    const doubled = push(i, n * 2);
    if (n % 6 === 4) push(i, (n - 1) / 3);
    if (trunk[i] && doubled) trunk[childA[i]] = 1;
  }

  return { values, depths, parents, childA, childB, trunk, count, maxDepth };
}

/* Deterministic radial layout: wedge size follows subtree mass, depth gives radius. */
function layoutTree(tree) {
  const { depths, parents, childA, childB, trunk, count, maxDepth } = tree;
  const sub = new Uint32Array(count).fill(1);
  for (let i = count - 1; i > 0; i--) sub[parents[i]] += sub[i];

  const start = new Float32Array(count);
  const end = new Float32Array(count);
  start[0] = 0;
  end[0] = TWO_PI;

  const angle = new Float32Array(count);
  const radius = new Float32Array(count);
  const height = new Float32Array(count);

  const WEIGHT_EXP = 0.72;
  const TWIST = 0.046;

  for (let i = 0; i < count; i++) {
    const span = end[i] - start[i];
    let a;
    if (span >= TWO_PI - 1e-4) a = TWIST * depths[i];
    else a = (start[i] + end[i]) * 0.5 + TWIST * depths[i];
    angle[i] = a;

    const f = depths[i] / maxDepth;
    radius[i] = TREE_R * Math.pow(f, 0.66);
    height[i] = -DEPTH_SINK * Math.pow(f, 1.55);

    const ca = childA[i];
    const cb = childB[i];
    if (ca < 0) continue;
    if (cb < 0) {
      start[ca] = start[i];
      end[ca] = end[i];
    } else {
      const wa = Math.pow(sub[ca], WEIGHT_EXP);
      const wb = Math.pow(sub[cb], WEIGHT_EXP);
      const split = start[i] + span * (wa / (wa + wb));
      start[ca] = start[i];
      end[ca] = split;
      start[cb] = split;
      end[cb] = end[i];
    }
  }

  return { angle, radius, height };
}

function collatzPath(seed) {
  const seq = [seed];
  let n = seed;
  while (n !== 1) {
    n = n % 2 === 0 ? n / 2 : 3 * n + 1;
    seq.push(n);
  }
  return seq;
}

function buildTrajectory(spec, root) {
  const seq = collatzPath(spec.seed);
  const steps = seq.length - 1;
  const lgMax = Math.log2(Math.max(...seq));
  const nPts = seq.length;
  const positions = new Float32Array(nPts * 3);
  const dist = new Float32Array(nPts);
  const colors = new Float32Array(nPts * 3);

  const cStart = new THREE.Color(AMBER);
  const cEnd = new THREE.Color(TEAL);
  const tmp = new THREE.Color();

  for (let i = 0; i < nPts; i++) {
    const p = i / (nPts - 1);
    const base = 1.04 * TREE_R * Math.pow(1 - p, 0.9);
    const hail = 0.1 * TREE_R * Math.sin(Math.PI * p) * (Math.log2(seq[i]) / lgMax);
    const r = base + hail;
    const a = spec.theta + spec.wind * Math.pow(p, 1.15);
    const y = spec.height * Math.pow(1 - p, 1.35);
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = Math.sin(a) * r;
    dist[i] = p;

    tmp.copy(cStart).lerp(cEnd, p * p);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aDist', new THREE.BufferAttribute(dist, 1));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  return { ...spec, seq, steps, geometry, nPts, headPos: new THREE.Vector3(), progress: 0 };
}

function radialTexture(inner, outer, stops) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

function createTextMesh(text, { size = 11, color = TEAL, opacity = 0.32 } = {}) {
  const scale = 2;
  const font = `${Math.round(size * scale)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = font;
  const textW = measure.measureText(text).width;
  const pad = 4 * scale;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(textW + pad * 2);
  canvas.height = Math.ceil(20 * scale);
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, pad, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;

  const w = canvas.width / scale;
  const h = canvas.height / scale;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity,
      depthTest: false,
      depthWrite: false,
    }),
  );
  mesh.userData.size = { w, h };
  return mesh;
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
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(state.dpr);
    renderer.setSize(state.width, state.height, false);
    renderer.setClearColor(BG, 1);
    renderer.autoClear = true;
    state.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);
    scene.fog = new THREE.FogExp2(BG, 0.00155);
    state.scene = scene;

    const camera = new THREE.PerspectiveCamera(38, state.width / state.height, 1, 1600);
    state.camera = camera;

    const root = new THREE.Group();
    scene.add(root);
    state.root = root;

    /* base glow under the canopy */
    const glowTex = radialTexture(0, 1, [
      [0, 'rgba(126,240,212,0.55)'],
      [0.35, 'rgba(126,240,212,0.16)'],
      [0.7, 'rgba(80,120,200,0.03)'],
      [1, 'rgba(0,0,0,0)'],
    ]);
    const floorGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(430, 430),
      new THREE.MeshBasicMaterial({
        map: glowTex,
        transparent: true,
        opacity: 0.045,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    floorGlow.rotation.x = -Math.PI / 2;
    floorGlow.position.y = -DEPTH_SINK - 2;
    root.add(floorGlow);

    const tree = generateTree();
    state.tree = tree;
    const layout = layoutTree(tree);

    const edgeCount = tree.count - 1;
    const positions = new Float32Array(edgeCount * 6);
    const colors = new Float32Array(edgeCount * 6);
    const nodeColor = new Float32Array(tree.count * 3);

    const teal = new THREE.Color(TEAL);
    const purple = new THREE.Color(PURPLE);
    const amber = new THREE.Color(AMBER);
    const tmp = new THREE.Color();

    for (let i = 0; i < tree.count; i++) {
      const f = tree.depths[i] / tree.maxDepth;
      tmp.copy(teal).lerp(purple, smoothstep(0.06, 0.58, f));
      let intensity = 0.004 + 0.88 * Math.pow(1 - f, 2.1);
      if (tree.trunk[i]) {
        tmp.copy(teal);
        intensity = 0.18 + 0.62 * Math.pow(1 - f, 0.6);
      }
      if (i === 0) {
        tmp.copy(amber);
        intensity = 0.55;
      }
      tmp.multiplyScalar(intensity);
      nodeColor[i * 3] = tmp.r;
      nodeColor[i * 3 + 1] = tmp.g;
      nodeColor[i * 3 + 2] = tmp.b;
    }

    for (let i = 1; i < tree.count; i++) {
      const p = tree.parents[i];
      const a = layout.angle[p];
      const b = layout.angle[i];
      const rp = layout.radius[p];
      const rc = layout.radius[i];
      const hp = layout.height[p];
      const hc = layout.height[i];
      const o = (i - 1) * 6;

      positions[o] = Math.cos(a) * rp;
      positions[o + 1] = hp;
      positions[o + 2] = Math.sin(a) * rp;
      positions[o + 3] = Math.cos(b) * rc;
      positions[o + 4] = hc;
      positions[o + 5] = Math.sin(b) * rc;

      colors[o] = nodeColor[p * 3];
      colors[o + 1] = nodeColor[p * 3 + 1];
      colors[o + 2] = nodeColor[p * 3 + 2];
      colors[o + 3] = nodeColor[i * 3];
      colors[o + 4] = nodeColor[i * 3 + 1];
      colors[o + 5] = nodeColor[i * 3 + 2];
    }

    const treeGeo = new THREE.BufferGeometry();
    treeGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    treeGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    treeGeo.computeBoundingSphere();

    const treeMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.64,
      depthWrite: false,
    });
    const treeLines = new THREE.LineSegments(treeGeo, treeMat);
    root.add(treeLines);
    state.treeLines = treeLines;

    /* additive lift on the readable inner canopy */
    const innerDepth = Math.min(32, tree.maxDepth);
    let innerNodes = 0;
    for (let i = 0; i < tree.count; i++) {
      if (tree.depths[i] <= innerDepth) innerNodes++;
    }
    const innerGeo = new THREE.BufferGeometry();
    innerGeo.setAttribute('position', treeGeo.attributes.position);
    innerGeo.setAttribute('color', treeGeo.attributes.color);
    innerGeo.setDrawRange(0, Math.max(0, innerNodes - 1) * 2);
    const innerMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.26,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const innerLines = new THREE.LineSegments(innerGeo, innerMat);
    root.add(innerLines);

    /* three highlighted hailstone paths */
    const glowTexture = radialTexture(0, 1, [
      [0, 'rgba(255,255,255,1)'],
      [0.16, 'rgba(255,236,190,0.92)'],
      [0.42, 'rgba(240,198,116,0.34)'],
      [0.75, 'rgba(126,240,212,0.08)'],
      [1, 'rgba(0,0,0,0)'],
    ]);

    const trajectoryGroup = new THREE.Group();
    root.add(trajectoryGroup);
    state.trajectories = [];

    for (const spec of TRAJECTORY_SPECS) {
      const tj = buildTrajectory(spec, root);

      const staticMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const staticLine = new THREE.Line(tj.geometry, staticMat);
      trajectoryGroup.add(staticLine);

      const trailMat = new THREE.ShaderMaterial({
        uniforms: {
          uHead: { value: 0 },
          uAlpha: { value: 0 },
          uColor: { value: new THREE.Color(AMBER) },
        },
        vertexShader: `
          attribute float aDist;
          varying float vDist;
          void main() {
            vDist = aDist;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uHead;
          uniform float uAlpha;
          uniform vec3 uColor;
          varying float vDist;
          void main() {
            float d = uHead - vDist;
            float tail = d >= 0.0 ? exp(-d * 13.0) : 0.0;
            gl_FragColor = vec4(uColor, uAlpha * tail);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const trailLine = new THREE.Line(tj.geometry, trailMat);
      trajectoryGroup.add(trailLine);
      tj.trailMat = trailMat;
      tj.staticMat = staticMat;

      const head = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture,
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthTest: false,
          depthWrite: false,
          fog: false,
        }),
      );
      head.scale.set(4.4, 4.4, 1);
      head.renderOrder = 10;
      trajectoryGroup.add(head);
      tj.head = head;

      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture,
          color: new THREE.Color(AMBER),
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthTest: false,
          depthWrite: false,
          fog: false,
        }),
      );
      halo.scale.set(13, 13, 1);
      halo.renderOrder = 9;
      trajectoryGroup.add(halo);
      tj.halo = halo;

      state.trajectories.push(tj);
    }

    /* tiny warm root glow */
    const rootGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: new THREE.Color(AMBER),
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        fog: false,
      }),
    );
    rootGlow.scale.set(7, 7, 1);
    rootGlow.position.y = 0;
    rootGlow.renderOrder = 8;
    root.add(rootGlow);

    /* screen-space vignette + quiet left band */
    const overlayCamera = new THREE.OrthographicCamera(0, state.width, state.height, 0, -100, 100);
    overlayCamera.position.z = 10;
    state.overlayCamera = overlayCamera;

    const maskScene = new THREE.Scene();
    const maskMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        void main() {
          float left = 1.0 - smoothstep(0.02, 0.30, vUv.x);
          float vig = smoothstep(0.38, 0.98, length((vUv - vec2(0.60, 0.50)) * vec2(1.15, 1.30)));
          float a = left * 0.42 + vig * 0.20;
          gl_FragColor = vec4(0.0, 0.0, 0.0, min(a, 0.60));
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    maskScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), maskMat));
    state.maskScene = maskScene;

    const labelScene = new THREE.Scene();
    state.labelScene = labelScene;

    const labels = [];
    labels.push({
      mesh: createTextMesh('3n+1', { size: 13, color: TEAL, opacity: 0.40 }),
      anchor: 'left',
    });
    labels.push({
      mesh: createTextMesh('n → n/2', { size: 10, color: TEAL, opacity: 0.32 }),
      anchor: 'left',
    });
    labels.push({
      mesh: createTextMesh('n → (n−1)/3', { size: 10, color: TEAL, opacity: 0.32 }),
      anchor: 'left',
    });
    labels.push({
      mesh: createTextMesh('reverse tree · 150,000 nodes', { size: 9, color: PURPLE, opacity: 0.26 }),
      anchor: 'topRight',
    });
    for (const [i, tj] of state.trajectories.entries()) {
      labels.push({
        mesh: createTextMesh(`${tj.seed} · ${tj.steps} steps`, { size: 10.5, color: AMBER, opacity: 0.36 }),
        anchor: 'right',
        index: i,
      });
    }

    for (const item of labels) {
      item.mesh.material.depthTest = false;
      item.mesh.material.depthWrite = false;
      labelScene.add(item.mesh);
      item.order = labels.indexOf(item);
    }
    state.labels = labels;

    layoutFrame(state);
    state.renderer.render(scene, camera);
  },

  draw(state, t) {
    const { renderer, scene, camera, root, overlayCamera, maskScene, labelScene } = state;
    const phase = TWO_PI * (t / DURATION);

    const az = 0.028 * Math.sin(phase);
    const elev = 0.580 + 0.006 * Math.sin(phase + 0.8);
    const d = state.camDistance;
    camera.position.set(
      Math.cos(elev) * Math.sin(az) * d,
      Math.sin(elev) * d,
      Math.cos(elev) * Math.cos(az) * d,
    );
    camera.lookAt(0, -6, 0);

    const fade = smoothstep(0, 2.0, t) * (1 - smoothstep(34.2, 35.9, t));

    for (const tj of state.trajectories) {
      const p = Math.max(0, Math.min(1, (t - tj.delay) / tj.span));
      tj.progress = p;
      const f = p * (tj.nPts - 1);
      const i0 = Math.floor(f);
      const i1 = Math.min(tj.nPts - 1, i0 + 1);
      const w = f - i0;
      const arr = tj.geometry.attributes.position.array;
      tj.headPos.set(
        arr[i0 * 3] * (1 - w) + arr[i1 * 3] * w,
        arr[i0 * 3 + 1] * (1 - w) + arr[i1 * 3 + 1] * w,
        arr[i0 * 3 + 2] * (1 - w) + arr[i1 * 3 + 2] * w,
      );
      tj.head.position.copy(tj.headPos);
      tj.halo.position.copy(tj.headPos);
      tj.head.material.opacity = 0.9 * fade;
      tj.halo.material.opacity = 0.18 * fade;
      tj.trailMat.uniforms.uHead.value = p;
      tj.trailMat.uniforms.uAlpha.value = 0.7 * fade;
    }

    renderer.autoClear = true;
    renderer.render(scene, camera);

    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(maskScene, overlayCamera);
    renderer.render(labelScene, overlayCamera);
  },

  onResize(state) {
    state.renderer.setPixelRatio(state.dpr);
    state.renderer.setSize(state.width, state.height, false);
    state.camera.aspect = state.width / state.height;
    state.camera.updateProjectionMatrix();
    layoutFrame(state);
  },
});

function layoutFrame(state) {
  const { width, height } = state;
  const aspect = width / height;
  const tanHalf = Math.tan((38 * Math.PI) / 360);
  const xFrac = aspect > 2.05 ? 0.315 : 0.34;
  const centerFrac = aspect > 2.05 ? 0.58 : 0.60;

  state.camDistance = (TREE_R * (height / 2)) / (xFrac * width * tanHalf);
  state.root.position.x = (centerFrac - 0.5) * TREE_R / xFrac;

  state.overlayCamera.left = 0;
  state.overlayCamera.right = width;
  state.overlayCamera.top = height;
  state.overlayCamera.bottom = 0;
  state.overlayCamera.updateProjectionMatrix();

  const margin = Math.max(18, Math.round(Math.min(width, height) * 0.028));
  const gap = 5;
  const leftLabels = state.labels.filter((l) => l.anchor === 'left').reverse();
  const rightLabels = state.labels.filter((l) => l.anchor === 'right').reverse();
  const topLabels = state.labels.filter((l) => l.anchor === 'topRight');

  let y = margin;
  for (const item of leftLabels) {
    const { w, h } = item.mesh.userData.size;
    item.mesh.position.set(margin + w / 2, y + h / 2, 0);
    y += h + gap;
  }

  let y2 = margin;
  for (const item of rightLabels) {
    const { w, h } = item.mesh.userData.size;
    item.mesh.position.set(width - margin - w / 2, y2 + h / 2, 0);
    y2 += h + gap;
  }

  let y3 = height - margin;
  for (const item of topLabels) {
    const { w, h } = item.mesh.userData.size;
    item.mesh.position.set(width - margin - w / 2, y3 - h / 2, 0);
    y3 -= h + gap;
  }
}
