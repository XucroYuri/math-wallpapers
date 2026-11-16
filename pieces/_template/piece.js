import { createWallpaper } from '../../shared/wallpaper.js';

const DURATION = 24;

createWallpaper({
  duration: DURATION,
  fps: 30,
  context: '2d',
  background: '#05070a',
  setup({ ctx, width, height, dpr }) {
    // Preload data, build offscreen buffers, initialise GL state.
  },
  draw({ ctx, width, height, dpr }, t) {
    // Draw exactly one frame for time t in [0, DURATION).
    // Keep every frame deterministic: same t => same pixels.
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, width, height);
  },
  onResize({ ctx, width, height, dpr }) {
    // Rebuild resolution-dependent buffers.
  },
});
