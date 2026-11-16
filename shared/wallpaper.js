/**
 * Shared wallpaper runtime.
 *
 * Every piece is a full-viewport canvas with a deterministic loop.
 * The page can be opened live, or frozen at a time for screenshots/recording:
 *
 *   index.html            live loop
 *   index.html?t=3.5      render the single frame at t=3.5s and stop
 *   index.html?capture=1  render frame 0, expose window.__wp, no rAF loop
 *
 * window.__wp = { duration, fps, canvas, state, renderAt(t), ready, pause, resume }
 */

const params = new URLSearchParams(location.search);
const fixedTime = params.has('t') ? Math.max(0, parseFloat(params.get('t')) || 0) : null;
const captureMode = params.get('capture') === '1';

export function createWallpaper({
  duration = 20,
  fps = 30,
  context = '2d',
  dprCap = 2,
  background = '#05070a',
  setup,
  draw,
  onResize,
} = {}) {
  document.documentElement.style.background = background;
  document.body.style.margin = '0';
  document.body.style.padding = '0';
  document.body.style.overflow = 'hidden';
  document.body.style.background = background;
  document.body.style.cursor = 'none';

  const canvas = document.createElement('canvas');
  canvas.id = 'wallpaper';
  canvas.style.display = 'block';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.touchAction = 'none';
  document.body.appendChild(canvas);

  let ctx = null;
  if (context !== 'none') {
    const attrs = {
      alpha: false,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    };
    ctx = canvas.getContext(context, attrs);
    if (!ctx) throw new Error(`Cannot create ${context} context`);
  }

  const state = {
    canvas,
    ctx,
    width: 0,
    height: 0,
    dpr: 1,
    duration,
    fps,
    time: 0,
  };

  let readyResolve;
  const ready = new Promise((resolve) => {
    readyResolve = resolve;
  });
  let initialized = false;
  let setupPromise = Promise.resolve();
  let raf = 0;
  let startMs = 0;

  function applySize() {
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    const width = Math.max(1, Math.floor(window.innerWidth));
    const height = Math.max(1, Math.floor(window.innerHeight));
    state.width = width;
    state.height = height;
    state.dpr = dpr;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    if (ctx && context === '2d') {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    if (ctx && (context === 'webgl' || context === 'webgl2')) {
      ctx.viewport(0, 0, canvas.width, canvas.height);
    }
  }

  function renderAt(time) {
    const t = duration > 0 ? Math.max(0, Math.min(duration - 1e-6, time)) : 0;
    state.time = t;
    if (ctx && context === '2d') {
      ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
      ctx.clearRect(0, 0, state.width, state.height);
    }
    draw(state, t);
  }

  function loop(now) {
    const t = ((now - startMs) / 1000) % duration;
    renderAt(t);
    raf = requestAnimationFrame(loop);
  }

  function startLoop() {
    startMs = performance.now() - state.time * 1000;
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function pause() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function resume() {
    if (!raf) startLoop();
  }

  function onVisibility() {
    if (document.hidden) pause();
    else if (!fixedTime && !captureMode) resume();
  }

  function finish() {
    if (!initialized) return;
    if (fixedTime !== null) {
      renderAt(fixedTime);
      readyResolve();
    } else if (captureMode) {
      renderAt(0);
      readyResolve();
    } else {
      readyResolve();
      startLoop();
    }
  }

  function init() {
    applySize();
    try {
      setupPromise = Promise.resolve(setup ? setup(state) : undefined);
    } catch (error) {
      console.error(error);
      setupPromise = Promise.resolve();
    }
    setupPromise
      .then(() => {
        initialized = true;
        finish();
      })
      .catch((error) => {
        console.error(error);
        initialized = true;
        finish();
      });
  }

  window.addEventListener('resize', () => {
    applySize();
    if (initialized) {
      if (onResize) onResize(state);
      if (fixedTime !== null) renderAt(fixedTime);
    }
  });
  document.addEventListener('visibilitychange', onVisibility);

  window.__wp = {
    duration,
    fps,
    canvas,
    state,
    renderAt,
    ready,
    pause,
    resume,
    get time() {
      return state.time;
    },
  };

  init();
  return window.__wp;
}
