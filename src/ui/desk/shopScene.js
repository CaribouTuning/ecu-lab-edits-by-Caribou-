/**
 * Your shop, behind the laptop: the room the sandbox happens in.
 *
 * Seen from your desk, the roller door at the far end is down: the shop is the whole world
 * of the game. The dyno is on the left with a car on its
 * rollers, a car is up on the lift on the right, and between them, nearer, the engine you
 * are building runs on its stand. The shop's sign is on the back wall, left of the door.
 *
 * Two camera poses: `desk`, sitting at the desk looking over the laptop, and `bay`, stood
 * up looking at the whole shop with the laptop shut. The scene glides between them.
 * `anchors` are the points the shop view's buttons sit on.
 *
 * Coordinates, metres: x across the shop, y up, z toward you (the door is at z = -7).
 */

import { world as W } from '../tokens.js';
import { THREE, box, cyl, floorPlane, glow, mergeStatic, strut } from '../world/gfx.js';
import { concreteFloor, realize, roomReflections } from './realize.js';
import { makeCar } from '../world/models/car.js';
import { makeEngine } from '../world/models/engine.js';
import { dressShop } from './shopDetail.js';
import { makeDyno, makeLift } from '../world/models/props.js';
import { makeDebris, makeFlash, makeSmoke } from '../world/models/damageFx.js';

const POSES = {
  desk: { pos: new THREE.Vector3(0, 1.75, 7.6), look: new THREE.Vector3(0, 1.55, -6), fov: 50 },
  bay: { pos: new THREE.Vector3(0, 4.2, 9.6), look: new THREE.Vector3(0, 0.9, -1.4), fov: 58 },
  // The same, on a screen taller than wide (a phone held upright): high above the room,
  // its ceiling lifted off, looking down over the whole floor so it fits the narrow frame.
  bayTall: { pos: new THREE.Vector3(0, 15, 5.2), look: new THREE.Vector3(0, 0, -0.4), fov: 40 },
  // Walked up to one thing: the car on the dyno with the dyno's computer cart in front of
  // it, the engine on its stand with its control cart, the job board on the wall.
  dyno: { pos: new THREE.Vector3(-1.6, 2.2, 4.4), look: new THREE.Vector3(-4.2, 0.3, -0.8), fov: 48 },
  stand: { pos: new THREE.Vector3(1.7, 1.75, 4.6), look: new THREE.Vector3(1.7, 1.0, 1.7), fov: 46 },
  build: { pos: new THREE.Vector3(-1.3, 1.75, 3.9), look: new THREE.Vector3(-1.3, 1.0, 0.8), fov: 46 },
  board: { pos: new THREE.Vector3(-4.6, 2.15, -4.9), look: new THREE.Vector3(-7.9, 2.15, -4.9), fov: 44 },
};

/**
 * A rolling cart with a big monitor on a post and a control box under it, leaning back so
 * it reads from where you stand: the dyno's computer, or the engine stand's. Faces +z.
 * `monitor` and `console` are the screen's and the box's faces, where the page's own
 * controls are laid (Station.jsx, ShopBackdrop.jsx): the cart is the thing you use, not a
 * picture of it.
 *
 * `shape` sizes it for the view: a wide monitor, or on a phone held upright the same
 * monitor turned on its pivot to stand the tall way, as a real one can.
 */
/**
 * What a station's computer shows when nobody is at it: its own program, idling, so from
 * across the shop you can tell the dyno's from the stand's from the bench's, and see it is
 * a thing to walk up to. Drawn into a canvas at the screen's own shape; the page's real
 * screen is laid over it when you are there.
 * @param {'dyno'|'stand'|'build'} kind @param {number} aspect width over height
 */
function idleScreen(kind, aspect) {
  const h = 360;
  const w = Math.round(h * aspect);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  if (g) {
    const tall = aspect < 1;
    const pad = 22;
    g.fillStyle = W.screenOff;
    g.fillRect(0, 0, w, h);
    // The window's title bar.
    g.fillStyle = W.metalDark;
    g.fillRect(0, 0, w, 34);
    g.fillStyle = W.white;
    g.font = '600 20px system-ui, sans-serif';
    g.textBaseline = 'middle';
    g.fillText({ dyno: 'Caribou Dyno', stand: 'Engine stand', build: 'Build bench' }[kind], pad, 17);
    // Its job, drawn the way the program shows it.
    const top = 52;
    const bot = h - 70;
    g.lineWidth = 4;
    if (kind === 'dyno') {
      // A power and a torque curve over a grid.
      g.strokeStyle = W.metalDark;
      g.lineWidth = 1;
      for (let i = 0; i <= 4; i += 1) { const y = top + ((bot - top) * i) / 4; g.beginPath(); g.moveTo(pad, y); g.lineTo(w - pad, y); g.stroke(); }
      const curve = (col, f) => {
        g.strokeStyle = col; g.lineWidth = 4; g.beginPath();
        for (let i = 0; i <= 40; i += 1) { const t = i / 40; const x = pad + t * (w - 2 * pad); const y = bot - f(t) * (bot - top); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
        g.stroke();
      };
      curve(W.screen, (t) => 0.15 + 0.75 * Math.sin(t * 1.45) ** 1.3);
      curve(W.screenAmber, (t) => 0.55 + 0.25 * Math.sin(t * 2.6 + 0.2) - 0.2 * t * t);
    } else if (kind === 'stand') {
      // A tachometer: its arc, the redline, the needle at idle.
      const cx = w / 2; const cy = top + (bot - top) * 0.62; const rad = Math.min(w * 0.38, (bot - top) * 0.6);
      g.strokeStyle = W.metal; g.lineWidth = 6;
      g.beginPath(); g.arc(cx, cy, rad, Math.PI * 0.8, Math.PI * 2.0); g.stroke();
      g.strokeStyle = W.taillight;
      g.beginPath(); g.arc(cx, cy, rad, Math.PI * 2.0, Math.PI * 2.2); g.stroke();
      const a = Math.PI * 0.95;
      g.strokeStyle = W.screen; g.lineWidth = 5;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * rad * 0.9, cy + Math.sin(a) * rad * 0.9); g.stroke();
      g.fillStyle = W.white; g.font = `700 ${tall ? 30 : 36}px system-ui, sans-serif`; g.textAlign = 'center';
      g.fillText('0 rpm', cx, cy + rad * 0.35);
      g.textAlign = 'left';
    } else {
      // The engine's parts, in the order it goes together.
      const parts = ['Engine', 'Short block', 'Heads and cam', 'Induction', 'Fuel system', 'Exhaust'];
      const row = (bot - top) / parts.length;
      g.font = `500 ${Math.min(22, row * 0.6)}px system-ui, sans-serif`;
      parts.forEach((name, i) => {
        const y = top + row * (i + 0.5);
        g.fillStyle = W.metal; g.fillText(String(i + 1), pad, y);
        g.fillStyle = i === 0 ? W.screen : W.white; g.fillText(name, pad + 30, y);
      });
    }
    // The one thing to do here, as the program's own button.
    g.font = '600 22px system-ui, sans-serif';
    const label = { dyno: 'Run a pull', stand: 'Start engine', build: 'Build' }[kind];
    const bw = g.measureText(label).width + 44;
    g.fillStyle = W.screen;
    g.beginPath();
    g.roundRect(w - pad - bw, h - 56, bw, 38, 8);
    g.fill();
    g.fillStyle = W.screenOff;
    g.fillText(label, w - pad - bw + 22, h - 37);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * A swivel caster: its top plate, the fork, the wheel. Origin on the floor.
 * @param {number} x @param {number} z @param {number} [r] wheel radius
 */
function caster(x, z, r = 0.045) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.add(box(0.08, 0.012, 0.08, W.metalDark, { y: 2 * r + 0.03, edge: false }));
  for (const s of [-1, 1]) g.add(box(0.008, r + 0.03, 0.05, W.metalDark, { x: s * 0.022, y: r + 0.012, z: -0.012, edge: false }));
  g.add(cyl(r, r, 0.03, W.rubber, { axis: 'x', y: r, z: -0.02, seg: 14, edge: false }));
  return g;
}

/**
 * A station's computer, as a shop has it: a steel workstation on casters with the PC in
 * its cabinet, a worktop at hand height with the control box on it, and the monitor on a
 * column off the back. The build bench's is the same with no control box: there is
 * nothing to start.
 * @param {'dyno'|'stand'|'build'} kind
 */
function makeCart(kind) {
  const g = new THREE.Group();
  g.userData.spot = kind;
  const body = new THREE.Group();
  g.add(body);
  const monitorAt = new THREE.Object3D();
  const consoleAt = new THREE.Object3D();
  g.add(monitorAt);
  const monitor = { at: monitorAt, w: 1, h: 1 };
  const idleMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const idle = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), idleMat);
  idle.position.z = 0.001;
  monitorAt.add(idle);
  let idleKey = '';
  const panel = { at: consoleAt, w: 1, h: 1 };
  const steel = W.engine.standDark;
  /**
   * @param {{mw: number, mh: number, cw: number, ch: number, side?: boolean}} d metres; `side`
   *   hangs the control box beside the monitor on an arm, for a view too short for both stacked
   */
  const shape = ({ mw, mh, cw, ch, side = false }) => {
    body.clear();
    const top = 0.86;
    const tilt = side ? 0.12 : 0.42;
    const my = side ? 1.5 : 0.96 + (ch / 2) * Math.cos(tilt) + 0.12 + mh / 2;
    {
      // The workstation: plinth on casters, the cabinet with its door and vents, the worktop.
      const bw = Math.max(0.8, cw + 0.12);
      body.add(box(bw, 0.05, 0.56, steel, { y: 0.135 }));
      for (const x of [-1, 1]) for (const z of [-1, 1]) body.add(caster(x * (bw / 2 - 0.07), z * 0.2));
      body.add(box(bw - 0.04, top - 0.2, 0.5, steel, { y: 0.16 + (top - 0.2) / 2 }));
      body.add(box(0.006, top - 0.28, 0.01, W.black, { y: 0.2 + (top - 0.28) / 2, z: 0.252, edge: false, cast: false }));
      body.add(box(0.02, 0.14, 0.03, W.metalLight, { x: -0.04, y: 0.55, z: 0.26, edge: false }));
      for (let i = 0; i < 5; i += 1) body.add(box(bw * 0.3, 0.008, 0.008, W.black, { x: bw * 0.22, y: 0.26 + i * 0.03, z: 0.252, edge: false, cast: false }));
      body.add(box(bw + 0.04, 0.035, 0.6, W.rubber, { y: top - 0.02 }));
      // A handle along the side, to push it by.
      body.add(cyl(0.012, 0.012, 0.44, W.metalLight, { axis: 'z', x: bw / 2 + 0.05, y: top - 0.08, edge: false }));
      for (const z of [-0.2, 0.2]) body.add(box(0.05, 0.02, 0.02, W.metalLight, { x: bw / 2 + 0.03, y: top - 0.08, z, edge: false }));
    }
    // The control box: a steel box at hand height, its panel leaning back about 24 degrees;
    // or, beside the monitor, a pendant box on an arm, standing nearly upright.
    const box0 = new THREE.Group();
    if (side) {
      box0.position.set(mw / 2 + 0.1 + cw / 2, my, -0.08);
      body.add(box(0.12, 0.05, 0.05, W.metalDark, { x: mw / 2 + 0.06, y: my, z: -0.1 }));
    } else box0.position.set(0, 0.96, 0.08);
    box0.rotation.x = -tilt;
    box0.add(box(cw + 0.08, ch + 0.08, 0.1, steel, { z: -0.05 }));
    box0.add(box(cw + 0.04, ch + 0.04, 0.004, W.black, { z: 0.001, cast: false, edge: false }));
    consoleAt.position.set(0, 0, 0.004);
    box0.add(consoleAt);
    // A cart with no control box (the build bench's) has only its monitor.
    if (cw > 0) body.add(box0);
    // The column off the worktop's back, and the monitor on its mount: a thin bezel, the
    // housing behind it deeper, so the screen has the thickness a real one has.
    {
      body.add(box(0.08, my - top, 0.06, W.metalDark, { y: top + (my - top) / 2, z: -0.24 }));
      body.add(box(0.1, 0.1, 0.12, W.metalDark, { y: my, z: -0.18 }));
    }
    body.add(box(mw + 0.05, mh + 0.05, 0.03, W.plastic, { y: my, z: -0.09 }));
    body.add(box(mw * 0.86, mh * 0.8, 0.05, W.plastic, { y: my, z: -0.13 }));
    // The panel's glass, switched off: dark, but it catches the shop's lights.
    body.add(box(mw, mh, 0.002, W.screenOff, { y: my, z: -0.0745, cast: false }));
    monitorAt.position.set(0, my, -0.074);
    monitor.w = mw; monitor.h = mh;
    idle.scale.set(mw, mh, 1);
    const key = (mw / mh).toFixed(2);
    if (key !== idleKey) { idleKey = key; idleMat.map?.dispose(); idleMat.map = idleScreen(kind, mw / mh); idleMat.needsUpdate = true; }
    panel.w = cw; panel.h = ch;
    realize(body);
  };
  /** Pointed at from across the shop: the screen brightens, the way a hovered thing does. @param {boolean} on */
  const hover = (on) => { idleMat.color.setScalar(on ? 1.35 : 1); };
  return { group: g, monitor, console: panel, shape, hover };
}

/** The carts' faces for each shape of view, metres: monitor, then control box. */
const CART_SIZES = {
  // Real sizes: a 32-inch screen and a control box under it. Walked up to, the view fits
  // whatever size the cart is, so a TV-sized one only made the shop floor a wall of screens.
  dyno: { short: { mw: 0.82, mh: 0.5, cw: 0.25, ch: 0.41, side: true }, wide: { mw: 0.82, mh: 0.5, cw: 0.57, ch: 0.19 }, tall: { mw: 0.42, mh: 0.7, cw: 0.45, ch: 0.16 } },
  // The bench's computer has no control box under it, so its monitor takes that room: bigger.
  build: { short: { mw: 1.5, mh: 1.12 }, wide: { mw: 1.6, mh: 1.1 }, tall: { mw: 0.8, mh: 1.3 } },
  stand: { short: { mw: 1.24, mh: 0.86, cw: 0.4, ch: 0.7, side: true }, wide: { mw: 1.24, mh: 0.86, cw: 0.78, ch: 0.26 }, tall: { mw: 0.68, mh: 1.12, cw: 0.72, ch: 0.26 } },
};

/**
 * The cars in the shop: the one on the dyno and the one up on the lift, each a look or
 * nothing. Left out, a look is the shop's own demonstration car.
 * @typedef {{body?: string, color?: string}} CarLook
 * @typedef {{dyno?: CarLook|null, lift?: CarLook|null, rollers?: boolean}} ShopCars
 *   `rollers: false`: the shop has not bought its dyno yet, and the bay is bare floor
 */

/** Where things are in the shop. */
const AT = {
  dyno: new THREE.Vector3(-4.6, 0, -1.6),
  lift: new THREE.Vector3(4.6, 0, -1.6),
  // The build bench left of the middle of the floor and the run stand right of it, each
  // with its computer cart on its right: well clear of the desk behind you and the lift.
  build: new THREE.Vector3(-2.0, 0, 0.6),
  buildCart: new THREE.Vector3(-0.55, 0, 0.9),
  stand: new THREE.Vector3(1.05, 0, 1.6),
  standCart: new THREE.Vector3(2.45, 0, 1.9),
  desk: new THREE.Vector3(0, 0, 5.2),
};
/** Where on the dyno its rollers are: under the driven (rear) wheels. */
const ROLLER_Z = 1.0;

/**
 * A shop sign as a sign maker would make it: a steel panel painted the shop's dark colour,
 * the name in heavy white letters, a smaller line under it, held off the wall on four
 * stand-off bolts. Lettered in the interface's own face, redrawn once that face has loaded.
 * @param {string} text @param {string} sub the smaller line, or '' for none
 * @param {number} w metres @param {number} h metres
 */
function paintedSign(text, sub, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = Math.round(1024 * (h / w));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const face = "'Inter', system-ui, sans-serif";
  const draw = () => {
    const g = canvas.getContext('2d');
    if (!g) return;
    const { width: cw, height: ch } = canvas;
    g.fillStyle = W.wallBlack;
    g.fillRect(0, 0, cw, ch);
    // A painted pinstripe a little in from the edge.
    g.strokeStyle = W.floorStripe;
    g.lineWidth = 4;
    g.strokeRect(18, 18, cw - 36, ch - 36);
    g.fillStyle = W.white;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let size = Math.round(ch * (sub ? 0.42 : 0.55));
    g.font = `800 ${size}px ${face}`;
    while (g.measureText(text).width > cw - 120 && size > 10) { size -= 2; g.font = `800 ${size}px ${face}`; }
    g.fillText(text, cw / 2, ch * (sub ? 0.42 : 0.52));
    if (sub) {
      g.fillStyle = W.metalLight;
      g.font = `500 ${Math.round(ch * 0.14)}px ${face}`;
      g.fillText(sub, cw / 2, ch * 0.74);
    }
    tex.needsUpdate = true;
  };
  draw();
  document.fonts?.load(`800 40px 'Inter'`).then(draw, () => {});
  const sign = new THREE.Group();
  const edge = new THREE.MeshStandardMaterial({ color: W.wallBlack, roughness: 0.5, metalness: 0.3 });
  const front = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.1 });
  const panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.03), [edge, edge, edge, edge, front, edge]);
  panel.position.z = 0.05;
  panel.castShadow = true;
  sign.add(panel);
  for (const x of [-1, 1]) for (const y of [-1, 1]) sign.add(cyl(0.02, 0.02, 0.06, W.metalLight, { axis: 'z', x: x * (w / 2 - 0.08), y: y * (h / 2 - 0.08), z: 0.05, edge: false }));
  return sign;
}

/**
 * The roller door, down: corrugated steel slats between two guide rails, a bottom rail on
 * the floor. The shop is closed to the street; everything happens inside.
 * @param {number} w @param {number} h metres
 */
function closedDoor(w, h) {
  const g = new THREE.Group();
  g.add(box(w, h, 0.06, W.corrugated, { y: h / 2 }));
  // The slats' folds, every quarter metre.
  for (let y = 0.25; y < h; y += 0.25) g.add(box(w, 0.03, 0.03, W.metal, { y, z: 0.035, cast: false, edge: false }));
  g.add(box(w, 0.08, 0.1, W.metalDark, { y: 0.04, z: 0.02 }));
  for (const s of [-1, 1]) g.add(box(0.12, h + 0.3, 0.16, W.metalDark, { x: s * (w / 2 + 0.06), y: (h + 0.3) / 2 }));
  return g;
}

/**
 * An engine on a stand: the build bench's, where it is built a part at a time, or the run
 * stand's, plumbed to a radiator and an exhaust so it can be started. Both hold the same
 * engine, drawn from the build (`setSpec`); only the run stand's turns (`update`).
 *
 * In the stand's own frame the engine hangs off a mounting head at `MOUNT`, its crank
 * along +x, belt end outward. `turn` is the stand's heading on the floor.
 * @param {THREE.Vector3} at @param {boolean} run @param {number} turn
 */
function makeEngineStand(at, run, turn) {
  const group = new THREE.Group();
  group.position.copy(at);
  group.rotation.y = turn;
  const duct = new THREE.Group();
  duct.position.copy(at);
  duct.rotation.y = turn;
  const POST_X = -0.66;
  const MOUNT = new THREE.Vector3(POST_X + 0.24, 0.95, 0);
  /** Sized to the engine on it: the run stand's frame and radiator. */
  const fitted = new THREE.Group();
  group.add(fitted);
  if (!run) {
    // An engine stand as one is built: a crossbar under the post on two casters, two legs
    // splayed forward under the engine to two more, the post braced to them, and on top
    // the head, a sleeve the faceplate turns in, its four arms bolted to the bellhousing.
    const c = W.toolRed;
    const legY = 0.13;
    group.add(box(0.07, 0.07, 0.78, c, { x: POST_X, y: legY }));
    for (const s of [-1, 1]) {
      group.add(strut([POST_X, legY, s * 0.08], [POST_X + 1.0, legY, s * 0.36], 0.07, 0.07, c));
      group.add(caster(POST_X, s * 0.36, 0.04), caster(POST_X + 1.0, s * 0.36, 0.04));
    }
    group.add(box(0.08, 0.8, 0.08, c, { x: POST_X, y: legY + 0.4 }));
    group.add(strut([POST_X + 0.04, 0.55, 0], [POST_X + 0.42, legY + 0.03, 0], 0.05, 0.05, c));
    group.add(cyl(0.05, 0.05, 0.22, c, { axis: 'x', x: POST_X + 0.08, y: MOUNT.y, edge: false }));
    // The locking pin's T-handle on the sleeve, and the faceplate.
    group.add(cyl(0.012, 0.012, 0.12, W.metalLight, { x: POST_X + 0.12, y: MOUNT.y + 0.1, edge: false }));
    group.add(cyl(0.012, 0.012, 0.1, W.metalLight, { axis: 'z', x: POST_X + 0.12, y: MOUNT.y + 0.16, edge: false }));
    group.add(cyl(0.1, 0.1, 0.025, W.metalDark, { axis: 'x', x: POST_X + 0.2, y: MOUNT.y, seg: 18, edge: false }));
    for (const [dy, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const end = [POST_X + 0.215, MOUNT.y + dy * 0.2, dz * 0.2];
      group.add(strut([POST_X + 0.215, MOUNT.y, 0], /** @type {[number, number, number]} */ (end), 0.04, 0.012, W.metalDark));
      group.add(cyl(0.014, 0.014, 0.06, W.metalLight, { axis: 'x', x: end[0] + 0.02, y: end[1], z: end[2], edge: false }));
    }
  } else {
    // A run stand: a welded frame on casters that carries the engine on its own mounts, a
    // plate at the back that takes the bellhousing and the starter, the radiator and its
    // fan in front, the fuel cell and battery low in the frame.
    const c = W.engine.standDark;
    group.add(box(0.06, 1.05, 0.06, c, { x: POST_X + 0.1, y: 0.75, z: 0.3 }));
    group.add(box(0.06, 1.05, 0.06, c, { x: POST_X + 0.1, y: 0.75, z: -0.3 }));
    group.add(box(0.06, 0.06, 0.66, c, { x: POST_X + 0.1, y: 1.28 }));
    group.add(box(0.025, 0.56, 0.6, W.metalDark, { x: POST_X + 0.2, y: MOUNT.y }));
    group.add(cyl(0.05, 0.05, 0.2, W.black, { axis: 'x', x: POST_X + 0.08, y: MOUNT.y - 0.2, z: 0.17, seg: 12 }));
    group.add(box(0.26, 0.2, 0.17, W.plastic, { x: POST_X - 0.02, y: 0.3, z: -0.16 }));
    for (const [z, col] of /** @type {Array<[number, string]>} */ ([[-0.21, W.taillight], [-0.11, W.black]])) group.add(cyl(0.015, 0.015, 0.03, col, { x: POST_X + 0.05, y: 0.41, z, edge: false }));
    group.add(box(0.32, 0.24, 0.3, W.metal, { x: POST_X + 0.5, y: 0.34 }));
    group.add(cyl(0.035, 0.035, 0.03, W.metalLight, { x: POST_X + 0.6, y: 0.47, z: 0.08, edge: false }));
  }
  const mount = new THREE.Group();
  mount.position.copy(MOUNT);
  mount.rotation.y = Math.PI / 2;
  group.add(mount);
  if (run) {
    // The exhaust leaves behind the head and goes up into the shop's extraction: a flexible
    // hose dropped from the ceiling, its cone pushed over the tailpipe, as on any run stand
    // indoors. From the manifold side, behind the engine as you face it, so the hose stays
    // out of the view. Its own group beside the stand's, so the station's framing fits the
    // stand, not the hose.
    duct.add(cyl(0.045, 0.045, 0.5, W.steel, { axis: 'z', x: 0.25, y: 0.55, z: -0.5, edge: false }));
    duct.add(cyl(0.09, 0.055, 0.16, W.engine.hose, { axis: 'z', x: 0.25, y: 0.55, z: -0.8, edge: false }));
    // Aluminium flex, its ribs every hand's width.
    duct.add(cyl(0.075, 0.075, 3.9, W.metal, { x: 0.25, y: 2.55, z: -0.92, edge: false }));
    for (let y = 0.7; y < 4.5; y += 0.12) duct.add(cyl(0.08, 0.08, 0.025, W.metalDark, { x: 0.25, y, z: -0.92, edge: false, cast: false }));
  }
  /**
   * The run stand's frame and cooling, built to the engine's length: base rails under it,
   * the front mounts where its block is, the radiator a hand's width off its pulleys.
   * @param {number} front x of the engine's front face in the stand's frame
   */
  const fit = (front) => {
    fitted.clear();
    if (!run) return;
    const c = W.engine.standDark;
    const x0 = POST_X - 0.15;
    const x1 = front + 0.42;
    for (const z of [-0.36, 0.36]) {
      fitted.add(box(x1 - x0, 0.08, 0.08, c, { x: (x0 + x1) / 2, y: 0.17, z }));
      fitted.add(caster(x0 + 0.06, z, 0.05), caster(x1 - 0.06, z, 0.05));
    }
    for (const x of [x0 + 0.04, POST_X + 0.5, x1 - 0.04]) fitted.add(box(0.08, 0.06, 0.64, c, { x, y: 0.17 }));
    // Front mounts: a post each side up to a rubber mount on a bracket to the block.
    const mx = MOUNT.x + (front - MOUNT.x) * 0.72;
    fitted.add(box(0.08, 0.06, 0.64, c, { x: mx, y: 0.17 }));
    for (const s of [-1, 1]) {
      fitted.add(box(0.06, 0.48, 0.06, c, { x: mx, y: 0.44, z: s * 0.3 }));
      fitted.add(cyl(0.04, 0.04, 0.05, W.rubber, { x: mx, y: 0.7, z: s * 0.3, edge: false }));
      fitted.add(strut([mx, 0.72, s * 0.3], [mx, 0.78, s * 0.19], 0.05, 0.02, W.metalDark));
    }
    // The radiator on two uprights, its fan's shroud on the engine side, the hoses over.
    const rx = front + 0.24;
    for (const s of [-1, 1]) fitted.add(box(0.05, 0.86, 0.05, c, { x: rx, y: 0.6, z: s * 0.34 }));
    fitted.add(box(0.06, 0.56, 0.62, W.engine.cooler, { x: rx, y: 0.92 }));
    for (let k = 0; k < 9; k += 1) fitted.add(box(0.062, 0.006, 0.58, W.metalDark, { x: rx, y: 0.68 + k * 0.06, edge: false, cast: false }));
    fitted.add(box(0.05, 0.5, 0.54, W.plastic, { x: rx - 0.055, y: 0.92 }));
    fitted.add(cyl(0.05, 0.05, 0.05, W.black, { axis: 'x', x: rx - 0.1, y: 0.92, seg: 12 }));
    fitted.add(cyl(0.025, 0.025, 0.04, W.metalLight, { x: rx, y: 1.22, z: 0.2, edge: false }));
    fitted.add(strut([rx - 0.03, 1.12, -0.18], [front - 0.02, 1.15, -0.04], 0.045, 0.045, W.engine.hose, { round: true }));
    fitted.add(strut([rx - 0.03, 0.72, 0.18], [front - 0.02, 0.92, 0.04], 0.045, 0.045, W.engine.hose, { round: true }));
  };
  /** @type {ReturnType<typeof makeEngine>|null} */
  let engine = null;
  // A part going on: the engine settles on its mount, as it does when you bolt something to it.
  let settle = 0;
  /** @type {import('../world/models/engine.js').EngineDamage|null} */
  let damage = null;
  // The floor, in the engine's own frame: it hangs 0.4 under the head and is drawn 1.25 up.
  const FLOOR = -(MOUNT.y - 0.4) / 1.25;
  return {
    group,
    duct,
    get engine() { return /** @type {ReturnType<typeof makeEngine>} */ (engine); },
    /** @param {import('../world/models/engine.js').EngineSpec} spec @param {boolean} [jolt] */
    setSpec(spec, jolt = false) {
      if (engine) mount.remove(engine.group);
      engine = makeEngine(spec);
      engine.group.scale.setScalar(1.25);
      // Its back face against the head, hanging at the head's height.
      engine.group.position.set(0, -0.4, ((engine.size.len - 0.2) / 2 + 0.06) * 1.25);
      mount.add(engine.group);
      fit(MOUNT.x + (engine.size.len - 0.2 + 0.12) * 1.25);
      engine.setDamage(damage, FLOOR);
      if (jolt) settle = 1;
    },
    /** What wear and a failure have done to it. @param {import('../world/models/engine.js').EngineDamage|null} d */
    setDamage(d) { damage = d; engine?.setDamage(d, FLOOR); },
    /** The failure, played: once, when it happens. */
    blowUp() { engine?.blowUp(); },
    busy() { return !!engine?.busy(); },
    /** @param {number} dt @param {number} rpm */
    update(dt, rpm) {
      if (!engine) return;
      engine.update(dt, rpm);
      if (settle > 0) {
        settle = Math.max(0, settle - dt / 0.45);
        // Lowered on, a hair past where it rests, and settling back.
        engine.group.position.y = -0.4 + 0.05 * Math.sin(settle * Math.PI) * settle;
      }
    },
  };
}

/**
 * @param {any} stage from createStage
 * @param {{engineSpec: import('../world/models/engine.js').EngineSpec, cars?: ShopCars}} init
 */
export function buildShopScene(stage, init) {
  const scene = stage.scene;
  const root = new THREE.Group();
  scene.add(root);
  stage.setTime(0.15, false);
  // A closed room: nothing of the sky shows round it, and there is no haze in a shop.
  scene.background = new THREE.Color(W.wallBlack);
  scene.fog = null;
  // Lit as a shop is: overhead LED strips do the work, with the door down. The sky's fill is
  // what the walls bounce, and the room is what metal reflects.
  // Less fill than before: the light is where the fixtures are, and the corners fall away.
  stage.hemi.intensity = 0.2;
  stage.sun.intensity = 0.7;
  stage.sun.castShadow = false;
  scene.environment = roomReflections(stage.renderer);
  scene.environmentIntensity = 0.45;

  // ---- the room ----
  const floor = floorPlane(16, 14, W.floorShop, { y: 0 });
  floor.material = concreteFloor(16, 14);
  root.add(floor);
  // The shop, dressed: its frames, benches, tools, racking, jacks, the hoist (shopDetail.js).
  // None of it moves, so it is drawn as a few merged meshes, one per material.
  const dressing = new THREE.Group();
  root.add(dressing);
  dressShop(dressing);
  realize(dressing);
  mergeStatic(dressing);
  const wallC = W.wallBase;
  // A ceiling, so it is a room: from inside you see its roof, not the street's.
  const ceiling = box(16.6, 0.2, 15, wallC, { y: 5.1, z: 0.3 });
  root.add(ceiling);
  // Side walls, and the back wall either side of the door and above it.
  for (const s of [-1, 1]) root.add(box(0.3, 5, 14, wallC, { x: s * 8.15, y: 2.5 }));
  // As drawn: the door right of centre, the sign on the wall to its left.
  root.add(box(6.35, 5, 0.3, wallC, { x: -4.825, y: 2.5, z: -7.15 }));
  root.add(box(3.15, 5, 0.3, wallC, { x: 6.425, y: 2.5, z: -7.15 }));
  root.add(box(6.5, 1.4, 0.3, wallC, { x: 1.6, y: 4.3, z: -7.15 }));
  const door = closedDoor(6.5, 3.6);
  door.position.set(1.6, 0, -7.12);
  root.add(door);
  const sign = paintedSign('Caribou Tuning', 'Engine building and dyno tuning', 4.6, 1.15);
  sign.position.set(-4.85, 3.35, -7.0);
  root.add(sign);
  // The sign lit from above by its own lamp, as a shop's name is: warm, and the one place on
  // the back wall the eye goes first.
  const signLamp = new THREE.SpotLight(W.lampWarm, 14, 4, 0.6, 0.6, 1.5);
  signLamp.position.set(-4.85, 4.7, -6.2);
  signLamp.target.position.set(-4.85, 3.2, -7.0);
  scene.add(signLamp, signLamp.target);
  root.add(box(0.5, 0.06, 0.14, W.metalDark, { x: -4.85, y: 4.72, z: -6.25, edge: false }));
  // The job board on the left wall, by the dyno: a whiteboard in an aluminium frame with a
  // marker tray, the jobs' work orders held on it by magnets.
  const whiteboard = new THREE.Group();
  whiteboard.userData.spot = 'board';
  whiteboard.position.set(-7.97, 2.1, -4.9);
  whiteboard.add(box(0.06, 1.5, 2.2, W.white));
  for (const y of [-0.77, 0.77]) whiteboard.add(box(0.08, 0.04, 2.28, W.metalLight, { x: 0.01, y }));
  for (const z of [-1.12, 1.12]) whiteboard.add(box(0.08, 1.58, 0.04, W.metalLight, { x: 0.01, z }));
  whiteboard.add(box(0.12, 0.03, 1.6, W.metalLight, { x: 0.07, y: -0.78 }));
  root.add(whiteboard);
  // Its face, where the board's real tickets are pinned (the page's, ShopBackdrop.jsx); the
  // painted ones below stand in for them seen from across the shop.
  const boardAt = new THREE.Object3D();
  boardAt.position.set(-7.885, 2.1, -4.9);
  boardAt.rotation.y = Math.PI / 2;
  root.add(boardAt);
  const tickets = new THREE.Group();
  tickets.userData.spot = 'board';
  root.add(tickets);
  // Work orders up in rows, a magnet holding each, today's job in the shop's blue.
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      if ((r * 4 + c) % 5 === 3) continue;
      const y = 2.55 - r * 0.46 + ((c * 7 + r * 3) % 3) * 0.03;
      const z = -5.75 + c * 0.56;
      tickets.add(box(0.01, 0.36, 0.28, r === 0 && c === 1 ? W.toolBlue : W.plaster, { x: -7.93, y, z, edge: true }));
      tickets.add(cyl(0.02, 0.02, 0.02, W.black, { axis: 'x', x: -7.92, y: y + 0.14, z, edge: false }));
    }
  }
  const jobSign = paintedSign('Job board', '', 1.3, 0.3);
  jobSign.rotation.y = Math.PI / 2;
  jobSign.position.set(-8.02, 3.1, -4.9);
  root.add(jobSign);

  // Ceiling LED strip fixtures in rows over the work, the way a shop is lit: long, even,
  // white light from above, each row hung on two short chains. One light per row casts the
  // shadows that put the cars, stands and benches on the floor.
  // Hung from the ceiling, so they go with it when the view looks down through the roof.
  const fixtures = new THREE.Group();
  root.add(fixtures);
  for (const x of [-4.2, 0.2, 4.4]) {
    for (const z of [-3.6, 0.2, 3.4]) {
      const fx = new THREE.Group();
      fx.position.set(x, 4.55, z);
      fx.add(box(0.22, 0.06, 1.8, W.metalLight, { cast: false, edge: false }));
      const lens = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.01, 1.72), glow(W.lampWarm));
      lens.position.y = -0.035;
      fx.add(lens);
      for (const cz of [-0.7, 0.7]) fx.add(cyl(0.006, 0.006, 0.42, W.metalDark, { y: 0.24, z: cz, cast: false, edge: false }));
      fixtures.add(fx);
    }
    // Narrower than the room, so each row of fixtures leaves a pool of light on the floor
    // under it rather than one even wash from wall to wall.
    const key = new THREE.SpotLight(W.sky.day.sun, 40, 14, 1.0, 0.75, 1.6);
    key.position.set(x, 4.45, 0.4);
    key.target.position.set(x, 0, 0.6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.03;
    key.shadow.radius = 4;
    scene.add(key, key.target);
  }
  // ---- the dyno, and a car on it ----
  let dyno = makeDyno(true, { monitor: false, fanZ: -2.8, rollerZ: ROLLER_Z });
  dyno.position.copy(AT.dyno);
  root.add(dyno);
  /** @type {ReturnType<typeof makeCar>|null} */
  let dynoCar = null;

  // ---- the lift, a car up on it ----
  const lift = makeLift();
  lift.position.copy(AT.lift);
  lift.userData.setHeight?.(1.5);
  root.add(lift);
  /** @type {ReturnType<typeof makeCar>|null} */
  let liftCar = null;
  // A failure on the dyno: it happens in the car's engine bay, not on the stands.
  const dynoFx = { smoke: makeSmoke(40), debris: makeDebris(), flash: makeFlash() };
  root.add(dynoFx.smoke.group, dynoFx.debris.group, dynoFx.flash.group);
  const dynoBay = new THREE.Vector3(AT.dyno.x, 0.75, AT.dyno.z - 1.4);
  /** @type {THREE.Mesh|null} */
  let dynoOil = null;
  let dynoBroken = false;
  let dynoWreckAge = 0;
  let dynoPuffT = 0;
  /** What holds the car on the dyno: its straps, the extraction on its tailpipe. */
  const rigging = new THREE.Group();
  root.add(rigging);
  /**
   * Strap the car down and put the extraction on its exhaust, as nobody runs a car on the
   * rollers without both: a ratchet strap from each corner of the car to a ring in the
   * deck, and a hose from the tailpipe along the floor to the duct in the wall.
   * @param {number} len the car's length @param {number} z its centre
   */
  const rigDynoCar = (len, z) => {
    const x = AT.dyno.x;
    for (const e of [-1, 1]) {
      // e: -1 the nose (toward the door), 1 the tail.
      const ringZ = AT.dyno.z + e * 2.25;
      for (const sd of [-1, 1]) {
        const a = /** @type {[number, number, number]} */ ([x + sd * 1.05, 0.04, ringZ]);
        const b = /** @type {[number, number, number]} */ ([x + sd * 0.62, 0.3, z + e * (len / 2 - 0.55)]);
        rigging.add(strut(a, b, 0.035, 0.006, W.toolYellow, { cast: false }));
        const r = strut([a[0] + (b[0] - a[0]) * 0.35, a[1] + (b[1] - a[1]) * 0.35, a[2] + (b[2] - a[2]) * 0.35], [a[0] + (b[0] - a[0]) * 0.45, a[1] + (b[1] - a[1]) * 0.45, a[2] + (b[2] - a[2]) * 0.45], 0.06, 0.04, W.metalDark);
        rigging.add(r);
      }
    }
    // The tailpipe is left of centre, seen from behind the car.
    const tx = x - 0.5;
    const tz = z + len / 2 + 0.04;
    rigging.add(cyl(0.09, 0.06, 0.18, W.engine.hose, { axis: 'z', x: tx, y: 0.28, z: tz + 0.12, edge: false }));
    rigging.add(strut([tx, 0.28, tz + 0.2], [tx, 0.05, tz + 0.4], 0.08, 0.08, W.engine.hose, { round: true }));
    rigging.add(strut([tx, 0.05, tz + 0.4], [-7.78, 0.05, tz + 0.4], 0.08, 0.08, W.engine.hose, { round: true }));
    rigging.add(box(0.14, 0.34, 0.26, W.metalDark, { x: -7.9, y: 0.22, z: tz + 0.4 }));
  };
  /**
   * Put the cars in: the one on the dyno and the one up on the lift, each a look (a body
   * and a colour) or nothing, which leaves the rollers bare or the lift down.
   * @param {ShopCars} cars
   */
  const placeCars = (cars) => {
    const rollers = cars.rollers !== false;
    if (!!dyno.userData.rollers !== rollers) {
      root.remove(dyno);
      dyno = makeDyno(rollers, { monitor: false, fanZ: -2.8, rollerZ: ROLLER_Z });
      dyno.position.copy(AT.dyno);
      root.add(dyno);
    }
    if (dynoCar) root.remove(dynoCar.group);
    if (liftCar) root.remove(liftCar.group);
    rigging.clear();
    dynoCar = cars.dyno ? makeCar({ body: 'coupe', color: 'orange', ...cars.dyno }) : null;
    if (dynoCar) {
      // Its rear wheels cradled on the rollers, the fan a stride off its nose.
      const { len, wheelbase } = dynoCar.dims;
      const z = AT.dyno.z + ROLLER_Z - wheelbase / 2;
      dynoCar.group.position.set(AT.dyno.x, 0, z);
      dynoCar.group.rotation.y = Math.PI;
      root.add(dynoCar.group);
      // Its engine bay: under the bonnet, which faces the door.
      dynoBay.set(AT.dyno.x, 0.75, z - len / 2 + 0.75);
      const fan = dyno.userData.fan?.parent;
      if (fan) fan.position.z = z - AT.dyno.z - len / 2 - 0.42;
      if (rollers) rigDynoCar(len, z);
    }
    liftCar = cars.lift ? makeCar({ body: 'hatch', color: 'teal', ...cars.lift }) : null;
    lift.userData.setHeight?.(liftCar ? 1.5 : 0.1);
    if (liftCar) {
      liftCar.group.position.set(AT.lift.x, 1.6, AT.lift.z);
      liftCar.group.rotation.y = Math.PI;
      root.add(liftCar.group);
    }
    realize(root);
  };
  placeCars(init.cars ?? { dyno: {}, lift: {} });

  // ---- the engine: on the build bench, and on the run stand ----
  // The same engine on both, as the shop's one engine moves from one to the other: built on
  // the bench a part at a time, started and run on the stand.
  // Each turned a little toward you, so you see the belt end and the intake side together.
  const buildStand = makeEngineStand(AT.build, false, -0.5);
  const runStand = makeEngineStand(AT.stand, true, -0.5);
  for (const st of [buildStand, runStand]) { st.setSpec(init.engineSpec); root.add(st.group, st.duct); }
  realize(root);
  let engineSpecKey = JSON.stringify(init.engineSpec ?? {});
  /** @type {string|null} the failure last shown */
  let damageKey = null;
  let damagePrimed = false;
  buildStand.group.userData.spot = 'build';
  runStand.group.userData.spot = 'stand';

  // ---- the two carts: the dyno's computer, and the engine stand's beside the stand ----
  // The dyno's stands between its pose's camera and the car, a little to the left, turned to
  // face you, the car on the rollers behind it.
  const dynoCart = makeCart('dyno');
  {
    const pose = POSES.dyno;
    const f = new THREE.Vector3(pose.look.x - pose.pos.x, 0, pose.look.z - pose.pos.z).normalize();
    const l = new THREE.Vector3(f.z, 0, -f.x);
    dynoCart.group.position.copy(pose.pos).addScaledVector(f, 1.75).addScaledVector(l, 0.62).setY(0);
    dynoCart.group.rotation.y = Math.atan2(-f.x, -f.z);
    root.add(dynoCart.group);
  }
  const standCart = makeCart('stand');
  standCart.group.position.copy(AT.standCart);
  // Each cart is turned in toward its engine, as one is parked to watch the engine and the
  // screen together, not lined up square to the room. The station's view turns with it.
  standCart.group.rotation.y = 0.4;
  root.add(standCart.group);
  // The build bench's computer: a monitor and no control box, for there is nothing to start.
  const buildCart = makeCart('build');
  buildCart.group.position.copy(AT.buildCart);
  buildCart.group.rotation.y = 0.45;
  root.add(buildCart.group);
  /** @type {'wide'|'tall'|'short'|null} */
  let cartShape = null;
  /** @param {'wide'|'tall'|'short'} sh */
  const shapeCarts = (sh) => {
    if (sh === cartShape) return;
    cartShape = sh;
    dynoCart.shape(CART_SIZES.dyno[sh]);
    standCart.shape(CART_SIZES.stand[sh]);
    buildCart.shape({ ...CART_SIZES.build[sh], cw: 0, ch: 0, side: false });
    root.updateMatrixWorld(true);
    poseCache.clear();
  };
  /** The faces the page's controls are laid on, by name. */
  const surfaces = {
    dynoMonitor: dynoCart.monitor, dynoConsole: dynoCart.console,
    standMonitor: standCart.monitor, standConsole: standCart.console,
    buildMonitor: buildCart.monitor,
    board: { at: boardAt, w: 2.04, h: 1.4 },
  };
  // Seen on a screen taller than wide, the board hangs the tall way (1.6 by 2.3 m), so its
  // tickets fill the phone rather than a strip across it.
  let boardTall = false;
  const shapeBoard = (tall) => {
    if (tall === boardTall) return;
    boardTall = tall;
    const [w, h] = tall ? [1.6, 2.3] : [2.2, 1.5];
    whiteboard.scale.set(1, h / 1.5, w / 2.2);
    whiteboard.position.y = tall ? 2.45 : 2.1;
    boardAt.position.y = whiteboard.position.y;
    surfaces.board.w = w - 0.16;
    surfaces.board.h = h - 0.1;
    jobSign.position.y = whiteboard.position.y + h / 2 + 0.45;
    poseCache.clear();
  };

  // ---- your desk, and the laptop on it ----
  const desk = new THREE.Group();
  desk.userData.spot = 'laptop';
  desk.position.copy(AT.desk);
  // A shop desk, not an office one: a hardwood top on a steel frame, a drawer pedestal under
  // one end, and on it what the day's work needs: the laptop, the job's paperwork, a mug.
  desk.add(box(2.2, 0.05, 0.85, W.woodLight, { y: 0.795 }));
  desk.add(box(2.2, 0.06, 0.03, W.metalDark, { y: 0.74, z: 0.41, edge: false }));
  for (const x of [-1.05, 1.05]) for (const z of [-0.37, 0.37]) desk.add(box(0.05, 0.77, 0.05, W.metalDark, { x, y: 0.385, z }));
  for (const x of [-1.05, 1.05]) desk.add(box(0.04, 0.04, 0.7, W.metalDark, { x, y: 0.12 }));
  desk.add(box(0.45, 0.66, 0.72, W.engine.standDark, { x: 0.74, y: 0.4 }));
  for (const y of [0.62, 0.42, 0.2]) desk.add(box(0.26, 0.02, 0.02, W.metalLight, { x: 0.74, y, z: 0.37, edge: false }));
  // A work order on a clipboard, and a printed dyno sheet beside it.
  desk.add(box(0.24, 0.012, 0.32, W.woodDark, { x: -0.62, y: 0.826, z: 0.12 }));
  desk.add(box(0.21, 0.004, 0.28, W.white, { x: -0.62, y: 0.834, z: 0.13, edge: false }));
  desk.add(box(0.08, 0.02, 0.03, W.metalLight, { x: -0.62, y: 0.84, z: -0.01, edge: false }));
  const sheet = box(0.21, 0.003, 0.29, W.white, { x: -0.92, y: 0.822, z: 0.06, edge: false });
  sheet.rotation.y = 0.25;
  desk.add(sheet);
  const mug = cyl(0.045, 0.04, 0.1, W.plaster, { x: 0.82, y: 0.87, z: -0.1, edge: false });
  desk.add(mug);
  // The laptop: a base, and a lid on a hinge at its back edge.
  const laptop = new THREE.Group();
  laptop.position.set(0, 0.835, 0.1);
  // Space grey aluminium, lit like everything else on the desk.
  const black = new THREE.MeshStandardMaterial({ color: W.engine.coverDark, metalness: 0.6, roughness: 0.38 });
  const slab = (w, h, d, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), black); m.position.z = z; return m; };
  laptop.add(slab(0.7, 0.03, 0.48));
  const hinge = new THREE.Group();
  hinge.position.set(0, 0.015, -0.24);
  hinge.add(slab(0.7, 0.02, 0.46, 0.23));
  const lidScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.4), new THREE.MeshBasicMaterial({ color: W.screen }));
  lidScreen.rotation.x = -Math.PI / 2;
  lidScreen.position.set(0, -0.011, 0.23);
  hinge.add(lidScreen);
  laptop.add(hinge);
  desk.add(laptop);
  root.add(desk);

  // ---- the camera ----
  const cam = stage.camera;
  const from = { pos: POSES.desk.pos.clone(), look: POSES.desk.look.clone(), fov: POSES.desk.fov };
  const now = { pos: POSES.desk.pos.clone(), look: POSES.desk.look.clone(), fov: POSES.desk.fov };
  /** @type {{pos: THREE.Vector3, look: THREE.Vector3, fov: number, exact?: boolean}} */
  let target = POSES.desk;
  let poseAspect = 0;
  let lastPose = 'desk';
  let blend = 1;
  let lid = 0; // 0 open, 1 shut
  let lidTarget = 0;

  const poseCache = new Map();

  /**
   * What of the view the page leaves clear, in pixels from each edge of the canvas: the
   * page's header and the job bar cover its top. A station is fitted into what is left.
   */
  const frame = { top: 56, bottom: 0, left: 0, right: 0, w: 1600, h: 1000 };
  const probe = new THREE.PerspectiveCamera();

  /**
   * Standing at a station, ready to work it: its cart's monitor and control box fill what of
   * the screen the page leaves clear, whatever its shape, as you stand at a real dyno or a
   * run stand. At the engine stand on a wide screen the engine on the stand is in the frame
   * too, beside its computer, so you see each part go on as you choose it. The camera looks
   * along the monitor's own normal, tipped a little down onto the box, and is moved until
   * every corner lands inside the clear area: an exact fit, not an estimate.
   * @param {'dyno'|'stand'|'build'|'board'} name
   */
  const stationPose = (name) => {
    const key = `station:${name}:${cam.aspect.toFixed(3)}:${frame.top}:${frame.bottom}:${frame.left}:${frame.right}:${frame.h}`;
    const hit = poseCache.get(key);
    if (hit) return hit;
    const cart = name === 'dyno' ? dynoCart : name === 'build' ? buildCart : name === 'board' ? null : standCart;
    root.updateMatrixWorld(true);
    /** @type {THREE.Vector3[]} */
    const pts = [];
    // The board is read square on, its frame inside the clear area like a station's screen.
    for (const sf of cart ? [cart.monitor, cart.console] : [surfaces.board]) {
      if (!sf.w) continue;
      // The bezel round the face too: the whole screen is in view, not just its picture.
      const bz = 0.04;
      for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        pts.push(new THREE.Vector3(x * (sf.w / 2 + bz), y * (sf.h / 2 + bz), 0).applyMatrix4(sf.at.matrixWorld));
      }
    }
    // The engine beside its computer only where there is the height for both: on a phone
    // held sideways the computer alone fills the view, and the software shows the engine.
    if ((name === 'stand' || name === 'build') && cartShape === 'wide' && frame.h - frame.top - frame.bottom > 420) {
      // The whole stand, its feet on the floor, not only the engine on it.
      // The stand and its engine: not the smoke, debris and flash a damaged engine carries,
      // which would push the camera back by however far they could fly.
      const bb = new THREE.Box3();
      const solid = (/** @type {THREE.Object3D} */ o) => {
        if (o.userData.fx) return;
        if (/** @type {THREE.Mesh} */ (o).isMesh) bb.expandByObject(o, false);
        else for (const c of o.children) solid(c);
      };
      const stand = (name === 'build' ? buildStand : runStand).group;
      stand.updateWorldMatrix(true, true);
      solid(stand);
      for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) pts.push(new THREE.Vector3(x, y, z));
    }
    const center = pts.reduce((acc, v) => acc.add(v), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    const q = new THREE.Quaternion(); (cart ? cart.monitor.at : boardAt).getWorldQuaternion(q);
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(q).setY(0).normalize();
    const pitch = cart ? 0.14 : 0;
    const dir = n.clone().multiplyScalar(Math.cos(pitch)).add(new THREE.Vector3(0, Math.sin(pitch), 0)).normalize();
    const right = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
    const up = dir.clone().cross(right).normalize();
    const fov = 38;
    probe.fov = fov; probe.aspect = cam.aspect; probe.near = 0.05; probe.far = 200; probe.updateProjectionMatrix();
    // The clear area in normalised device coordinates, with a small margin all round.
    const m = Math.max(12, Math.min(frame.w, frame.h - frame.top) * 0.03);
    const fw = Math.max(1, frame.w); const fh = Math.max(1, frame.h);
    const L = -1 + (2 * (frame.left + m)) / fw; const R = 1 - (2 * (frame.right + m)) / fw;
    const T = 1 - (2 * (frame.top + m)) / fh; const B = -1 + (2 * (frame.bottom + m)) / fh;
    const tv = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const look = center.clone();
    let dist = 3;
    const v = new THREE.Vector3();
    for (let i = 0; i < 8; i += 1) {
      probe.position.copy(look).addScaledVector(dir, dist);
      probe.lookAt(look);
      probe.updateMatrixWorld(true);
      let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
      for (const p of pts) {
        v.copy(p).project(probe);
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
      }
      const k = Math.max((x1 - x0) / (R - L), (y1 - y0) / (T - B));
      // Room to spare up and down (a phone held upright): the station rides up under the
      // header rather than floating mid-screen; across, it is centred.
      const hk = (y1 - y0) / k;
      const wantY = hk < (T - B) - 0.02 ? T - hk / 2 : (T + B) / 2;
      const dx = ((x0 + x1) / 2) / k - (L + R) / 2;
      const dy = ((y0 + y1) / 2) / k - wantY;
      dist *= k;
      look.addScaledVector(right, dx * dist * tv * cam.aspect).addScaledVector(up, dy * dist * tv);
    }
    const p = { pos: look.clone().addScaledVector(dir, dist), look, fov, exact: true };
    poseCache.set(key, p);
    return p;
  };

  const anchors = {
    dyno: new THREE.Vector3(AT.dyno.x, 1.7, AT.dyno.z),
    stand: new THREE.Vector3(AT.stand.x + 0.6, 2.0, AT.stand.z),
    build: new THREE.Vector3(AT.build.x + 0.6, 2.0, AT.build.z),
    laptop: new THREE.Vector3(AT.desk.x, 1.1, AT.desk.z + 0.1),
    board: new THREE.Vector3(-7.6, 2.3, -4.9),
  };
  let t = 0;
  const ray = new THREE.Raycaster();
  const api = {
    anchors,
    camera: cam,
    /** @param {'desk'|'bay'|'dyno'|'stand'|'build'|'board'} pose */
    setPose(pose) {
      lastPose = pose;
      shapeBoard(cam.aspect < 1);
      // Upright, the monitor turns on its pivot; on a view too short for the box under the
      // monitor (a phone held sideways), the box hangs beside it.
      shapeCarts(cam.aspect < 0.9 ? 'tall' : frame.h - frame.top < 440 ? 'short' : 'wide');
      if (poseAspect !== cam.aspect) { poseCache.clear(); poseAspect = cam.aspect; }
      // The board is read square on, close enough to fill the screen. At the dyno or the
      // stand you stand at its cart, the whole of it in view: there is nothing to lean in to.
      const p = pose === 'dyno' || pose === 'stand' || pose === 'build' || pose === 'board' ? stationPose(pose)
          : (cam.aspect < 1 && POSES[`${pose}Tall`]) || POSES[pose] || POSES.desk;
      if (p === target) return;
      ceiling.visible = p !== POSES.bayTall;
      fixtures.visible = ceiling.visible;
      // The extraction hoses hang from the ceiling too.
      buildStand.duct.visible = ceiling.visible;
      runStand.duct.visible = ceiling.visible;
      from.pos.copy(now.pos); from.look.copy(now.look); from.fov = now.fov;
      target = p;
      blend = 0;
      lidTarget = pose === 'desk' ? 0 : 1;
    },
    setCars: placeCars,
    /**
     * Which place, if any, is at a point on the picture: a station's cart, its engine and
     * stand, the dyno and the car on it, the job board, or the desk with the laptop. The
     * shop is the menu: these are what you click.
     * @param {number} x @param {number} y normalised device coordinates
     * @returns {'dyno'|'stand'|'build'|'board'|'laptop'|null}
     */
    pickAt(x, y) {
      ray.setFromCamera(new THREE.Vector2(x, y), cam);
      const targets = [dynoCart.group, standCart.group, buildCart.group, buildStand.group, runStand.group, dyno, dynoCar?.group, whiteboard, tickets, desk].filter(Boolean);
      const hit = ray.intersectObjects(/** @type {THREE.Object3D[]} */ (targets), true)[0];
      for (let o = hit?.object ?? null; o; o = o.parent) {
        if (o.userData.spot) return o.userData.spot;
        if (o === dyno || o === dynoCar?.group) return 'dyno';
      }
      return null;
    },
    /** Light up the station being pointed at. @param {string|null} id */
    hover(id) {
      dynoCart.hover(id === 'dyno');
      standCart.hover(id === 'stand');
      buildCart.hover(id === 'build');
    },
    surfaces,
    /** The painted tickets show unless the real ones are pinned over them. @param {boolean} on */
    setTickets(on) { tickets.visible = on; },
    /**
     * What of the view the page leaves clear: a station is fitted into it.
     * @param {{top: number, bottom: number, left: number, right: number, w: number, h: number}} f pixels
     */
    setFrame(f) {
      const r = (x) => Math.round(x);
      if (r(f.top) === frame.top && r(f.bottom) === frame.bottom && r(f.left) === frame.left && r(f.right) === frame.right && r(f.w) === frame.w && r(f.h) === frame.h) return;
      frame.top = r(f.top); frame.bottom = r(f.bottom); frame.left = r(f.left); frame.right = r(f.right); frame.w = r(f.w); frame.h = r(f.h);
      if (lastPose === 'dyno' || lastPose === 'stand' || lastPose === 'build' || lastPose === 'board') api.setPose(/** @type {any} */ (lastPose));
    },
    /** @returns {boolean} the camera is still on its way somewhere */
    moving() { return blend < 1; },
    /** Whether smoke, debris or a flash is still moving and has to be drawn. */
    busy() { return buildStand.busy() || runStand.busy() || dynoFx.smoke.busy() || dynoFx.debris.busy() || dynoFx.flash.busy(); },
    /**
     * The engine's condition, drawn on it, and its failure played where it happened. Both
     * stands hold the shop's one engine, so both show the wear and the wreck; the failure
     * plays once, on the run stand if it failed running there, or in the car on the dyno
     * if it failed in a pull. `key` names the failure: a new one plays, the same one
     * again does not, and one already there when the shop is first drawn is shown
     * wrecked without playing.
     * @param {import('../world/models/engine.js').EngineDamage|null} d
     * @param {'stand'|'dyno'|null} where @param {string|null} key
     */
    setDamage(d, where, key) {
      buildStand.setDamage(d);
      runStand.setDamage(d);
      realize(root);
      const failed = !!d?.failed;
      if (failed && key && key !== damageKey && damagePrimed) {
        if (where === 'dyno') {
          dynoFx.flash.fire(dynoBay);
          dynoFx.debris.burst(dynoBay, new THREE.Vector3(0, 1, -0.6), 14, [glow(W.engine.flash), ...['block', 'turbo', 'blockDark'].map((c) => new THREE.MeshStandardMaterial({ color: W.engine[c], metalness: 0.6, roughness: 0.5 }))], 0);
          for (let i = 0; i < 24; i += 1) dynoFx.smoke.emit(dynoBay, { color: i % 3 ? W.engine.smokeDark : W.engine.smoke, size: 0.18, rise: 0.6 + Math.random() * 0.5, life: 4 + Math.random() * 3, opacity: 0.75, spread: 0.5 });
        } else runStand.blowUp();
      }
      damageKey = key;
      damagePrimed = true;
      const wasBroken = dynoBroken;
      dynoBroken = failed && where === 'dyno';
      if (dynoBroken && !wasBroken) {
        dynoWreckAge = 0;
        // Oil out of the car onto the dyno's deck and the floor in front of it.
        dynoOil = new THREE.Mesh(new THREE.CircleGeometry(0.75, 24), new THREE.MeshStandardMaterial({ color: W.engine.oil, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.85, depthWrite: false }));
        dynoOil.rotation.x = -Math.PI / 2;
        dynoOil.scale.set(1, 0.7, 1);
        dynoOil.position.set(dynoBay.x, 0.04, dynoBay.z);
        root.add(dynoOil);
      }
      if (!dynoBroken && dynoOil) {
        root.remove(dynoOil);
        dynoOil.geometry.dispose();
        dynoOil = null;
        dynoFx.smoke.clear();
        dynoFx.debris.clear();
      }
    },
    /** @param {import('../world/models/engine.js').EngineSpec} spec */
    setEngine(spec) {
      const key = JSON.stringify(spec ?? {});
      if (key === engineSpecKey) return;
      engineSpecKey = key;
      buildStand.setSpec(spec, true);
      runStand.setSpec(spec);
      realize(root);
      // A bigger or smaller engine changes what the stands' views have to fit.
      for (const k of [...poseCache.keys()]) if (k.startsWith('station:stand') || k.startsWith('station:build')) poseCache.delete(k);
      if (lastPose === 'stand' || lastPose === 'build') api.setPose(lastPose);
    },
    /**
     * @param {number} dt @param {number} rpm the engine on the stand, 0 when it is off
     * @param {number} [dynoRpm] the engine of the car on the dyno during a pull, 0 between
     */
    update(dt, rpm, dynoRpm = 0) {
      t += dt;
      blend = Math.min(1, blend + dt / 0.7);
      const k = blend * blend * (3 - 2 * blend);
      now.pos.lerpVectors(from.pos, target.pos, k);
      now.look.lerpVectors(from.look, target.look, k);
      now.fov = from.fov + (target.fov - from.fov) * k;
      cam.position.copy(now.pos);
      // The poses are framed for a wide screen. On a narrower one (a phone held upright)
      // keep about the same width of shop in view: open the lens vertically to match, up
      // to the point where it would see out past the room; the markers stay on screen.
      const wide = 1.6;
      const fov = cam.aspect >= wide || target.exact ? now.fov
        : Math.min(80, 2 * THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(now.fov / 2)) * wide / cam.aspect)));
      if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
      cam.lookAt(now.look);
      // The phone turned: frame the shop for its new shape.
      const tall = POSES[`${lastPose}Tall`];
      if (tall && (target === tall) !== (cam.aspect < 1)) api.setPose(/** @type {any} */ (lastPose));
      // Standing at a station or the board, and the screen changed shape: frame it again.
      if (target.exact && poseAspect !== cam.aspect) api.setPose(/** @type {any} */ (lastPose));
      lid += (lidTarget - lid) * Math.min(1, dt * 5);
      // Open, the lid stands up a little past vertical; shut, it lies on the base.
      hinge.rotation.x = -(1 - lid) * 1.85;
      // Shut, the screen is face down inside: only the black lid shows.
      lidScreen.visible = lid < 0.9;
      buildStand.update(dt, 0);
      runStand.update(dt, rpm);
      // A car that failed on the dyno smoulders under its bonnet, thinning to a wisp.
      if (dynoBroken) {
        dynoWreckAge += dt;
        dynoPuffT += dt * (10 * Math.exp(-dynoWreckAge / 3) + 0.8);
        while (dynoPuffT > 1) { dynoPuffT -= 1; dynoFx.smoke.emit(dynoBay, { color: W.engine.smokeDark, size: 0.12, rise: 0.4, life: 2.8, opacity: 0.4, spread: 0.4 }); }
      }
      dynoFx.smoke.update(dt);
      dynoFx.debris.update(dt);
      dynoFx.flash.update(dt);
      // The dyno's rollers and the car on them idle over; the lift stays put. In a pull the
      // wheels turn with the engine, through a gear (a picture, not the drivetrain model:
      // about 3.6 turns of the crank to one of the wheels in the gear a pull is made in).
      const wheelHz = dynoRpm > 0 ? dynoRpm / 60 / 3.6 : 0.3;
      const roll = wheelHz * 2 * Math.PI * 0.32 * dt;
      dynoCar?.roll?.(roll);
      for (const r of dyno.userData.rollers ?? []) r.rotation.x -= roll / 0.22;
      if (dyno.userData.fan && dynoRpm > 0) dyno.userData.fan.rotation.z += dt * 14;
      stage.followLight(new THREE.Vector3(0, 0, 0));
      void t;
    },
  };
  realize(scene);
  return api;
}
