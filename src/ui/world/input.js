/**
 * Input: keyboard, gamepad and on-screen touch controls, folded into one small state the
 * world reads each frame. The touch controls (HUD.jsx) write into the same state, so a
 * phone held sideways plays exactly like a keyboard.
 *
 * Two kinds of control: HELD (movement, throttle, brake) and PRESSED (interact, shift,
 * camera, photo), which are consumed once per press.
 */

const KEYS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  run: ['ShiftLeft', 'ShiftRight'],
  handbrake: ['Space'],
  interact: ['KeyE', 'Enter', 'KeyF'],
  shiftUp: ['KeyX', 'PageUp'],
  shiftDown: ['KeyZ', 'PageDown'],
  camLeft: ['KeyQ'],
  camRight: ['KeyR'],
  photo: ['KeyP'],
  map: ['KeyM', 'Tab'],
  menu: ['Escape'],
  horn: ['KeyH'],
  lights: ['KeyL'],
  reset: ['Backspace'],
};

const PRESSED = new Set(['interact', 'shiftUp', 'shiftDown', 'photo', 'map', 'menu', 'horn', 'lights', 'reset']);

/** True when a key press is for typing into a field rather than the game. @param {EventTarget|null} t */
function typing(t) {
  const el = /** @type {HTMLElement|null} */ (t);
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

export function createInput() {
  const down = new Set();
  const edges = new Set();
  const touch = { x: 0, y: 0, throttle: 0, brake: 0, run: false, handbrake: false };
  let enabled = true;
  let drag = 0;

  /** @param {KeyboardEvent} e */
  const onDown = (e) => {
    if (!enabled || typing(e.target)) return;
    const name = Object.keys(KEYS).find((k) => KEYS[k].includes(e.code));
    if (!name) return;
    if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab') e.preventDefault();
    if (!down.has(e.code) && PRESSED.has(name)) edges.add(name);
    down.add(e.code);
  };
  const onUp = (e) => { down.delete(e.code); };
  const onBlur = () => { down.clear(); };
  const held = (name) => KEYS[name].some((c) => down.has(c));

  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  window.addEventListener('blur', onBlur);

  const input = {
    touch,
    /** Turn the whole thing off (a panel is open) and release everything. @param {boolean} on */
    setEnabled(on) { enabled = on; if (!on) { down.clear(); edges.clear(); } },
    get enabled() { return enabled; },

    /** Movement on screen axes: x right, y up the screen. Keyboard, stick and gamepad merged. */
    axes() {
      if (!enabled) return { x: 0, y: 0 };
      let x = (held('right') ? 1 : 0) - (held('left') ? 1 : 0);
      let y = (held('up') ? 1 : 0) - (held('down') ? 1 : 0);
      x += touch.x;
      y += touch.y;
      const pad = gamepad();
      if (pad) { x += pad.x; y += pad.y; }
      const m = Math.hypot(x, y);
      if (m > 1) { x /= m; y /= m; }
      return { x, y };
    },
    /** Is the run/sprint control held. */
    running() { return enabled && (held('run') || touch.run); },
    /** Throttle and brake, 0..1, for the car. */
    pedals() {
      if (!enabled) return { throttle: 0, brake: 0, handbrake: false };
      const pad = gamepad();
      const t = Math.max(held('up') ? 1 : 0, touch.throttle, pad?.rt ?? 0);
      const b = Math.max(held('down') ? 1 : 0, touch.brake, pad?.lt ?? 0);
      return { throttle: t, brake: b, handbrake: held('handbrake') || touch.handbrake };
    },
    /** Steering -1 (left) .. 1 (right). */
    steer() {
      if (!enabled) return 0;
      const pad = gamepad();
      return Math.max(-1, Math.min(1, (held('right') ? 1 : 0) - (held('left') ? 1 : 0) + touch.x + (pad?.x ?? 0)));
    },
    camera() { return (held('camRight') ? 1 : 0) - (held('camLeft') ? 1 : 0) + drag; },
    /** Mouse/touch drag adds to camera yaw once. @param {number} d */
    nudgeCamera(d) { drag += d; },
    consumeDrag() { const d = drag; drag = 0; return d; },
    /** @param {string} name one of the PRESSED controls */
    pressed(name) { return edges.delete(name); },
    /** Trigger a pressed control from the screen. @param {string} name */
    press(name) { if (enabled || name === 'menu') edges.add(name); },
    clearEdges() { edges.clear(); },
    dispose() {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    },
  };

  const padPrev = { interact: false, shiftUp: false, shiftDown: false };
  /** @returns {{x: number, y: number, rt: number, lt: number}|null} */
  function gamepad() {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads && [...pads].find((g) => g && g.connected);
    if (!p) return null;
    const dead = (v) => (Math.abs(v) < 0.15 ? 0 : v);
    const btn = (i) => !!p.buttons[i]?.pressed;
    const edge = (name, now) => { if (now && !padPrev[name]) edges.add(name); padPrev[name] = now; };
    edge('interact', btn(0));
    edge('shiftUp', btn(5));
    edge('shiftDown', btn(4));
    return { x: dead(p.axes[0] ?? 0) + (btn(15) ? 1 : 0) - (btn(14) ? 1 : 0), y: -dead(p.axes[1] ?? 0) + (btn(12) ? 1 : 0) - (btn(13) ? 1 : 0), rt: p.buttons[7]?.value ?? 0, lt: p.buttons[6]?.value ?? 0 };
  }

  return input;
}
