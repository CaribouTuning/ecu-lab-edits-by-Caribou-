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
  stand: { pos: new THREE.Vector3(2.4, 2.1, 5.0), look: new THREE.Vector3(-1.7, 0.6, 2.5), fov: 46 },
  board: { pos: new THREE.Vector3(-4.6, 2.15, -4.9), look: new THREE.Vector3(-7.9, 2.15, -4.9), fov: 44 },
};

/**
 * A rolling cart with a monitor on a post and a sloped console in front of it: the dyno's
 * computer, or the engine stand's controls. Faces +z. `monitor` and `console` are the
 * screen's and the panel's faces, where the page's own controls are laid (Station.jsx,
 * ShopBackdrop.jsx): the cart is the thing you use, not a picture of it.
 */
function makeCart() {
  const g = new THREE.Group();
  g.add(box(0.9, 0.06, 0.6, W.engine.standDark, { y: 0.16 }));
  for (const [x, z] of [[-0.38, -0.24], [-0.38, 0.24], [0.38, -0.24], [0.38, 0.24]]) g.add(cyl(0.06, 0.06, 0.06, W.black, { axis: 'x', x, y: 0.06, z, edge: false }));
  g.add(box(0.08, 1.0, 0.08, W.metalDark, { y: 0.66, z: -0.2 }));
  // The console: a lectern sloped steeply toward you, 55 degrees, below the screen.
  const desk = new THREE.Group();
  desk.position.set(0, 1.0, 0.02);
  desk.rotation.x = 0.96;
  desk.add(box(0.86, 0.05, 0.42, W.engine.standDark));
  g.add(desk);
  const consoleAt = new THREE.Object3D();
  consoleAt.position.set(0, 0.03, 0);
  // Lying on the lectern, its top edge up the slope, as you read a sheet on a desk.
  consoleAt.rotation.x = -Math.PI / 2;
  desk.add(consoleAt);
  // The monitor, a big one, on the post.
  g.add(box(1.18, 0.74, 0.06, W.black, { y: 1.62, z: -0.2 }));
  const monitorAt = new THREE.Object3D();
  monitorAt.position.set(0, 1.62, -0.165);
  g.add(monitorAt);
  return { group: g, monitor: { at: monitorAt, w: 1.1, h: 0.66 }, console: { at: consoleAt, w: 0.8, h: 0.38 } };
}

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
  stand: new THREE.Vector3(-1.4, 0, 2.2),
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
  root.add(box(0.12, 1.5, 2.2, W.woodLight, { x: -7.95, y: 2.1, z: -4.9 }));
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

  // ---- the engine stand, and the engine you are building on it ----
  const stand = new THREE.Group();
  stand.position.copy(AT.stand);
  stand.add(box(1.4, 0.06, 0.12, W.engine.stand, { y: 0.1 }));
  stand.add(box(0.12, 0.06, 1.1, W.engine.stand, { x: -0.6, y: 0.1 }));
  stand.add(box(0.12, 0.06, 1.1, W.engine.stand, { x: 0.6, y: 0.1 }));
  for (const [x, z] of [[-0.6, -0.5], [-0.6, 0.5], [0.6, -0.5], [0.6, 0.5]]) stand.add(cyl(0.06, 0.06, 0.08, W.black, { x, y: 0.04, z, edge: false }));
  stand.add(box(0.1, 0.9, 0.1, W.engine.standDark, { y: 0.55, z: -0.1 }));
  const mount = new THREE.Group();
  mount.position.set(0, 0.95, 0);
  mount.rotation.y = Math.PI / 2;
  stand.add(mount);
  root.add(stand);
  /** @type {ReturnType<typeof makeEngine>} */
  let engine = makeEngine(init.engineSpec);
  engine.group.scale.setScalar(1.25);
  engine.group.position.set(0, -0.4, 0);
  mount.add(engine.group);

  // ---- the two carts: the dyno's computer and the engine stand's controls ----
  // Each stands between its pose's camera and the thing, a little to the left, turned to
  // face you: the dyno computer in the bottom left of the view, as drawn.
  /** @param {{pos: THREE.Vector3, look: THREE.Vector3}} pose @param {number} ahead @param {number} left */
  const cartFor = (pose, ahead, left) => {
    const c = makeCart();
    const f = new THREE.Vector3(pose.look.x - pose.pos.x, 0, pose.look.z - pose.pos.z).normalize();
    const l = new THREE.Vector3(f.z, 0, -f.x);
    c.group.position.copy(pose.pos).addScaledVector(f, ahead).addScaledVector(l, left).setY(0);
    c.group.rotation.y = Math.atan2(-f.x, -f.z);
    root.add(c.group);
    return c;
  };
  const dynoCart = cartFor(POSES.dyno, 1.75, 0.62);
  const standCart = cartFor(POSES.stand, 1.8, 0.62);
  // On a screen taller than wide the view is narrow: turn to look between the cart and the
  // thing, so both stay in it (the camera widens its lens to keep about the same width).
  for (const [name, cart] of /** @type {const} */ ([['dyno', dynoCart], ['stand', standCart]])) {
    const p = POSES[name];
    const mid = new THREE.Vector3().copy(cart.group.position).setY(1.15).lerp(p.look, 0.2);
    /** @type {any} */ (POSES)[`${name}Tall`] = { pos: p.pos.clone(), look: mid, fov: p.fov };
  }
  /** The faces the page's controls are laid on, by name. */
  const surfaces = {
    dynoMonitor: dynoCart.monitor, dynoConsole: dynoCart.console,
    standMonitor: standCart.monitor, standConsole: standCart.console,
    board: { at: boardAt, w: 2.04, h: 1.4 },
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
  /** @type {keyof typeof surfaces|null} */
  let focus = null;
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

  const anchors = {
    dyno: new THREE.Vector3(AT.dyno.x, 1.7, AT.dyno.z),
    stand: new THREE.Vector3(AT.stand.x, 1.7, AT.stand.z),
    laptop: new THREE.Vector3(AT.desk.x, 1.1, AT.desk.z + 0.1),
    door: new THREE.Vector3(1.6, 2.2, -7),
    board: new THREE.Vector3(-7.6, 2.3, -4.9),
  };
  let t = 0;
  const api = {
    anchors,
    camera: cam,
    /** @param {'desk'|'bay'|'dyno'|'stand'|'board'} pose */
    setPose(pose) {
      lastPose = pose;
      // The board is read square on, close enough to fill the screen: its view is its close-up.
      const p = focus ? focusPose(focus) : pose === 'board' ? focusPose('board')
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
     * Lean in to one face (its controls fill the screen), or step back (null).
     * @param {keyof typeof surfaces|null} name
     */
    setFocus(name) {
      if (name === focus) return;
      focus = name;
      api.setPose(/** @type {any} */ (lastPose));
    },
    /** @returns {boolean} the camera is still on its way somewhere */
    moving() { return blend < 1; },
    /** @param {import('../world/models/engine.js').EngineSpec} spec */
    setEngine(spec) {
      mount.remove(engine.group);
      engine = makeEngine(spec);
      engine.group.scale.setScalar(1.25);
      engine.group.position.set(0, -0.4, 0);
      mount.add(engine.group);
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
      // Leaning in and the screen changed shape: lean in again for the new shape.
      if (focus && focusAspect !== cam.aspect) api.setPose(/** @type {any} */ (lastPose));
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
      engine.update(dt, rpm);
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
