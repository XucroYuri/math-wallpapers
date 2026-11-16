import * as THREE from '../../shared/vendor/three.module.js';
import { createWallpaper } from '../../shared/wallpaper.js';

createWallpaper({
  duration: 10,
  context: 'none',
  background: '#05070a',
  setup(state) {
    state.renderer = new THREE.WebGLRenderer({ canvas: state.canvas, antialias: true, alpha: false });
    state.renderer.setPixelRatio(state.dpr);
    state.renderer.setSize(state.width, state.height, false);
    state.scene = new THREE.Scene();
    state.camera = new THREE.PerspectiveCamera(45, state.width / state.height, 0.1, 100);
    state.camera.position.set(0, 0, 5);
    const geo = new THREE.TorusKnotGeometry(1, 0.3, 128, 16);
    const mat = new THREE.MeshBasicMaterial({ color: 0x7ef0d4, wireframe: true });
    state.mesh = new THREE.Mesh(geo, mat);
    state.scene.add(state.mesh);
  },
  draw(state, t) {
    const angle = t * 0.4;
    state.mesh.rotation.set(angle * 0.3, angle, 0);
    state.renderer.render(state.scene, state.camera);
  },
  onResize(state) {
    state.renderer.setPixelRatio(state.dpr);
    state.renderer.setSize(state.width, state.height, false);
    state.camera.aspect = state.width / state.height;
    state.camera.updateProjectionMatrix();
  },
});
