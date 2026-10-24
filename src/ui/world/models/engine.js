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
import { THREE, box, cyl } from '../gfx.js';

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

const PER_BANK = { I4: 4, I6: 6, V6: 3, V8: 4 };
/** Half the V angle, radians: a 60-degree V6 and a 90-degree V8. */
const HALF_V = { V6: Math.PI / 6, V8: Math.PI / 4 };

/**
 * @param {EngineSpec} spec
 * @returns {{group: THREE.Group, size: {len: number, wid: number, hgt: number}, update: (dt: number, rpm: number) => void}}
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
  const sumpW = vee ? 0.32 : 0.24;
  add(box(sumpW, 0.1, len * 0.85, E.blockDark, { y: 0.05, z: -0.02 }));
  const deckY = 0.1 + blockH;
  const iron = spec.blockMaterial === 'Cast Iron';
  add(box(vee ? 0.36 : 0.22, blockH, len, iron ? E.blockIron : E.block, { y: 0.1 + blockH / 2 }));
  // Ribs cast into the block's sides.
  for (let k = 0; k < per; k += 1) for (const s of [-1, 1]) add(box(0.012, blockH * 0.7, 0.02, iron ? E.blockIronDark : E.blockDark, { x: s * ((vee ? 0.36 : 0.22) / 2 + 0.006), y: 0.1 + blockH * 0.45, z: -len / 2 + 0.05 + pitch * (k + 0.5) }));
  add(cyl(0.2, 0.22, 0.06, E.flywheel, { axis: 'z', y: 0.1 + blockH * 0.45, z: -len / 2 - 0.03, seg: 16 }));

  // ---- the banks: a head and its cover on each, the plugs or coils on top ----
  /** @type {{x: number, y: number, ang: number, out: number}[]} */
  const banks = vee ? [-1, 1].map((s) => ({ x: s * 0.13, y: deckY - 0.02, ang: s * HALF_V[/** @type {'V6'|'V8'} */ (layout)], out: s })) : [{ x: 0, y: deckY, ang: 0, out: 1 }];
  const headH = vt === 'ohv' ? 0.08 : 0.11;
  for (const b of banks) {
    const bank = new THREE.Group();
    bank.position.set(b.x, b.y, 0);
    bank.rotation.z = -b.ang;
    const hw = vt === 'dohc' ? 0.2 : vt === 'sohc' ? 0.16 : 0.15;
    bank.add(box(hw, headH, len - 0.02, spec.headMaterial === 'Cast Iron' ? E.headIron : E.head, { y: headH / 2 }));
    const coverH = vt === 'ohv' ? 0.05 : 0.07;
    const cover = vt === 'ohv' ? E.coverOhv : E.cover;
    bank.add(box(hw - 0.02, coverH, len - 0.06, cover, { y: headH + coverH / 2 }));
    if (vt === 'dohc') for (const cx of [-0.045, 0.045]) bank.add(box(0.045, 0.02, len - 0.1, E.coverDark, { x: cx, y: headH + coverH + 0.01 }));
    else bank.add(box(0.05, 0.015, len - 0.1, vt === 'ohv' ? E.hose : E.coverDark, { y: headH + coverH + 0.008 }));
    // A coil (or a plug lead) for every cylinder on the bank: two a cylinder on a twin-plug head.
    const coils = spec.sparkPlugs === 2 ? [-0.035, 0.035] : [0];
    for (let k = 0; k < per; k += 1) for (const dz of coils) bank.add(box(0.03, 0.04, 0.03, E.plug, { x: vt === 'ohv' ? b.out * 0.06 : 0, y: headH + coverH + 0.03, z: -len / 2 + 0.05 + pitch * (k + 0.5) + dz * pitch * 2.4 }));
    // Cam phasers: a disc on the nose of each cam, at the belt end.
    if (spec.vvt && vt !== 'ohv') for (const cx of vt === 'dohc' ? [-0.045, 0.045] : [0]) bank.add(cyl(0.05, 0.05, 0.03, E.pulley, { axis: 'z', x: cx, y: headH * 0.6, z: len / 2 + 0.01, seg: 12 }));
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
  add(box(vee ? 0.16 : 0.1, 0.09, len * 0.8, E.plenum, { x: plenumX, y: plenumY }));
  if (!vee) for (let k = 0; k < per; k += 1) add(box(0.11, 0.035, 0.035, E.plenum, { x: -0.13, y: deckY + 0.07, z: -len / 2 + 0.05 + pitch * (k + 0.5) }));
  const tbZ = len * 0.4 + 0.05;
  add(cyl(0.045, 0.045, 0.07, E.turboCold, { axis: 'z', x: plenumX, y: plenumY, z: tbZ }));
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
  const exSides = vee ? [-1, 1] : [1];
  for (const s of exSides) {
    const ex = s * (vee ? 0.27 : 0.14);
    const exY = vee ? deckY - 0.02 : deckY + 0.04;
    if (spec.headers) {
      // A primary from each port, dropping to a collector at the back.
      for (let k = 0; k < per; k += 1) {
        const z = -len / 2 + 0.05 + pitch * (k + 0.5);
        add(box(0.03, 0.03, 0.08, E.pipeHot, { x: ex, y: exY, z }));
        add(box(0.03, 0.2, 0.03, E.pipeHot, { x: ex + s * 0.04, y: exY - 0.1, z }));
      }
      add(cyl(0.035, 0.035, len * 0.7, E.pipeHot, { axis: 'z', x: ex + s * 0.04, y: exY - 0.22, z: -len * 0.1 }));
    } else {
      add(box(0.06, 0.06, len * 0.8, E.pipe, { x: ex, y: exY }));
      for (let k = 0; k < per; k += 1) add(box(0.04, 0.04, 0.04, E.pipe, { x: ex - s * 0.04, y: exY, z: -len / 2 + 0.05 + pitch * (k + 0.5) }));
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

  // ---- nitrous: the solenoid and its blue line into the intake ----
  if (spec.nitrous) {
    add(cyl(0.025, 0.025, 0.07, E.bottle, { x: plenumX + 0.12, y: plenumY + 0.05, z: len * 0.3 }));
    add(box(0.12, 0.012, 0.012, E.bottle, { x: plenumX + 0.06, y: plenumY + 0.02, z: len * 0.3 }));
  }

  // ---- the front: the crank pulley, the alternator, the water pump, and the belt round them ----
  const front = len / 2 + 0.03;
  const crankY = 0.1 + blockH * 0.4;
  const crank = cyl(0.08, 0.08, 0.04, E.pulley, { axis: 'z', y: crankY, z: front, seg: 12 });
  const alt = cyl(0.05, 0.05, 0.04, E.pulley, { axis: 'z', x: -0.16, y: crankY + 0.2, z: front, seg: 10 });
  const pump = cyl(0.045, 0.045, 0.04, E.pulley, { axis: 'z', y: crankY + 0.16, z: front, seg: 10 });
  add(cyl(0.065, 0.075, 0.1, E.turboCold, { axis: 'z', x: -0.16, y: crankY + 0.2, z: front - 0.07, seg: 10 }));
  // A mark on each pulley, so it is plain when they turn.
  for (const p of [crank, alt, pump]) {
    const r = /** @type {THREE.CylinderGeometry} */ (p.geometry).parameters.radiusTop;
    p.add(box(0.012, r * 0.8, 0.01, E.turboCold, { y: r * 0.45, z: 0.0 }));
  }
  add(crank, alt, pump);
  const belt = [[0, crankY], [-0.16, crankY + 0.2], [0, crankY + 0.16]];
  for (let i = 0; i < belt.length; i += 1) {
    const [x0, y0] = belt[i];
    const [x1, y1] = belt[(i + 1) % belt.length];
    const d = Math.hypot(x1 - x0, y1 - y0);
    const seg = box(0.012, d, 0.03, E.belt, { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: front + 0.025 });
    seg.rotation.z = Math.atan2(x0 - x1, y1 - y0);
    add(seg);
  }

  const group = new THREE.Group();
  group.add(root);
  let ang = 0;
  let t = 0;
  return {
    group,
    size: { len: len + 0.2, wid: vee ? 0.8 : 0.6, hgt: topY + 0.15 },
    /** @param {number} dt seconds @param {number} rpm 0 when it is not running */
    update(dt, rpm) {
      // The crank turns at the engine's speed, slowed down for the eye (a real 800 rpm blurs).
      ang += (rpm / 60) * Math.PI * 2 * dt * 0.05;
      crank.rotation.z = ang;
      alt.rotation.z = ang * 2.6;
      pump.rotation.z = ang * 1.5;
      // A running engine rocks a little on its mounts; more at idle than at speed.
      t += dt;
      const shake = rpm > 0 ? 0.004 * (1 - Math.min(1, rpm / 6000)) + 0.001 : 0;
      root.rotation.z = Math.sin(t * (rpm / 60) * 0.5) * shake;
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
