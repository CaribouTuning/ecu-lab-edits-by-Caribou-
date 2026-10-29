/**
 * An engine out of its car, in the game's pixel-art 3D: the model the Build app turns on
 * screen, and the one running on the stand in the shop.
 *
 * It is drawn from what is really built, so changing the engine changes the model:
 *   layout          I4, I6, V6 or V8: one bank or two, and how many cylinders on each
 *   bore and stroke how long the block is (cylinder pitch from the bore) and how tall
 *   valvetrain      a twin-cam head's wide cover with two cam humps, a single-cam's narrow
 *                   one, or a pushrod V's low covers with the cam in the block
 *   exhaust         a cast log manifold, or long-tube headers when they are fitted
 *   induction       a turbo on the exhaust side with its pipe to the throttle (and an
 *                   intercooler in that pipe when there is one), or a supercharger on top
 *   intake          the airbox pipe, or a cone filter when an aftermarket intake is fitted
 *   nitrous         a solenoid and its blue line into the intake
 *   materials       a cast-iron block or head is darker than an aluminium one
 *   cam phasers     a phaser on the nose of each cam
 *   injection       direct injection's high-pressure pump on the cam cover, and its rail
 *   twin turbos     a turbo on each bank of a V, or two along an inline's manifold
 *   spark plugs     two coils a cylinder on a twin-plug head
 * The belt, the crank pulley and the alternator turn with the revs (`update`).
 *
 * Engine-local coordinates, metres: x across, y up, z along the crank, the front (belt end)
 * toward +z. The model sits with its sump on y = 0.
 */

import { world as W } from '../../tokens.js';
import { THREE, box, cyl, rbox, toon } from '../gfx.js';
import { makeDebris, makeFlash, makeSmoke } from './damageFx.js';

const E = W.engine;

/**
 * @typedef {object} EngineSpec
 * @property {'I4'|'I6'|'V6'|'V8'} [layout]
 * @property {number} [boreMm] @property {number} [strokeMm]
 * @property {'dohc'|'sohc'|'ohv'} [valvetrain]
 * @property {boolean} [turbo] @property {boolean} [supercharger] @property {boolean} [intercooler]
 * @property {boolean} [intake] an aftermarket intake (a cone filter)
 * @property {boolean} [headers] long-tube headers
 * @property {boolean} [nitrous]
 * @property {string} [blockMaterial] @property {string} [headMaterial] 'Cast Iron' or 'Aluminum'
 * @property {boolean} [vvt] cam phasers fitted
 * @property {boolean} [direct] direct injection
 * @property {boolean} [twinTurbo]
 * @property {number} [sparkPlugs] per cylinder
 */

/**
 * A round tube from one point to another: runners, header primaries, the belt's runs.
 * @param {[number, number, number]} a @param {[number, number, number]} b @param {number} r @param {string} color
 */
function tube(a, b, r, color, seg = 10) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const d = vb.clone().sub(va);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), seg), toon(color));
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * @typedef {{piston: number, bearing: number, valve: number, failed?: 'piston'|'bearing'|'valve'|null}} EngineDamage
 *   each part's life left, percent, and the part that has failed, if one has
 */

const PER_BANK = { I4: 4, I6: 6, V6: 3, V8: 4 };
/** Half the V angle, radians: a 60-degree V6 and a 90-degree V8. */
const HALF_V = { V6: Math.PI / 6, V8: Math.PI / 4 };

/**
 * Engine damage as drawn (`setDamage`): the same three parts the simulator wears
 * (src/sim/damage.js). Worn valves blue the exhaust with heat; worn rings and bearings weep
 * oil down the block and onto the floor, and worn rings blow smoke out of the oil filler
 * while it runs; worn bearings knock, which shakes it. A failed engine is a wreck, by what
 * failed: a rod out through a hole in the block, a holed piston's oil blown over
 * everything, a dropped valve's head with its cover split off. The failure itself plays
 * once (`blowUp`): a flash, pieces thrown across the floor, and smoke that thins out to
 * wisps and stays until the engine is rebuilt.
 * @param {EngineSpec} spec
 * @returns {{group: THREE.Group, size: {len: number, wid: number, hgt: number}, update: (dt: number, rpm: number) => void,
 *   setDamage: (d: EngineDamage|null, floorY?: number) => void, blowUp: () => void, busy: () => boolean}}
 */
export function makeEngine(spec = {}) {
  const layout = spec.layout && PER_BANK[spec.layout] ? spec.layout : 'V6';
  const vee = layout === 'V6' || layout === 'V8';
  const per = PER_BANK[layout];
  const bore = (spec.boreMm ?? 90) / 1000;
  const stroke = (spec.strokeMm ?? 86) / 1000;
  const vt = spec.valvetrain ?? (vee && layout === 'V8' ? 'ohv' : 'dohc');
  const pitch = bore * 1.22;
  const len = per * pitch + 0.1;
  const blockH = stroke * 2.4 + 0.12;
  const root = new THREE.Group();
  const add = (/** @type {THREE.Object3D[]} */ ...o) => { root.add(...o); };

  // ---- the bottom end: sump, block, bellhousing ----
  // A pressed-steel pan: its flange, and the deeper sump at the back where the pickup sits.
  const sumpW = vee ? 0.3 : 0.22;
  add(rbox(sumpW + 0.03, 0.02, len * 0.92, E.blockDark, { y: 0.1, r: 0.006 }));
  add(rbox(sumpW, 0.07, len * 0.88, E.blockDark, { y: 0.06, r: 0.02 }));
  add(rbox(sumpW * 0.8, 0.09, len * 0.4, E.blockDark, { y: 0.045, z: -len * 0.22, r: 0.025 }));
  const deckY = 0.1 + blockH;
  const iron = spec.blockMaterial === 'Cast Iron';
  const blockC = iron ? E.blockIron : E.block;
  const ribC = iron ? E.blockIronDark : E.blockDark;
  // A V block is a V: a crankcase at the bottom and a bank of cylinders rising from it to
  // each deck (the banks are added with the heads, below). An inline is one upright casting.
  const caseW = vee ? 0.28 : 0.22;
  const caseH = vee ? blockH * 0.48 : blockH;
  add(rbox(caseW, caseH, len, blockC, { y: 0.1 + caseH / 2, r: 0.018 }));
  // Main-bearing webs cast into the crankcase sides, one between each pair of cylinders.
  for (let k = 0; k <= per; k += 1) for (const s of [-1, 1]) add(box(0.012, caseH * 0.8, 0.018, ribC, { x: s * (caseW / 2 + 0.005), y: 0.1 + caseH * 0.45, z: -len / 2 + 0.05 + pitch * k }));
  // The bellhousing flange the gearbox (or the stand's head) bolts to, and the flywheel.
  add(rbox(vee ? 0.46 : 0.34, blockH + 0.04, 0.03, blockC, { y: 0.1 + blockH / 2, z: -len / 2 + 0.01, r: 0.012 }));
  add(cyl(0.2, 0.2, 0.035, E.flywheel, { axis: 'z', y: 0.1 + blockH * 0.45, z: -len / 2 - 0.02, seg: 32 }));
  add(cyl(0.21, 0.21, 0.012, E.pulley, { axis: 'z', y: 0.1 + blockH * 0.45, z: -len / 2 - 0.042, seg: 32 }));
  // The oil filter on its boss, low on the side, and the dipstick tube.
  add(cyl(0.04, 0.04, 0.1, E.blockDark, { axis: 'x', x: -(caseW / 2 + 0.06), y: 0.1 + caseH * 0.4, z: len * 0.15, seg: 16 }));
  add(cyl(0.03, 0.03, 0.02, E.blockDark, { axis: 'x', x: -(caseW / 2 + 0.005), y: 0.1 + caseH * 0.4, z: len * 0.15, seg: 12 }));
  add(tube([-(caseW / 2 + 0.012), 0.12, -len * 0.1], [-(caseW / 2 + 0.03), deckY - 0.02, -len * 0.16], 0.006, E.turboCold, 6));
  const dipLoop = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.004, 4, 10), toon(W.toolYellow));
  dipLoop.position.set(-(caseW / 2 + 0.03), deckY + 0.002, -len * 0.16);
  add(dipLoop);
  // The bolts that hold it together: round the bellhousing flange, along the sump rail.
  const flangeW = vee ? 0.46 : 0.34;
  for (let k = 0; k < 8; k += 1) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    add(cyl(0.007, 0.007, 0.012, E.pulley, { axis: 'z', x: Math.cos(a) * flangeW * 0.44, y: 0.1 + blockH / 2 + Math.sin(a) * (blockH * 0.46), z: -len / 2 + 0.028, seg: 6, edge: false }));
  }
  for (let k = 0; k < per + 2; k += 1) for (const sx of [-1, 1]) add(cyl(0.005, 0.005, 0.008, E.pulley, { x: sx * (sumpW / 2 + 0.008), y: 0.112, z: -len * 0.44 + (k * len * 0.88) / (per + 1), seg: 6, edge: false }));
  // Engine mounts: a cast bracket on each side of the block and the rubber it sits on.
  for (const sx of [-1, 1]) {
    add(box(0.03, 0.07, 0.07, ribC, { x: sx * (caseW / 2 + 0.03), y: 0.1 + caseH * 0.62, z: len * 0.22 }));
    add(cyl(0.025, 0.025, 0.03, E.hose, { x: sx * (caseW / 2 + 0.06), y: 0.1 + caseH * 0.62, z: len * 0.22, seg: 10, edge: false }));
  }

  // ---- the banks: a head and its cover on each, the plugs or coils on top ----
  /** @type {{mesh: THREE.Mesh, bank: THREE.Group, out: number}[]} */
  const covers = [];
  /** @type {THREE.Mesh|null} */
  let filler = null;
  /** @type {{x: number, y: number, ang: number, out: number}[]} */
  const banks = vee ? [-1, 1].map((s) => ({ x: s * 0.13, y: deckY - 0.02, ang: s * HALF_V[/** @type {'V6'|'V8'} */ (layout)], out: s })) : [{ x: 0, y: deckY, ang: 0, out: 1 }];
  const headH = vt === 'ohv' ? 0.08 : 0.11;
  for (const b of banks) {
    const bank = new THREE.Group();
    bank.position.set(b.x, b.y, 0);
    bank.rotation.z = -b.ang;
    const hw = vt === 'dohc' ? 0.2 : vt === 'sohc' ? 0.16 : 0.15;
    // On a V, the bank of cylinders under the head, down to the crankcase.
    if (vee) bank.add(rbox(0.17, blockH * 0.6, len, blockC, { y: -blockH * 0.3, r: 0.015 }));
    bank.add(rbox(hw, headH, len - 0.02, spec.headMaterial === 'Cast Iron' ? E.headIron : E.head, { y: headH / 2, r: 0.012 }));
    const coverH = vt === 'ohv' ? 0.05 : 0.07;
    const cover = vt === 'ohv' ? E.coverOhv : E.cover;
    // The cam cover: a rounded casting on a gasket, held down by a row of bolts each side.
    const coverMesh = rbox(hw - 0.02, coverH, len - 0.06, cover, { y: headH + coverH / 2, r: 0.022 });
    bank.add(coverMesh);
    covers.push({ mesh: coverMesh, bank, out: b.out });
    // The oil filler on the first bank's cover, toward the front: where blow-by comes out.
    if (b === banks[0]) {
      const cap = cyl(0.022, 0.022, 0.018, E.plug, { x: vt === 'ohv' ? -b.out * 0.03 : -0.045 * b.out, y: headH + coverH + 0.009, z: len * 0.28, seg: 14 });
      bank.add(cap);
      filler = cap;
    }
    // Port injection: a rail along the intake side of the head, an injector into each port.
    if (!spec.direct) {
      const ix = -b.out * (hw / 2 + 0.014);
      bank.add(box(0.014, 0.014, len - 0.1, E.turboCold, { x: ix, y: headH * 0.75 }));
      for (let k = 0; k < per; k += 1) bank.add(cyl(0.007, 0.007, 0.034, E.hose, { x: ix, y: headH * 0.45, z: -len / 2 + 0.05 + pitch * (k + 0.5), seg: 8, edge: false }));
    }
    for (let k = 0; k <= per; k += 1) for (const bx of [-1, 1]) bank.add(cyl(0.008, 0.008, 0.012, E.pulley, { x: bx * (hw / 2 - 0.018), y: headH + coverH * 0.35, z: -len / 2 + 0.05 + pitch * k, seg: 6 }));
    if (vt === 'dohc') for (const cx of [-0.045, 0.045]) bank.add(rbox(0.045, 0.02, len - 0.1, E.coverDark, { x: cx, y: headH + coverH + 0.006, r: 0.008 }));
    else bank.add(rbox(0.05, 0.015, len - 0.1, vt === 'ohv' ? E.hose : E.coverDark, { y: headH + coverH + 0.004, r: 0.006 }));
    // A coil (or a plug lead) for every cylinder on the bank: two a cylinder on a twin-plug head.
    const coils = spec.sparkPlugs === 2 ? [-0.035, 0.035] : [0];
    for (let k = 0; k < per; k += 1) for (const dz of coils) bank.add(rbox(0.032, 0.045, 0.032, E.plug, { r: 0.008, x: vt === 'ohv' ? b.out * 0.06 : 0, y: headH + coverH + 0.03, z: -len / 2 + 0.05 + pitch * (k + 0.5) + dz * pitch * 2.4 }));
    // The coils' loom: one harness along the bank, a lead down to each coil's plug.
    if (vt !== 'ohv') {
      bank.add(box(0.012, 0.01, len - 0.12, E.belt, { x: b.out * 0.03, y: headH + coverH + 0.058 }));
      for (let k = 0; k < per; k += 1) bank.add(box(0.016, 0.01, 0.008, E.belt, { x: b.out * 0.02, y: headH + coverH + 0.056, z: -len / 2 + 0.05 + pitch * (k + 0.5) }));
    }
    // Cam phasers: a disc on the nose of each cam, at the belt end.
    if (spec.vvt && vt !== 'ohv') for (const cx of vt === 'dohc' ? [-0.045, 0.045] : [0]) bank.add(cyl(0.05, 0.05, 0.03, E.pulley, { axis: 'z', x: cx, y: headH * 0.6, z: len / 2 + 0.01, seg: 24 }));
    // Direct injection: the cam-driven high-pressure pump on the cover, and its rail along the head.
    if (spec.direct) {
      bank.add(cyl(0.03, 0.03, 0.06, E.turboCold, { x: b.out * 0.04, y: headH + coverH + 0.05, z: -len / 2 + 0.08, seg: 10 }));
      bank.add(box(0.02, 0.02, len - 0.12, E.turboCold, { x: b.out * (hw / 2 + 0.01), y: headH * 0.4 }));
    }
    add(bank);
  }
  const topY = deckY + headH + 0.09;
  // A pushrod engine's one cam is in the block: its phaser is on the block's nose.
  if (spec.vvt && vt === 'ohv') add(cyl(0.06, 0.06, 0.03, E.pulley, { axis: 'z', y: deckY - 0.06, z: len / 2 + 0.015, seg: 12 }));

  // ---- the intake: a plenum and its runners, the throttle at the front ----
  const plenumY = vee ? topY + 0.03 : deckY + 0.06;
  const plenumX = vee ? 0 : -0.2;
  add(rbox(vee ? 0.16 : 0.1, 0.09, len * 0.8, E.plenum, { x: plenumX, y: plenumY, r: 0.035 }));
  // A runner from the plenum to each intake port: across the valley on a V, down the side on an inline.
  for (let k = 0; k < per; k += 1) {
    const z = -len / 2 + 0.05 + pitch * (k + 0.5);
    if (vee) for (const s of [-1, 1]) add(tube([s * 0.05, plenumY - 0.02, z + s * pitch * 0.18], [s * 0.1, deckY + 0.05, z + s * pitch * 0.18], 0.018, E.plenum));
    else add(tube([plenumX + 0.03, plenumY, z], [-0.08, deckY + 0.06, z], 0.018, E.plenum));
  }
  const tbZ = len * 0.4 + 0.05;
  add(cyl(0.045, 0.045, 0.07, E.turboCold, { axis: 'z', x: plenumX, y: plenumY, z: tbZ, seg: 20 }));
  // The inlet: a cone filter, or the pipe back to the airbox.
  const inletZ = tbZ + 0.12;
  if (spec.intake) add(cyl(0.05, 0.07, 0.13, E.filter, { axis: 'z', x: plenumX, y: plenumY, z: inletZ + 0.03 }));
  else add(cyl(0.045, 0.045, 0.16, E.hose, { axis: 'z', x: plenumX, y: plenumY, z: inletZ }));

  // ---- the supercharger, on top of the plenum, its pulley at the front ----
  if (spec.supercharger) {
    add(box(0.17, 0.11, len * 0.6, E.turboCold, { x: plenumX, y: plenumY + 0.1 }));
    for (let k = 0; k < 5; k += 1) add(box(0.18, 0.008, 0.012, E.turbo, { x: plenumX, y: plenumY + 0.13, z: -len * 0.25 + k * len * 0.12 }));
    add(cyl(0.05, 0.05, 0.03, E.pulley, { axis: 'z', x: plenumX, y: plenumY + 0.1, z: len * 0.3 + 0.02 }));
  }

  // ---- the exhaust: logs or headers, on each bank's outer side ----
  // Everything from here to nitrous carries exhaust heat: what a burnt valve blues.
  const exFrom = root.children.length;
  const exSides = vee ? [-1, 1] : [1];
  for (const s of exSides) {
    const ex = s * (vee ? 0.27 : 0.14);
    const exY = vee ? deckY - 0.02 : deckY + 0.04;
    if (spec.headers) {
      // A primary from each port, dropping to a collector at the back.
      for (let k = 0; k < per; k += 1) {
        const z = -len / 2 + 0.05 + pitch * (k + 0.5);
        add(tube([ex - s * 0.04, exY, z], [ex + s * 0.03, exY - 0.03, z], 0.016, E.pipeHot));
        add(tube([ex + s * 0.03, exY - 0.03, z], [ex + s * 0.045, exY - 0.2, -len * 0.1 + (z + len * 0.1) * 0.3], 0.016, E.pipeHot));
      }
      add(cyl(0.035, 0.035, len * 0.7, E.pipeHot, { axis: 'z', x: ex + s * 0.045, y: exY - 0.22, z: -len * 0.1, seg: 16 }));
    } else {
      // A cast log manifold: a round log along the head, a short port to each cylinder.
      add(cyl(0.032, 0.032, len * 0.8, E.pipe, { axis: 'z', x: ex, y: exY, seg: 14 }));
      for (let k = 0; k < per; k += 1) add(tube([ex - s * 0.05, exY + 0.01, -len / 2 + 0.05 + pitch * (k + 0.5)], [ex, exY, -len / 2 + 0.05 + pitch * (k + 0.5)], 0.022, E.pipe));
    }
  }

  // ---- the turbo, off the exhaust at the back, its cold side piped to the throttle ----
  // Twins: one on each bank of a V, or two along an inline's manifold.
  if (spec.turbo) {
    const ty = deckY - 0.05;
    const places = spec.twinTurbo
      ? (vee ? [{ s: 1, z: -len / 2 + 0.05 }, { s: -1, z: -len / 2 + 0.05 }] : [{ s: 1, z: -len / 2 + 0.05 }, { s: 1, z: 0.02 }])
      : [{ s: 1, z: -len / 2 + 0.05 }];
    for (const { s, z: tz } of places) {
      const tx = s * (vee ? 0.36 : 0.26);
      const hot = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.04, 6, 12), new THREE.MeshToonMaterial({ color: E.pipeHot }));
      hot.position.set(tx, ty, tz);
      add(hot);
      add(cyl(0.075, 0.075, 0.06, E.turboCold, { axis: 'x', x: tx + s * 0.08, y: ty, z: tz }));
      add(cyl(0.035, 0.035, 0.06, E.turboCold, { axis: 'x', x: tx + s * 0.14, y: ty, z: tz }));
      // The charge pipe forward along the side, to the throttle (through the intercooler).
      const run = len / 2 + 0.05 - tz;
      add(cyl(0.03, 0.03, run, E.hose, { axis: 'z', x: tx + s * 0.08, y: ty + 0.09, z: tz + run / 2 }));
    }
    if (spec.intercooler) {
      add(box(0.5, 0.2, 0.06, E.cooler, { y: 0.32, z: len / 2 + 0.24 }));
      for (let k = 0; k < 8; k += 1) add(box(0.48, 0.006, 0.065, E.turbo, { y: 0.24 + k * 0.022, z: len / 2 + 0.24 }));
    }
  }

  const hot = new Set([new THREE.Color(E.pipe).getHex(), new THREE.Color(E.pipeHot).getHex()]);
  const exhaustParts = /** @type {THREE.Mesh[]} */ (root.children.slice(exFrom)
    .filter((o) => /** @type {THREE.Mesh} */ (o).isMesh && hot.has(/** @type {any} */ (o).material?.color?.getHex?.())));

  // ---- nitrous: the solenoid and its blue line into the intake ----
  if (spec.nitrous) {
    add(cyl(0.025, 0.025, 0.07, E.bottle, { x: plenumX + 0.12, y: plenumY + 0.05, z: len * 0.3 }));
    add(box(0.12, 0.012, 0.012, E.bottle, { x: plenumX + 0.06, y: plenumY + 0.02, z: len * 0.3 }));
  }

  // ---- the front: the crank pulley, the alternator, the water pump, and the belt round them ----
  const front = len / 2 + 0.03;
  const crankY = 0.1 + blockH * 0.4;
  // The timing cover over the front of the block, the pulleys on the outside of it.
  add(rbox(vee ? 0.34 : 0.24, deckY - 0.1, 0.03, E.blockDark, { y: 0.1 + (deckY - 0.1) / 2, z: len / 2 + 0.002, r: 0.012 }));
  const crank = cyl(0.08, 0.08, 0.04, E.pulley, { axis: 'z', y: crankY, z: front, seg: 28 });
  const alt = cyl(0.05, 0.05, 0.04, E.pulley, { axis: 'z', x: -0.16, y: crankY + 0.2, z: front, seg: 20 });
  const pump = cyl(0.045, 0.045, 0.04, E.pulley, { axis: 'z', y: crankY + 0.16, z: front, seg: 20 });
  // The alternator: a finned round body on a bracket, behind its pulley.
  add(cyl(0.07, 0.07, 0.11, E.turboCold, { axis: 'z', x: -0.16, y: crankY + 0.2, z: front - 0.075, seg: 20 }));
  add(box(0.03, 0.12, 0.03, E.blockDark, { x: -0.12, y: crankY + 0.12, z: front - 0.05 }));
  // A mark on each pulley, so it is plain when they turn.
  for (const p of [crank, alt, pump]) {
    const r = /** @type {THREE.CylinderGeometry} */ (p.geometry).parameters.radiusTop;
    p.add(box(0.012, r * 0.8, 0.01, E.turboCold, { y: r * 0.45, z: 0.0 }));
  }
  add(crank, alt, pump);
  // The belt tensioner: a sprung arm and its pulley, pressing on the slack side.
  const tens = cyl(0.028, 0.028, 0.032, E.pulley, { axis: 'z', x: -0.1, y: crankY + 0.06, z: front, seg: 16 });
  add(tens, box(0.06, 0.018, 0.012, E.blockDark, { x: -0.07, y: crankY + 0.075, z: front - 0.025 }));
  // The thermostat housing on the front of the head, its outlet for the radiator hose.
  add(cyl(0.03, 0.03, 0.04, E.blockDark, { x: vee ? 0 : 0.06, y: deckY + 0.03, z: len / 2 - 0.01, seg: 12 }));
  add(cyl(0.02, 0.02, 0.05, E.blockDark, { axis: 'z', x: vee ? 0 : 0.06, y: deckY + 0.04, z: len / 2 + 0.03, seg: 10 }));
  // The belt round them, on its pulleys' rims: each run is the line along the outside of
  // the two pulleys it joins, not through their middles.
  /** @type {[number, number, number][]} x, y, radius */
  const belt = [[0, crankY, 0.08], [-0.1, crankY + 0.06, 0.028], [-0.16, crankY + 0.2, 0.05], [0, crankY + 0.16, 0.045]];
  const cx = belt.reduce((a, p) => a + p[0], 0) / belt.length;
  const cy = belt.reduce((a, p) => a + p[1], 0) / belt.length;
  for (let i = 0; i < belt.length; i += 1) {
    const [x0, y0, r0] = belt[i];
    const [x1, y1, r1] = belt[(i + 1) % belt.length];
    const dx = x1 - x0; const dy = y1 - y0; const dl = Math.hypot(dx, dy);
    let nx = dy / dl; let ny = -dx / dl;
    if (nx * ((x0 + x1) / 2 - cx) + ny * ((y0 + y1) / 2 - cy) < 0) { nx = -nx; ny = -ny; }
    const ax = x0 + nx * r0; const ay = y0 + ny * r0; const bx = x1 + nx * r1; const by = y1 + ny * r1;
    const seg = box(0.008, Math.hypot(bx - ax, by - ay), 0.026, E.belt, { x: (ax + bx) / 2, y: (ay + by) / 2, z: front + 0.004 });
    seg.rotation.z = Math.atan2(ax - bx, by - ay);
    add(seg);
  }

  // ---- damage: what wear and a failure do to it, drawn (see the header above) ----
  const dmg = new THREE.Group();
  root.add(dmg);
  const smoke = makeSmoke(48);
  const debris = makeDebris();
  const flash = makeFlash();
  // Debris and the flash stay where they land, not riding the engine's shake.
  const loose = new THREE.Group();
  // Not part of the engine's shape: a camera framing the engine leaves it out.
  loose.userData.fx = true;
  loose.add(smoke.group, debris.group, flash.group);
  const oilMat = new THREE.MeshStandardMaterial({ color: E.oil, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  /** @type {EngineDamage|null} */
  let damage = null;
  let floor = -0.05;
  let wreckAge = 0;
  let puffT = 0;
  /** @type {THREE.Mesh|null} the oil on the floor under it */
  let pool = null;
  const v = new THREE.Vector3();
  /** Where a point of a bank is, in the engine's own frame. */
  const inRoot = (/** @type {THREE.Object3D} */ o, x = 0, y = 0, z = 0) => {
    root.updateMatrixWorld(true);
    return root.worldToLocal(o.localToWorld(v.set(x, y, z)).clone());
  };
  const lifted = new Map(covers.map((c) => [c.mesh, c.mesh.position.clone()]));
  /** Where the failure comes out: the side of the block a rod leaves by, or the top end. */
  const breach = () => (damage?.failed === 'bearing'
    ? new THREE.Vector3(-(caseW / 2 + 0.01), 0.1 + caseH * 0.45, -len * 0.15)
    : new THREE.Vector3(0, topY, len * 0.1));

  /** @param {EngineDamage|null} d @param {number} [floorY] the floor, in the engine's frame */
  const setDamage = (d, floorY) => {
    if (floorY != null) floor = floorY;
    const was = damage?.failed ?? null;
    damage = d;
    // What the last condition drew is thrown away, geometry and all: wear moves a percent
    // at a time while the engine runs, and each step redraws it.
    dmg.traverse((o) => { const m = /** @type {THREE.Mesh} */ (o); if (m.isMesh) m.geometry.dispose(); });
    dmg.clear();
    if (pool) { loose.remove(pool); pool.geometry.dispose(); pool = null; }
    for (const c of covers) { c.mesh.position.copy(/** @type {THREE.Vector3} */ (lifted.get(c.mesh))); c.mesh.rotation.set(0, 0, 0); }
    if (!d) { smoke.clear(); debris.clear(); wreckAge = 0; return; }
    if (!d.failed && was) { smoke.clear(); debris.clear(); wreckAge = 0; }
    const lost = (k) => Math.max(0, Math.min(1, 1 - d[k] / 100));
    // Burnt valves: the exhaust side blues with heat, from straw to purple.
    const burnt = Math.max(0, (lost('valve') - 0.3) / 0.7);
    for (const m of exhaustParts) {
      const base = /** @type {any} */ (m).userData.baseMat ?? (/** @type {any} */ (m).userData.baseMat = m.material);
      // Only the blued material made here is this mesh's own; the others are shared.
      if (/** @type {THREE.Material} */ (m.material).userData.burnt) /** @type {THREE.Material} */ (m.material).dispose();
      if (burnt <= 0) { m.material = base; continue; }
      const c = new THREE.Color(base.color).lerp(new THREE.Color(E.pipeBurnt), burnt * 0.85);
      m.material = new THREE.MeshStandardMaterial({ color: c, metalness: 0.55, roughness: 0.5 - burnt * 0.2 });
      m.material.userData.burnt = true;
    }
    // Oil where it should not be: down the block from the head gasket, and on the floor.
    const leak = Math.max(lost('piston'), lost('bearing'), d.failed ? 1 : 0);
    if (leak > 0.3) {
      const n = Math.round(2 + leak * 6);
      for (let i = 0; i < n; i += 1) {
        const sx = i % 2 ? 1 : -1;
        const z = -len * 0.4 + ((i * 0.37) % 1) * len * 0.8;
        const h = (0.06 + ((i * 0.53) % 1) * 0.14) * (0.6 + leak);
        dmg.add(new THREE.Mesh(new THREE.PlaneGeometry(0.03 + (i % 3) * 0.012, h), oilMat).translateX(sx * (caseW / 2 + 0.013)).translateY(deckY - 0.02 - h / 2).translateZ(z).rotateY(sx * Math.PI / 2));
      }
      pool = new THREE.Mesh(new THREE.CircleGeometry(0.1 + leak * 0.35, 20), oilMat);
      pool.rotation.x = -Math.PI / 2;
      pool.scale.set(1, 0.65, 1);
      pool.position.set(-0.05, floor + 0.012, -len * 0.05);
      loose.add(pool);
    }
    // The wreck, by what failed.
    if (d.failed === 'bearing') {
      // A hole punched in the crankcase, and the broken rod sticking out of it.
      const hole = new THREE.Shape();
      for (let k = 0; k < 12; k += 1) {
        const a = (k / 12) * Math.PI * 2;
        const r = 0.06 * (k % 2 ? 0.55 : 1) * (1 + ((k * 7) % 5) * 0.08);
        if (k) hole.lineTo(Math.cos(a) * r, Math.sin(a) * r); else hole.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      const holeM = new THREE.Mesh(new THREE.ShapeGeometry(hole), new THREE.MeshBasicMaterial({ color: W.black }));
      holeM.position.set(-(caseW / 2 + 0.012), 0.1 + caseH * 0.45, -len * 0.15);
      holeM.rotation.y = -Math.PI / 2;
      dmg.add(holeM);
      const rod = box(0.026, 0.2, 0.036, E.turbo, { x: -(caseW / 2 + 0.07), y: 0.1 + caseH * 0.52, z: -len * 0.15 + 0.01 });
      rod.rotation.z = 0.9;
      rod.rotation.x = 0.3;
      dmg.add(rod);
    } else if (d.failed === 'valve') {
      // The head that ate a valve: its cover split off and lifted on one bank.
      const c = covers[0];
      c.mesh.position.y += 0.035;
      c.mesh.rotation.z = c.out * 0.35;
      c.mesh.rotation.x = 0.08;
    } else if (d.failed === 'piston') {
      // Crankcase pressure blew the oil out of the filler and over the top of the engine.
      for (const c of covers) {
        const sheen = new THREE.Mesh(new THREE.PlaneGeometry(0.12, len * 0.7), oilMat);
        sheen.position.copy(inRoot(c.mesh, 0, 0.04, 0));
        sheen.rotation.x = -Math.PI / 2;
        dmg.add(sheen);
      }
    }
  };

  /** Plays the failure once: a flash, the pieces thrown out, the smoke. */
  const blowUp = () => {
    if (!damage?.failed) return;
    const at = breach();
    flash.fire(at);
    const out = damage.failed === 'bearing' ? new THREE.Vector3(-1, 0.2, 0) : new THREE.Vector3(0, 1, 0);
    const mats = [toon(E.block), toon(E.turbo), toon(E.blockDark), oilMat];
    debris.burst(at, out, 18, mats, floor);
    for (let i = 0; i < 24; i += 1) smoke.emit(at, { color: i % 3 ? E.smokeDark : E.smoke, size: 0.1, rise: 0.5 + Math.random() * 0.5, life: 4 + Math.random() * 3, opacity: 0.75, spread: 0.2 });
    wreckAge = 0;
  };
  const group = new THREE.Group();
  group.add(root, loose);
  let ang = 0;
  let t = 0;
  return {
    group,
    size: { len: len + 0.2, wid: vee ? 0.8 : 0.6, hgt: topY + 0.15 },
    setDamage,
    blowUp,
    /** Whether something is still moving: smoke in the air, pieces landing, the flash. */
    busy: () => smoke.busy() || debris.busy() || flash.busy(),
    /** @param {number} dt seconds @param {number} rpm 0 when it is not running */
    update(dt, rpm) {
      // The crank turns at the engine's speed, slowed down for the eye (a real 800 rpm blurs).
      ang += (rpm / 60) * Math.PI * 2 * dt * 0.05;
      crank.rotation.z = ang;
      alt.rotation.z = ang * 2.6;
      pump.rotation.z = ang * 1.5;
      // A running engine rocks a little on its mounts; more at idle than at speed.
      t += dt;
      // Worn bearings knock: the rotating parts hammer their clearances, and it shows.
      const knock = rpm > 0 && damage ? Math.max(0, 0.5 - damage.bearing / 100) * 0.012 : 0;
      const shake = rpm > 0 ? 0.004 * (1 - Math.min(1, rpm / 6000)) + 0.001 + knock : 0;
      root.rotation.z = Math.sin(t * (rpm / 60) * 0.5) * shake;
      root.position.y = knock ? Math.abs(Math.sin(t * (rpm / 60) * Math.PI)) * knock * 0.4 : 0;
      // Blow-by: worn rings pressurise the crankcase, and it leaves by the oil filler as
      // blue-grey smoke, more of it the harder the engine works.
      const ring = damage && !damage.failed ? Math.max(0, 0.45 - damage.piston / 100) : 0;
      if (rpm > 0 && ring > 0 && filler) {
        puffT += dt * ring * (6 + rpm / 400);
        while (puffT > 1) { puffT -= 1; smoke.emit(inRoot(filler, 0, 0.01, 0), { color: E.smoke, size: 0.03, rise: 0.3, life: 1.8, opacity: 0.35 }); }
      }
      // A wreck smoulders: thick at first, thinning to a wisp that stays.
      if (damage?.failed) {
        wreckAge += dt;
        puffT += dt * (10 * Math.exp(-wreckAge / 3) + 1.6);
        while (puffT > 1) { puffT -= 1; smoke.emit(breach(), { color: E.smokeDark, size: 0.07, rise: 0.35, life: 3, opacity: 0.55, spread: 0.08 }); }
      }
      smoke.update(dt);
      debris.update(dt);
      flash.update(dt);
    },
  };
}

/**
 * The spec an engine is drawn from, out of the store's build slice and its derived engine.
 * @param {any} build @param {any} [derived]
 * @returns {EngineSpec}
 */
export function engineSpecOf(build, derived) {
  const cfg = build?.engineConfig ?? {};
  const layout = ['I4', 'I6', 'V6', 'V8'].includes(cfg.configuration) ? cfg.configuration : 'V6';
  return {
    layout,
    boreMm: derived?.bore ?? cfg.bore ?? 90,
    strokeMm: derived?.stroke ?? cfg.stroke ?? 86,
    valvetrain: derived?.valvetrain ?? cfg.valvetrain ?? 'dohc',
    turbo: !!build?.turboOn,
    supercharger: !build?.turboOn && !!build?.blowerId,
    intercooler: !!build?.mods?.intercooler,
    intake: !!build?.mods?.intake,
    headers: !!build?.mods?.headers,
    nitrous: !!build?.nitrous,
    blockMaterial: cfg.blockMaterial,
    headMaterial: cfg.headMaterial,
    vvt: !!cfg.vvt && cfg.vvt !== 'none',
    direct: cfg.injection === 'direct',
    twinTurbo: !!build?.turboOn && (build?.turbineCount ?? 1) > 1,
    sparkPlugs: cfg.sparkPlugs ?? 1,
  };
}
