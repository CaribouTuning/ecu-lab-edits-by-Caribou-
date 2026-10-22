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
import { tiledFloor } from '../world/levels/common.js';
import { makeCar } from '../world/models/car.js';
import { makeEngine } from '../world/models/engine.js';
import { makeDyno, makeLamp, makeLift, makeRollupDoor, makeRoundTree, makeShelf, makeToolChest, makeTree, makeTyreStack } from '../world/models/props.js';
import { makeBuilding } from '../world/models/buildings.js';

const POSES = {
  desk: { pos: new THREE.Vector3(0, 1.75, 7.6), look: new THREE.Vector3(0, 1.55, -6), fov: 50 },
  bay: { pos: new THREE.Vector3(0, 5.6, 10.5), look: new THREE.Vector3(0, 0.9, -1.2), fov: 46 },
};

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
 * @param {{engineSpec: import('../world/models/engine.js').EngineSpec, car?: object}} init
 */
export function buildShopScene(stage, init) {
  const scene = stage.scene;
  const root = new THREE.Group();
  scene.add(root);
  stage.setTime(0.15, false);
  stage.setDriving(true);

  // ---- the room ----
  root.add(tiledFloor(16, 14, W.concrete, W.concreteDark, 2).translateZ(0));
  const wallC = W.wallBase;
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
  // Lamps over the work, forward of the door so none hangs in front of the sign.
  for (const x of [-4.6, 0, 4.6]) {
    const lamp = makeLamp();
    lamp.position.set(x, 4.9, 2.4);
    root.add(lamp);
  }
  const chest = makeToolChest();
  chest.position.set(-7.4, 0, 2.5);
  chest.rotation.y = Math.PI / 2;
  root.add(chest);
  const shelf = makeShelf(3);
  shelf.position.set(7.5, 0, 3);
  shelf.rotation.y = -Math.PI / 2;
  root.add(shelf);
  const tyres = makeTyreStack(5);
  tyres.position.set(-7.2, 0, -5.6);
  root.add(tyres);

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
  const dyno = makeDyno(true);
  dyno.position.copy(AT.dyno);
  root.add(dyno);
  const dynoCar = makeCar({ body: 'coupe', color: 'orange', ...init.car });
  dynoCar.group.position.copy(AT.dyno);
  dynoCar.group.rotation.y = Math.PI;
  root.add(dynoCar.group);

  // ---- the lift, a car up on it ----
  const lift = makeLift();
  lift.position.copy(AT.lift);
  lift.userData.setHeight?.(1.5);
  root.add(lift);
  const liftCar = makeCar({ body: 'hatch', color: 'teal' });
  liftCar.group.position.set(AT.lift.x, 1.6, AT.lift.z);
  liftCar.group.rotation.y = Math.PI;
  root.add(liftCar.group);

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
  laptop.add(box(0.7, 0.03, 0.48, W.metalDark, { y: 0 }));
  const hinge = new THREE.Group();
  hinge.position.set(0, 0.015, -0.24);
  hinge.add(box(0.7, 0.02, 0.46, W.metalDark, { y: 0, z: 0.23 }));
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
  let target = POSES.desk;
  let blend = 1;
  let lid = 0; // 0 open, 1 shut
  let lidTarget = 0;

  const anchors = {
    dyno: new THREE.Vector3(AT.dyno.x, 1.7, AT.dyno.z),
    stand: new THREE.Vector3(AT.stand.x, 1.7, AT.stand.z),
    laptop: new THREE.Vector3(AT.desk.x, 1.1, AT.desk.z + 0.1),
  };
  let t = 0;
  return {
    anchors,
    camera: cam,
    /** @param {'desk'|'bay'} pose */
    setPose(pose) {
      const p = POSES[pose] ?? POSES.desk;
      if (p === target) return;
      from.pos.copy(now.pos); from.look.copy(now.look); from.fov = now.fov;
      target = p;
      blend = 0;
      lidTarget = pose === 'bay' ? 1 : 0;
    },
    /** @param {import('../world/models/engine.js').EngineSpec} spec */
    setEngine(spec) {
      mount.remove(engine.group);
      engine = makeEngine(spec);
      engine.group.scale.setScalar(1.25);
      engine.group.position.set(0, -0.4, 0);
      mount.add(engine.group);
    },
    /** @param {number} dt @param {number} rpm the engine on the stand, 0 when it is off */
    update(dt, rpm) {
      t += dt;
      blend = Math.min(1, blend + dt / 0.7);
      const k = blend * blend * (3 - 2 * blend);
      now.pos.lerpVectors(from.pos, target.pos, k);
      now.look.lerpVectors(from.look, target.look, k);
      now.fov = from.fov + (target.fov - from.fov) * k;
      cam.position.copy(now.pos);
      cam.lookAt(now.look);
      if (Math.abs(cam.fov - now.fov) > 0.01) { cam.fov = now.fov; cam.updateProjectionMatrix(); }
      lid += (lidTarget - lid) * Math.min(1, dt * 5);
      // Open, the lid stands up a little past vertical; shut, it lies on the base.
      hinge.rotation.x = -(1 - lid) * 1.85;
      for (const tr of traffic) {
        tr.c.group.position.x += tr.v * dt;
        if (tr.c.group.position.x > 40) tr.c.group.position.x = -40;
        if (tr.c.group.position.x < -40) tr.c.group.position.x = 40;
        tr.c.roll?.(Math.abs(tr.v) * dt);
      }
      engine.update(dt, rpm);
      // The dyno's rollers and the car on them idle over; the lift stays put.
      dynoCar.roll?.(dt * 0.6);
      stage.followLight(new THREE.Vector3(0, 0, 0));
      void t;
    },
  };
}
