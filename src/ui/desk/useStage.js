/**
 * A small pixel-art 3D stage inside a component: the Build app's engine and the shop
 * behind the laptop both use one.
 *
 * `setup(stage)` builds the scene once and returns what to do each frame. An `update` that
 * returns `false` has nothing new to show, and the frame is not drawn: a picture behind a
 * page costs nothing while it sits still. The stage sizes
 * itself to the canvas's parent as that changes. Where there is no WebGL (an old browser,
 * a test runner) the hook reports `failed` and the component draws its fallback instead:
 * nothing in the app depends on the picture.
 */

import { useEffect, useRef, useState } from 'react';

import { createStage } from '../world/stage.js';
import { createGovernor } from './stageGovernor.js';

const RUNG_KEY = 'ecu-lab-stage-rung';
/** A remembered rung is trusted for this long (ms): a phone changes, an update changes the scene. */
const RUNG_TTL_MS = 14 * 24 * 3600 * 1000;

/** The rung a previous visit settled on, so a slow device does not relearn it every time. */
function savedRung() {
  try {
    const [n, at] = String(window.localStorage.getItem(RUNG_KEY)).split('@').map(Number);
    return Number.isInteger(n) && n >= 0 && Date.now() - at < RUNG_TTL_MS ? n : 0;
  } catch {
    return 0;
  }
}
function saveRung(n) {
  try { window.localStorage.setItem(RUNG_KEY, `${n}@${Date.now()}`); } catch { /* private window: it just relearns */ }
}

/**
 * @param {(stage: ReturnType<typeof createStage>) => {update?: (dt: number) => (boolean|void), dispose?: () => void}} setup
 * @param {{shadows?: boolean, hatch?: boolean, real?: boolean}} [opts]
 * @returns {{canvasRef: React.MutableRefObject<HTMLCanvasElement|null>, failed: boolean, stageRef: React.MutableRefObject<any>}}
 */
export function useStage(setup, opts = {}) {
  const canvasRef = useRef(/** @type {HTMLCanvasElement|null} */ (null));
  const stageRef = useRef(/** @type {any} */ (null));
  const setupRef = useRef(setup);
  setupRef.current = setup;
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let stage;
    if (typeof WebGLRenderingContext === 'undefined') { setFailed(true); return undefined; }
    try {
      // Hatching only where a scene asks for it: over the shop it read as diagonal stripes.
      stage = createStage(canvas, { shadows: opts.shadows ?? false, sketch: true, hatch: opts.hatch ?? false, real: !!opts.real });
    } catch {
      setFailed(true);
      return undefined;
    }
    stageRef.current = stage;
    // Only the lit shop (`real`) is heavy enough to need it; the small engine views are not.
    const governor = createGovernor(opts.real ? savedRung() : 0);
    if (governor.rung > 0) stage.setMaxDpr(governor.dpr);
    const scene = setupRef.current(stage) ?? {};
    // A resize clears the canvas, so the next frame is drawn whatever update says.
    let dirty = true;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { stage.resize(); dirty = true; }) : null;
    if (ro && canvas.parentElement) ro.observe(canvas.parentElement);
    let raf = 0;
    let last = 0;
    const frame = (now) => {
      const ms = last ? now - last : 0;
      const dt = last ? Math.min(0.1, ms / 1000) : 0;
      last = now;
      const draw = scene.update?.(dt) !== false || dirty;
      if (draw) { stage.render(); dirty = false; }
      if (opts.real && governor.frame(ms, draw)) {
        stage.setMaxDpr(governor.dpr); dirty = true;
        saveRung(governor.rung);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      scene.dispose?.();
      stage.dispose();
      stageRef.current = null;
    };
    // The stage is made once per mount; what changes is fed through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { canvasRef, failed, stageRef };
}
