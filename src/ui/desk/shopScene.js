/**
 * Your shop, behind the laptop: the room the sandbox happens in.
 *
 * Seen from your desk, the garage door at the far end is open and the street goes past
 * outside (cars, trees, the houses opposite). The dyno is on the left with a car on its
 * rollers, a car is up on the lift on the right, and between them, nearer, the engine you
 * are building runs on its stand. The CARIBOU TUNING sign is on the back wall, left of the door.
 *
 * Two camera poses: `desk`, sitting at the desk looking over the laptop, and `bay`, stood
 * up looking at the whole shop with the laptop shut. The scene glides between them.
 * `anchors` are the points the shop view's buttons sit on.
 *
 * Coordinates, metres: x across the shop, y up, z toward you (the door is at z = -7).
 */

import { world as W } from '../tokens.js';
import { THREE, box, cyl, floorPlane, groundPlane } from '../world/gfx.js';
import { makeCar } from '../world/models/car.js';
import { makeEngine } from '../world/models/engine.js';
import { dressShop } from './shopDetail.js';
import { makeDyno, makeLamp, makeLift, makeRollupDoor, makeRoundTree, makeTree } from '../world/models/props.js';
import { makeBuilding } from '../world/models/buildings.js';

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
function makeCart() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const monitorAt = new THREE.Object3D();
  const consoleAt = new THREE.Object3D();
  g.add(monitorAt);
  const monitor = { at: monitorAt, w: 1, h: 1 };
  const panel = { at: consoleAt, w: 1, h: 1 };
  /**
   * @param {{mw: number, mh: number, cw: number, ch: number, side?: boolean}} d metres; `side`
   *   hangs the control box beside the monitor on an arm, for a view too short for both stacked
   */
  const shape = ({ mw, mh, cw, ch, side = false }) => {
    body.clear();
    body.add(box(Math.max(0.95, cw + 0.1), 0.06, 0.62, W.engine.standDark, { y: 0.16 }));
    for (const [x, z] of [[-0.4, -0.25], [-0.4, 0.25], [0.4, -0.25], [0.4, 0.25]]) body.add(cyl(0.06, 0.06, 0.06, W.black, { axis: 'x', x, y: 0.06, z, edge: false }));
    // The control box: a steel box at hand height, its panel leaning back about 24 degrees;
    // or, beside the monitor, a pendant box on an arm, standing nearly upright.
    const tilt = side ? 0.12 : 0.42;
    const box0 = new THREE.Group();
    const my = side ? 1.5 : 0.96 + (ch / 2) * Math.cos(tilt) + 0.12 + mh / 2;
    if (side) {
      box0.position.set(mw / 2 + 0.1 + cw / 2, my, -0.08);
      body.add(box(0.12, 0.05, 0.05, W.metalDark, { x: mw / 2 + 0.06, y: my, z: -0.1 }));
    } else box0.position.set(0, 0.96, 0.08);
    box0.rotation.x = -tilt;
    box0.add(box(cw + 0.08, ch + 0.08, 0.1, W.engine.standDark, { z: -0.05 }));
    consoleAt.position.set(0, 0, 0.002);
    box0.add(consoleAt);
    // A cart with no control box (the build bench's) has only its monitor.
    if (cw > 0) body.add(box0);
    // The post, and the monitor on it: its bottom edge just clear of the box.
    body.add(box(0.08, my - 0.2, 0.08, W.metalDark, { y: 0.2 + (my - 0.2) / 2, z: -0.16 }));
    body.add(box(mw + 0.07, mh + 0.07, 0.05, W.black, { y: my, z: -0.1 }));
    monitorAt.position.set(0, my, -0.074);
    monitor.w = mw; monitor.h = mh;
    panel.w = cw; panel.h = ch;
  };
  return { group: g, monitor, console: panel, shape };
}

/** The carts' faces for each shape of view, metres: monitor, then control box. */
const CART_SIZES = {
  dyno: { short: { mw: 1.32, mh: 0.8, cw: 0.4, ch: 0.66, side: true }, wide: { mw: 1.32, mh: 0.8, cw: 0.92, ch: 0.3 }, tall: { mw: 0.68, mh: 1.12, cw: 0.72, ch: 0.26 } },
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

/**
 * A sign board lettered by hand: the shop's name in the interface's handwriting, inked on
 * paper with a wash underline, rather than the career town's pixel lettering. The texture
 * is redrawn once the handwriting font has loaded, so it never keeps a fallback face.
 * @param {string} text @param {number} w metres @param {number} h metres
 */
function handSign(text, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = Math.round(640 * (h / w));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    const g = canvas.getContext('2d');
    if (!g) return;
    const { width: cw, height: ch } = canvas;
    g.fillStyle = W.sketch.paper;
    g.fillRect(0, 0, cw, ch);
    g.strokeStyle = W.sketch.ink;
    g.lineWidth = 5;
    g.strokeRect(8, 8, cw - 16, ch - 16);
    g.fillStyle = W.toolBlue;
    g.globalAlpha = 0.35;
    g.fillRect(40, ch * 0.7, cw - 80, ch * 0.12);
    g.globalAlpha = 1;
    g.fillStyle = W.sketch.ink;
    g.font = `${Math.round(ch * 0.58)}px 'Patrick Hand', cursive`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, cw / 2, ch * 0.5);
    tex.needsUpdate = true;
  };
  draw();
  document.fonts?.load(`40px 'Patrick Hand'`).then(draw, () => {});
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), [
    ...Array(4).fill(new THREE.MeshToonMaterial({ color: W.sketch.ink })),
    new THREE.MeshBasicMaterial({ map: tex }),
    new THREE.MeshToonMaterial({ color: W.sketch.ink }),
  ]);
  return board;
}

/**
 * An engine on a stand: the build bench's, where it is built a part at a time, or the run
 * stand's, plumbed to a radiator and an exhaust so it can be started. Both hold the same
 * engine, drawn from the build (`setSpec`); only the run stand's turns (`update`).
 * @param {THREE.Vector3} at @param {boolean} run
 */
function makeEngineStand(at, run) {
  const group = new THREE.Group();
  group.position.copy(at);
  // Turned a little toward you, so you see the belt end and the intake side together.
  group.rotation.y = -0.5;
  const c = run ? W.engine.standDark : W.engine.stand;
  group.add(box(1.4, 0.06, 0.12, c, { y: 0.1 }));
  group.add(box(0.12, 0.06, 1.1, c, { x: -0.6, y: 0.1 }));
  group.add(box(0.12, 0.06, 1.1, c, { x: 0.6, y: 0.1 }));
  for (const [x, z] of [[-0.6, -0.5], [-0.6, 0.5], [0.6, -0.5], [0.6, 0.5]]) group.add(cyl(0.06, 0.06, 0.08, W.black, { x, y: 0.04, z, edge: false }));
  group.add(box(0.1, 0.9, 0.1, W.engine.standDark, { y: 0.55, z: -0.1 }));
  if (run) {
    // A run stand's radiator ahead of the belt end, and its exhaust out the back.
    group.add(box(0.08, 0.6, 0.5, W.engine.cooler, { x: 0.78, y: 0.75 }));
    group.add(cyl(0.05, 0.05, 0.9, W.engine.pipe, { axis: 'x', x: -1.05, y: 0.45, edge: false }));
  }
  const mount = new THREE.Group();
  mount.position.set(0, 0.95, 0);
  mount.rotation.y = Math.PI / 2;
  group.add(mount);
  /** @type {ReturnType<typeof makeEngine>|null} */
  let engine = null;
  // A part going on: the engine settles on its mount, as it does when you bolt something to it.
  let settle = 0;
  return {
    group,
    get engine() { return /** @type {ReturnType<typeof makeEngine>} */ (engine); },
    /** @param {import('../world/models/engine.js').EngineSpec} spec @param {boolean} [jolt] */
    setSpec(spec, jolt = false) {
      if (engine) mount.remove(engine.group);
      engine = makeEngine(spec);
      engine.group.scale.setScalar(1.25);
      engine.group.position.set(0, -0.4, 0);
      mount.add(engine.group);
      if (jolt) settle = 1;
    },
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
  // Under its roof the sun barely reaches: the shop's own lamps light it, warm, from above.
  const shopLight = new THREE.PointLight(W.sky.day.sun, 34, 24, 1.6);
  shopLight.position.set(0, 4.6, 0.5);
  scene.add(shopLight);
  stage.setDriving(true);

  // ---- the room ----
  root.add(floorPlane(16, 14, W.floorEpoxy, { y: 0 }));
  // The shop, dressed: benches, tools, racking, jacks, the hoist, lights (shopDetail.js).
  dressShop(root);
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
  const door = makeRollupDoor(6.5);
  door.position.set(1.6, 0, -7.2);
  root.add(door);
  const sign = handSign('Caribou Tuning', 5.4, 1.1);
  sign.position.set(-4.85, 3.3, -6.95);
  root.add(sign);
  // The job board on the left wall: a cork board of tickets, by the dyno.
  const cork = box(0.12, 1.5, 2.2, W.woodLight, { x: -7.95, y: 2.1, z: -4.9 });
  root.add(cork);
  // Its face, where the board's real tickets are pinned (the page's, ShopBackdrop.jsx); the
  // painted ones below stand in for them seen from across the shop.
  const boardAt = new THREE.Object3D();
  boardAt.position.set(-7.885, 2.1, -4.9);
  boardAt.rotation.y = Math.PI / 2;
  root.add(boardAt);
  const tickets = new THREE.Group();
  root.add(tickets);
  // Job tickets pinned up in rows, a pin in each, one in the shop's blue for today's job.
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      if ((r * 4 + c) % 5 === 3) continue;
      const y = 2.55 - r * 0.46 + ((c * 7 + r * 3) % 3) * 0.03;
      const z = -5.75 + c * 0.56;
      tickets.add(box(0.03, 0.36, 0.38, r === 0 && c === 1 ? W.toolBlue : W.white, { x: -7.87, y, z, edge: true }));
      tickets.add(cyl(0.025, 0.025, 0.05, W.toolRed, { axis: 'x', x: -7.84, y: y + 0.13, z, edge: false }));
    }
  }
  const jobSign = handSign('Jobs', 1.2, 0.36);
  jobSign.rotation.y = Math.PI / 2;
  jobSign.position.set(-7.9, 3.1, -4.9);
  root.add(jobSign);

  // Lamps over the work, forward of the door so none hangs in front of the sign.
  for (const x of [-4.6, 0, 4.6]) {
    const lamp = makeLamp();
    lamp.position.set(x, 4.9, 2.4);
    root.add(lamp);
  }
  // ---- outside: the street ----
  const outside = groundPlane(160, 60, { base: W.grass, alt: W.grassDark, kind: 'blades', tile: 3 });
  outside.position.set(0, -0.02, -38);
  root.add(outside);
  root.add(floorPlane(160, 9, W.asphalt, { y: 0.0, z: -14 }));
  root.add(floorPlane(160, 2.4, W.concrete, { y: 0.01, z: -8.6 }));
  for (let i = -8; i <= 8; i += 1) root.add(box(1.6, 0.012, 0.15, W.roadLine, { x: i * 4, y: 0.02, z: -14, edge: false, cast: false }));
  for (const [x, z, k] of [[-12, -20, 0], [-4, -22, 1], [6, -21, 2], [15, -20, 3]]) {
    const b = makeBuilding({ w: 8, d: 7, h: 5 + (k % 2), wall: [W.plaster, W.brick, W.wallBlue, W.wallGreen][k], trim: W.concreteLight, roof: W.roof, roofKind: 'gable', doorX: 0, doorW: 1.4, winCols: 2 });
    b.position.set(x, 0, z);
    root.add(b);
  }
  for (const [x, z, k] of [[-8, -18, 1], [1, -18.5, 2], [10, -18, 3], [-17, -18, 4]]) {
    const t = k % 2 ? makeTree(k) : makeRoundTree(k);
    t.position.set(x, 0, z);
    root.add(t);
  }
  // A few cars going by, each lane its own way, wrapping round past the edge of the view.
  const traffic = [['blue', 'sedan', -12.6, 9, 0], ['red', 'hatch', -15.4, -7, 20], ['white', 'pickup', -12.6, 8, -24]].map(([color, body, z, v, x0]) => {
    const c = makeCar({ body: /** @type {string} */ (body), color: /** @type {string} */ (color) });
    c.group.position.set(/** @type {number} */ (x0), 0, /** @type {number} */ (z));
    c.group.rotation.y = /** @type {number} */ (v) > 0 ? Math.PI / 2 : -Math.PI / 2;
    root.add(c.group);
    return { c, v: /** @type {number} */ (v) };
  });

  // ---- the dyno, and a car on it ----
  let dyno = makeDyno(true, { monitor: false });
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
  /**
   * Put the cars in: the one on the dyno and the one up on the lift, each a look (a body
   * and a colour) or nothing, which leaves the rollers bare or the lift down.
   * @param {ShopCars} cars
   */
  const placeCars = (cars) => {
    const rollers = cars.rollers !== false;
    if (!!dyno.userData.rollers !== rollers) {
      root.remove(dyno);
      dyno = makeDyno(rollers, { monitor: false });
      dyno.position.copy(AT.dyno);
      root.add(dyno);
    }
    if (dynoCar) root.remove(dynoCar.group);
    if (liftCar) root.remove(liftCar.group);
    dynoCar = cars.dyno ? makeCar({ body: 'coupe', color: 'orange', ...cars.dyno }) : null;
    if (dynoCar) {
      dynoCar.group.position.copy(AT.dyno);
      dynoCar.group.rotation.y = Math.PI;
      root.add(dynoCar.group);
    }
    liftCar = cars.lift ? makeCar({ body: 'hatch', color: 'teal', ...cars.lift }) : null;
    lift.userData.setHeight?.(liftCar ? 1.5 : 0.1);
    if (liftCar) {
      liftCar.group.position.set(AT.lift.x, 1.6, AT.lift.z);
      liftCar.group.rotation.y = Math.PI;
      root.add(liftCar.group);
    }
  };
  placeCars(init.cars ?? { dyno: {}, lift: {} });

  // ---- the engine: on the build bench, and on the run stand ----
  // The same engine on both, as the shop's one engine moves from one to the other: built on
  // the bench a part at a time, started and run on the stand.
  const buildStand = makeEngineStand(AT.build, false);
  const runStand = makeEngineStand(AT.stand, true);
  for (const st of [buildStand, runStand]) { st.setSpec(init.engineSpec); root.add(st.group); }
  let engineSpecKey = JSON.stringify(init.engineSpec ?? {});

  // ---- the two carts: the dyno's computer, and the engine stand's beside the stand ----
  // The dyno's stands between its pose's camera and the car, a little to the left, turned to
  // face you, the car on the rollers behind it.
  const dynoCart = makeCart();
  {
    const pose = POSES.dyno;
    const f = new THREE.Vector3(pose.look.x - pose.pos.x, 0, pose.look.z - pose.pos.z).normalize();
    const l = new THREE.Vector3(f.z, 0, -f.x);
    dynoCart.group.position.copy(pose.pos).addScaledVector(f, 1.75).addScaledVector(l, 0.62).setY(0);
    dynoCart.group.rotation.y = Math.atan2(-f.x, -f.z);
    root.add(dynoCart.group);
  }
  const standCart = makeCart();
  standCart.group.position.copy(AT.standCart);
  root.add(standCart.group);
  // The build bench's computer: a monitor and no control box, for there is nothing to start.
  const buildCart = makeCart();
  buildCart.group.position.copy(AT.buildCart);
  root.add(buildCart.group);
  /** @type {'wide'|'tall'|'short'|null} */
  let cartShape = null;
  /** @param {'wide'|'tall'|'short'} sh */
  const shapeCarts = (sh) => {
    if (sh === cartShape) return;
    cartShape = sh;
    dynoCart.shape(CART_SIZES.dyno[sh]);
    standCart.shape(CART_SIZES.stand[sh]);
    buildCart.shape({ ...CART_SIZES.stand[sh], cw: 0, ch: 0, side: false });
    root.updateMatrixWorld(true);
    focusCache.clear();
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
    cork.scale.set(1, h / 1.5, w / 2.2);
    cork.position.y = tall ? 2.45 : 2.1;
    boardAt.position.y = cork.position.y;
    surfaces.board.w = w - 0.16;
    surfaces.board.h = h - 0.1;
    jobSign.position.y = cork.position.y + h / 2 + 0.45;
    focusCache.clear();
  };

  // ---- your desk, and the laptop on it ----
  const desk = new THREE.Group();
  desk.position.copy(AT.desk);
  desk.add(box(3.2, 0.08, 1.2, W.woodLight, { y: 0.8 }));
  for (const x of [-1.5, 1.5]) desk.add(box(0.1, 0.8, 1.0, W.woodDark, { x, y: 0.4, edge: false }));
  desk.add(box(0.36, 0.02, 0.26, W.black, { x: 0.9, y: 0.85, z: 0.1 }));
  const mug = cyl(0.05, 0.05, 0.12, W.toolRed, { x: -1.1, y: 0.9, z: 0.2, edge: false });
  desk.add(mug);
  // The laptop: a base, and a lid on a hinge at its back edge.
  const laptop = new THREE.Group();
  laptop.position.set(0, 0.84, 0.1);
  // Black, and unlit so the shop's light cannot grey it: the sketch pass keeps a black
  // thing black, inked in.
  const black = new THREE.MeshBasicMaterial({ color: W.black });
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
  let focusAspect = 0;
  let lastPose = 'desk';
  let blend = 1;
  let lid = 0; // 0 open, 1 shut
  let lidTarget = 0;

  const focusCache = new Map();
  /**
   * Square on to a face, close enough that it fills the screen with a margin: the camera
   * looks along the face's own normal from the distance that fits both its width and height.
   * @param {keyof typeof surfaces} name
   */
  const focusPose = (name) => {
    if (focusAspect !== cam.aspect) { focusCache.clear(); focusAspect = cam.aspect; }
    const hit = focusCache.get(name);
    if (hit) return hit;
    const sf = surfaces[name];
    root.updateMatrixWorld(true);
    const c = new THREE.Vector3(); const q = new THREE.Quaternion();
    sf.at.getWorldPosition(c); sf.at.getWorldQuaternion(q);
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const fov = 40;
    const tv = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const d = Math.max(sf.w / (2 * 0.94 * tv * cam.aspect), sf.h / (2 * 0.9 * tv));
    const p = { pos: c.clone().addScaledVector(n, d), look: c, fov, exact: true };
    focusCache.set(name, p);
    return p;
  };

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
   * @param {'dyno'|'stand'|'build'} name
   */
  const stationPose = (name) => {
    const key = `station:${name}:${cam.aspect.toFixed(3)}:${frame.top}:${frame.bottom}:${frame.left}:${frame.right}:${frame.h}`;
    const hit = focusCache.get(key);
    if (hit) return hit;
    const cart = name === 'dyno' ? dynoCart : name === 'build' ? buildCart : standCart;
    root.updateMatrixWorld(true);
    /** @type {THREE.Vector3[]} */
    const pts = [];
    for (const sf of [cart.monitor, cart.console]) {
      if (!sf.w) continue;
      for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        pts.push(new THREE.Vector3((x * sf.w) / 2, (y * sf.h) / 2, 0).applyMatrix4(sf.at.matrixWorld));
      }
    }
    // The engine beside its computer only where there is the height for both: on a phone
    // held sideways the computer alone fills the view, and the software shows the engine.
    if (name !== 'dyno' && cartShape === 'wide' && frame.h - frame.top - frame.bottom > 420) {
      const bb = new THREE.Box3().setFromObject((name === 'build' ? buildStand : runStand).engine.group);
      for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) pts.push(new THREE.Vector3(x, y, z));
    }
    const center = pts.reduce((acc, v) => acc.add(v), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    const q = new THREE.Quaternion(); cart.monitor.at.getWorldQuaternion(q);
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(q).setY(0).normalize();
    const pitch = 0.14;
    const dir = n.clone().multiplyScalar(Math.cos(pitch)).add(new THREE.Vector3(0, Math.sin(pitch), 0)).normalize();
    const right = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
    const up = dir.clone().cross(right).normalize();
    const fov = 38;
    probe.fov = fov; probe.aspect = cam.aspect; probe.near = 0.05; probe.far = 200; probe.updateProjectionMatrix();
    // The clear area in normalised device coordinates, with a small margin all round.
    const m = 10;
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
    if (typeof window !== 'undefined' && /** @type {any} */ (window).__ECU_E2E__) /** @type {any} */ (window).__fit = { name, frame: { ...frame }, L, R, T, B, dist, aspect: cam.aspect, n: pts.length };
    focusCache.set(key, p);
    return p;
  };

  const anchors = {
    dyno: new THREE.Vector3(AT.dyno.x, 1.7, AT.dyno.z),
    stand: new THREE.Vector3(AT.stand.x + 0.6, 2.0, AT.stand.z),
    build: new THREE.Vector3(AT.build.x + 0.6, 2.0, AT.build.z),
    laptop: new THREE.Vector3(AT.desk.x, 1.1, AT.desk.z + 0.1),
    door: new THREE.Vector3(1.6, 2.2, -7),
    board: new THREE.Vector3(-7.6, 2.3, -4.9),
  };
  let t = 0;
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
      if (focusAspect !== cam.aspect) { focusCache.clear(); focusAspect = cam.aspect; }
      // The board is read square on, close enough to fill the screen. At the dyno or the
      // stand you stand at its cart, the whole of it in view: there is nothing to lean in to.
      const p = pose === 'board' ? focusPose('board')
        : pose === 'dyno' || pose === 'stand' || pose === 'build' ? stationPose(pose)
          : (cam.aspect < 1 && POSES[`${pose}Tall`]) || POSES[pose] || POSES.desk;
      if (p === target) return;
      ceiling.visible = p !== POSES.bayTall;
      from.pos.copy(now.pos); from.look.copy(now.look); from.fov = now.fov;
      target = p;
      blend = 0;
      lidTarget = pose === 'desk' ? 0 : 1;
    },
    setCars: placeCars,
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
      if (lastPose === 'dyno' || lastPose === 'stand' || lastPose === 'build') api.setPose(/** @type {any} */ (lastPose));
    },
    /** @returns {boolean} the camera is still on its way somewhere */
    moving() { return blend < 1; },
    /** @param {import('../world/models/engine.js').EngineSpec} spec */
    setEngine(spec) {
      const key = JSON.stringify(spec ?? {});
      if (key === engineSpecKey) return;
      engineSpecKey = key;
      buildStand.setSpec(spec, true);
      runStand.setSpec(spec);
      // A bigger or smaller engine changes what the stands' views have to fit.
      for (const k of [...focusCache.keys()]) if (k.startsWith('station:stand') || k.startsWith('station:build')) focusCache.delete(k);
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
      if (target.exact && focusAspect !== cam.aspect) api.setPose(/** @type {any} */ (lastPose));
      lid += (lidTarget - lid) * Math.min(1, dt * 5);
      // Open, the lid stands up a little past vertical; shut, it lies on the base.
      hinge.rotation.x = -(1 - lid) * 1.85;
      // Shut, the screen is face down inside: only the black lid shows.
      lidScreen.visible = lid < 0.9;
      for (const tr of traffic) {
        tr.c.group.position.x += tr.v * dt;
        if (tr.c.group.position.x > 40) tr.c.group.position.x = -40;
        if (tr.c.group.position.x < -40) tr.c.group.position.x = 40;
        tr.c.roll?.(Math.abs(tr.v) * dt);
      }
      buildStand.update(dt, 0);
      runStand.update(dt, rpm);
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
  return api;
}
