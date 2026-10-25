/**
 * Everything that makes the shop look worked in: what a real tuning shop has on its walls
 * and floor, around the dyno, the lift and the engine stand that the scene puts there.
 *
 * Oil stains on the sealed floor, safety lines round the bays and a drain; a
 * painted band along the walls; a pegboard of tools over a workbench and a vice; rolling
 * tool chests; racking of parts and boxes; tyres, wheels and oil drums; a floor jack,
 * axle stands and a creeper by the lift; an engine hoist; an air compressor and its hose
 * reel; a fire extinguisher, a clock, posters and high windows; strip lights in the
 * ceiling. Kept off the clickable things and out of the camera's way to them.
 *
 * Built from the same boxes and cylinders as the rest of the world, in the world palette,
 * so the sketch pass inks it the same way.
 */

import { world as W } from '../tokens.js';
import { THREE, box, cyl, glow } from '../world/gfx.js';
import { makeBarrel, makePoster, makeShelf, makeToolChest, makeTyreStack, makeWorkbench } from '../world/models/props.js';

/** A flat thing laid on the floor (a stain, a line, a mat). */
function decal(w, d, color, x, z, o = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshToonMaterial({ color, transparent: o.alpha != null, opacity: o.alpha ?? 1 }));
  m.rotation.x = -Math.PI / 2;
  if (o.turn) m.rotation.z = o.turn;
  m.position.set(x, o.y ?? 0.015, z);
  m.receiveShadow = true;
  return m;
}

/** An oil stain: a dark blot, round-ish. */
function stain(r, x, z) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 14), new THREE.MeshToonMaterial({ color: W.asphaltDark, transparent: true, opacity: 0.14, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.scale.set(1, 0.7, 1);
  m.position.set(x, 0.017, z);
  return m;
}

/** A pegboard on a wall facing +z, with tools hung on it. */
function pegboard(w, h) {
  const g = new THREE.Group();
  g.add(box(w, h, 0.05, W.toolRed, { edge: false }));
  g.add(box(w + 0.1, 0.06, 0.08, W.metalDark, { y: h / 2, edge: false }));
  // Spanners in a row, smallest to largest, then a hammer, screwdrivers and pliers.
  for (let i = 0; i < 9; i += 1) {
    const len = 0.22 + i * 0.035;
    g.add(box(0.035, len, 0.02, W.metalLight, { x: -w / 2 + 0.25 + i * 0.13, y: h / 2 - 0.2 - len / 2, z: 0.04, edge: false }));
  }
  g.add(box(0.06, 0.38, 0.03, W.wood, { x: w / 2 - 0.7, y: 0.05, z: 0.04, edge: false }));
  g.add(box(0.2, 0.08, 0.05, W.metalDark, { x: w / 2 - 0.7, y: 0.25, z: 0.05, edge: false }));
  for (let i = 0; i < 5; i += 1) {
    g.add(box(0.03, 0.2, 0.02, W.metalLight, { x: w / 2 - 0.45 + i * 0.07, y: -0.25, z: 0.04, edge: false }));
    g.add(box(0.05, 0.12, 0.03, [W.toolYellow, W.toolRed, W.toolBlue][i % 3], { x: w / 2 - 0.45 + i * 0.07, y: -0.1, z: 0.05, edge: false }));
  }
  for (let i = 0; i < 3; i += 1) g.add(box(0.05, 0.24, 0.02, W.toolBlue, { x: -w / 2 + 0.4 + i * 0.16, y: -h / 2 + 0.28, z: 0.04, edge: false }));
  // A coil of air hose on a hook.
  const hose = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.025, 6, 16), new THREE.MeshToonMaterial({ color: W.toolYellow }));
  hose.position.set(w / 2 - 0.25, -h / 2 + 0.35, 0.06);
  g.add(hose);
  return g;
}

/** A floor jack: red, long handle, on wheels. */
function floorJack() {
  const g = new THREE.Group();
  g.add(box(0.36, 0.14, 0.9, W.toolRed, { y: 0.1 }));
  g.add(box(0.1, 0.1, 0.34, W.toolRed, { y: 0.24, z: -0.38 }));
  g.add(cyl(0.09, 0.09, 0.05, W.metalDark, { y: 0.3, z: -0.5, edge: false }));
  const handle = cyl(0.025, 0.025, 1.2, W.metalDark, { edge: false });
  handle.rotation.x = -0.9;
  handle.position.set(0, 0.55, 0.85);
  g.add(handle);
  for (const [x, z] of [[-0.18, 0.35], [0.18, 0.35], [-0.14, -0.4], [0.14, -0.4]]) g.add(cyl(0.05, 0.05, 0.04, W.black, { x, y: 0.05, z, axis: 'x', edge: false }));
  return g;
}

/** An axle stand. */
function axleStand() {
  const g = new THREE.Group();
  g.add(cyl(0.06, 0.18, 0.4, W.toolBlue, { y: 0.2, seg: 4 }));
  g.add(cyl(0.03, 0.03, 0.25, W.metalLight, { y: 0.5, edge: false }));
  g.add(box(0.12, 0.03, 0.06, W.metalDark, { y: 0.63, edge: false }));
  return g;
}

/** A mechanic's creeper, lying on the floor. */
function creeper() {
  const g = new THREE.Group();
  g.add(box(0.5, 0.05, 1.1, W.black, { y: 0.1 }));
  g.add(box(0.44, 0.03, 0.3, W.toolRed, { y: 0.14, z: -0.38, edge: false }));
  for (const [x, z] of [[-0.2, 0.45], [0.2, 0.45], [-0.2, -0.45], [0.2, -0.45]]) g.add(cyl(0.04, 0.04, 0.05, W.metalDark, { x, y: 0.04, z, edge: false }));
  return g;
}

/** An engine hoist: the yellow crane that lifts an engine out. */
function engineHoist() {
  const g = new THREE.Group();
  const Y = W.toolYellow;
  g.add(box(0.12, 0.1, 1.5, Y, { x: -0.35, y: 0.08, z: 0.4 }));
  g.add(box(0.12, 0.1, 1.5, Y, { x: 0.35, y: 0.08, z: 0.4 }));
  g.add(box(0.82, 0.1, 0.14, Y, { y: 0.08, z: -0.3 }));
  g.add(box(0.14, 1.9, 0.14, Y, { y: 1.0, z: -0.3 }));
  const boom = box(0.12, 0.12, 1.6, Y);
  boom.rotation.x = 0.35;
  boom.position.set(0, 1.95, 0.35);
  g.add(boom);
  g.add(cyl(0.015, 0.015, 0.7, W.metalDark, { y: 1.75, z: 1.05, edge: false }));
  g.add(box(0.14, 0.1, 0.06, W.metalDark, { y: 1.4, z: 1.05, edge: false }));
  g.add(cyl(0.05, 0.05, 0.5, W.toolRed, { y: 1.2, z: -0.15, edge: false }));
  for (const [x, z] of [[-0.35, 1.1], [0.35, 1.1], [-0.35, -0.3], [0.35, -0.3]]) g.add(cyl(0.05, 0.05, 0.04, W.black, { x, y: 0.03, z, edge: false }));
  return g;
}

/** An air compressor: a tank on its side, the motor and pump on top. */
function compressor() {
  const g = new THREE.Group();
  g.add(cyl(0.32, 0.32, 1.1, W.toolRed, { axis: 'x', y: 0.4 }));
  g.add(box(0.5, 0.3, 0.35, W.metalDark, { y: 0.86 }));
  g.add(cyl(0.1, 0.1, 0.12, W.metalLight, { y: 1.07, x: 0.15, edge: false }));
  g.add(cyl(0.06, 0.06, 0.04, W.white, { y: 0.4, x: 0.58, axis: 'x', edge: false }));
  for (const x of [-0.4, 0.4]) g.add(box(0.06, 0.12, 0.5, W.black, { x, y: 0.06, edge: false }));
  return g;
}

/** A fire extinguisher on a bracket. */
function extinguisher() {
  const g = new THREE.Group();
  g.add(cyl(0.09, 0.09, 0.5, W.toolRed, { y: 0.25 }));
  g.add(cyl(0.03, 0.03, 0.08, W.black, { y: 0.54, edge: false }));
  g.add(box(0.14, 0.03, 0.1, W.black, { y: 0.6, x: 0.04, edge: false }));
  return g;
}

/** A wall clock facing +z. */
function clock() {
  const g = new THREE.Group();
  g.add(cyl(0.3, 0.3, 0.05, W.white, { axis: 'z' }));
  g.add(cyl(0.32, 0.32, 0.04, W.black, { axis: 'z', z: -0.01, edge: false }));
  g.add(box(0.03, 0.2, 0.02, W.black, { y: 0.08, z: 0.04, edge: false }));
  const m = box(0.03, 0.15, 0.02, W.black, { z: 0.04, edge: false });
  m.rotation.z = -1.1;
  m.position.set(0.06, 0.03, 0.04);
  g.add(m);
  return g;
}

/** A high window facing +z: the day outside, through wired glass. */
function windowPane(w, h) {
  const g = new THREE.Group();
  g.add(box(w + 0.16, h + 0.16, 0.08, W.metalDark, { edge: false }));
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glow(W.glass, 0.9));
  pane.position.z = 0.05;
  g.add(pane);
  for (let i = 1; i < 3; i += 1) g.add(box(0.04, h, 0.03, W.metalDark, { x: -w / 2 + (w / 3) * i, z: 0.06, edge: false }));
  g.add(box(w, 0.04, 0.03, W.metalDark, { z: 0.06, edge: false }));
  return g;
}

/** A strip light in the ceiling. */
function stripLight(len) {
  const g = new THREE.Group();
  g.add(box(len, 0.08, 0.3, W.metalDark, { edge: false }));
  const tube = new THREE.Mesh(new THREE.BoxGeometry(len - 0.1, 0.04, 0.16), glow(W.headlight));
  tube.position.y = -0.05;
  g.add(tube);
  return g;
}

/** A loose wheel, leaning or lying. */
function wheel() {
  const g = new THREE.Group();
  g.add(cyl(0.34, 0.34, 0.22, W.tyre, { axis: 'z' }));
  g.add(cyl(0.22, 0.22, 0.23, W.rim, { axis: 'z', edge: false }));
  g.add(cyl(0.06, 0.06, 0.24, W.rimDark, { axis: 'z', edge: false }));
  return g;
}

/**
 * Dress the shop. The room is 16 × 14 m (x −8…8, z −7…7); the back wall is at z −7 with
 * the door at x −1.65…4.85; the dyno is at (−4.6, −1.6), the lift at (4.6, −1.6), the
 * build bench at (−2.0, 0.6) and run stand at (1.05, 1.6), each with its computer to its
 * right, and the desk at (0, 5.2).
 * @param {THREE.Group} root
 */
export function dressShop(root) {
  const add = (o, x, y, z, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; root.add(o); return o; };

  // ---- floor: sealed concrete, bay lines, stains, a drain ----
  for (const [cx, cz] of [[-4.6, -1.6], [4.6, -1.6]]) {
    for (const s of [-1, 1]) {
      root.add(decal(0.12, 6.2, W.toolYellow, cx + s * 2.1, cz));
      root.add(decal(4.3, 0.12, W.toolYellow, cx, cz + s * 3.1));
    }
  }
  // Hazard hatching at the door, where cars come in.
  for (let i = 0; i < 12; i += 1) root.add(decal(0.25, 0.9, i % 2 ? W.black : W.toolYellow, -1.35 + i * 0.5, -6.4, { turn: 0.6 }));
  for (const [r, x, z] of [[0.35, -4.2, -1.0], [0.25, -4.9, -2.4], [0.3, 4.3, -0.8], [0.22, 5.0, -2.7], [0.16, 1.3, 1.5]]) root.add(stain(r, x, z));
  root.add(decal(0.6, 0.6, W.metalDark, 0, -1.2, { y: 0.018 }));
  for (let i = 0; i < 5; i += 1) root.add(decal(0.04, 0.5, W.black, -0.2 + i * 0.1, -1.2, { y: 0.02 }));
  // A rubber mat in front of the bench.
  root.add(decal(2.6, 1.0, W.rubber, -4.7, -5.4));

  // ---- walls: a painted band, a stripe ----
  const band = W.wallShopDark;
  for (const s of [-1, 1]) {
    root.add(box(0.04, 1.2, 14, band, { x: s * 7.98, y: 0.6, edge: false }));
    root.add(box(0.05, 0.12, 14, W.toolRed, { x: s * 7.97, y: 1.25, edge: false }));
  }
  root.add(box(6.3, 1.2, 0.04, band, { x: -4.8, y: 0.6, z: -6.98, edge: false }));
  root.add(box(3.1, 1.2, 0.04, band, { x: 6.4, y: 0.6, z: -6.98, edge: false }));
  root.add(box(6.3, 0.12, 0.05, W.toolRed, { x: -4.8, y: 1.25, z: -6.97, edge: false }));
  root.add(box(3.1, 0.12, 0.05, W.toolRed, { x: 6.4, y: 1.25, z: -6.97, edge: false }));

  // ---- back wall, left of the door: the bench, its pegboard, under the sign ----
  add(makeWorkbench(), -4.7, 0, -6.4);
  add(makeWorkbench(), -2.4, 0, -6.4);
  add(pegboard(4.4, 1.2), -3.55, 1.85, -6.96);
  const vice = new THREE.Group();
  vice.add(box(0.2, 0.16, 0.3, W.toolBlue));
  vice.add(box(0.06, 0.06, 0.4, W.metalLight, { y: 0.02, z: 0.15, edge: false }));
  add(vice, -5.6, 1.08, -6.3);
  add(cyl(0.12, 0.1, 0.2, W.toolYellow, { edge: false }), -1.8, 1.09, -6.3);
  add(box(0.4, 0.04, 0.3, W.metalLight, { edge: false }), -3.0, 1.0, -6.3);

  // ---- back wall, right of the door: racking, drums, the compressor ----
  add(makeShelf(4), 6.4, 0, -6.6);
  add(makeBarrel(W.barrelRed), 7.4, 0, -4.8);
  add(makeBarrel(W.barrel), 6.8, 0, -4.4);
  add(compressor(), 7.3, 0, -3.3, Math.PI / 2);
  add(extinguisher(), 5.2, 0.9, -6.92);
  add(windowPane(1.8, 0.9), 6.4, 3.6, -6.98);

  // ---- left wall: tyres, wheels, a second chest, posters, a window ----
  add(makeTyreStack(4), -7.3, 0, -3.0);
  add(makeTyreStack(3), -7.3, 0, -2.2);
  const w1 = add(wheel(), -7.6, 0.34, 0.9, Math.PI / 2);
  w1.rotation.z = 0.25;
  add(makeToolChest(W.toolBlue), -7.4, 0, 4.4, Math.PI / 2);
  add(makePoster(1), -7.95, 2.6, 1.2, Math.PI / 2);
  add(makePoster(3), -7.95, 2.6, 2.6, Math.PI / 2);
  add(windowPane(2.4, 0.9), -7.98, 3.7, -1.5, Math.PI / 2);
  add(clock(), -7.95, 3.6, 3.8, Math.PI / 2);

  // ---- right wall: by the lift, the jack and stands; more racking, a window ----
  add(floorJack(), 6.9, 0, 0.9, -0.3);
  add(axleStand(), 2.3, 0, 0.6);
  add(axleStand(), 2.3, 0, -3.9);
  add(creeper(), 3.7, 0, 0.1, 1.2);
  add(makeShelf(7), 7.5, 0, 6.0, -Math.PI / 2);
  add(windowPane(2.4, 0.9), 7.98, 3.7, -1.5, -Math.PI / 2);
  add(makePoster(5), 7.95, 2.6, 1.6, -Math.PI / 2);
  for (const [x, z, r] of [[6.9, -4.6, 0], [6.4, 2.0, 0.4]]) {
    const wl = add(wheel(), x, 0.11, z, r);
    wl.rotation.x = Math.PI / 2;
  }

  // ---- the hoist, in the corner by the lift; a parts cart by the engine stand ----
  add(makeToolChest(), -7.4, 0, 2.6, Math.PI / 2);
  add(engineHoist(), 6.3, 0, 3.4, -Math.PI / 2);
  const cart = new THREE.Group();
  cart.add(box(0.8, 0.05, 0.5, W.metal, { y: 0.8 }));
  cart.add(box(0.8, 0.05, 0.5, W.metal, { y: 0.4 }));
  for (const [x, z] of [[-0.37, -0.22], [0.37, -0.22], [-0.37, 0.22], [0.37, 0.22]]) cart.add(box(0.04, 0.8, 0.04, W.metalDark, { x, y: 0.42, z, edge: false }));
  cart.add(box(0.3, 0.12, 0.2, W.toolRed, { y: 0.88, x: -0.15, edge: false }));
  cart.add(cyl(0.06, 0.06, 0.2, W.metalLight, { y: 0.9, x: 0.2, edge: false }));
  add(cart, -3.4, 0, 1.9, 0.3);

  // ---- ceiling: strip lights ----
  for (const x of [-4.6, 4.6]) for (const z of [-3.5, 0.5]) add(stripLight(2.4), x, 5.0, z, Math.PI / 2);
}
