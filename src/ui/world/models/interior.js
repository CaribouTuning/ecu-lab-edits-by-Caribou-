/**
 * The inside of a car, for the one you are driving: a dash with a hooded binnacle and two
 * working dials, a three-spoke wheel that turns with the steering, a driver's arms and hands
 * holding it, the A-pillars and roof lining seen from the seat, a rear-view mirror and door cards.
 *
 * It is built only for the car you drive (a town of cars with full interiors would cost draw
 * calls for nothing). The first-person camera sits at `rig.seat` plus a head's height; the
 * body's roof, glass and pillars are hidden then (`setCockpit`), and these panels, drawn
 * double-sided, are what you see of the cabin.
 *
 * Car-local coordinates: x to the driver's side, y up, z forward.
 */

import { world as W } from '../../tokens.js';
import { THREE, box, cyl, pixelTexture, toon } from '../gfx.js';

const C = W.cockpit;
const dbl = (/** @type {string} */ hex) => toon(hex, { side: THREE.DoubleSide });

/** A dial face painted once: dark, a ring, amber ticks and a red zone. @param {number} ticks @param {number} red */
function dialTexture(ticks, red) {
  const N = 32;
  return pixelTexture(N, N, (g) => {
    for (let y = 0; y < N; y += 1) for (let x = 0; x < N; x += 1) {
      const d = Math.hypot(x - 15.5, y - 15.5);
      if (d > 15.5) continue;
      g.fillStyle = d > 13.5 ? C.dialRing : C.dial;
      g.fillRect(x, y, 1, 1);
    }
    for (let i = 0; i <= ticks; i += 1) {
      const a = ((-135 + (i / ticks) * 270) * Math.PI) / 180;
      for (let r = i % 2 === 0 ? 9 : 10.5; r <= 12.2; r += 0.5) {
        g.fillStyle = red >= 0 && i >= red ? C.needle : C.ink;
        g.fillRect(Math.round(15.5 + Math.sin(a) * r), Math.round(15.5 - Math.cos(a) * r), 1, 1);
      }
    }
  });
}

/**
 * @param {object} d the cab's dimensions from the body
 * @param {number} d.Wd body width @param {number} d.belt @param {number} d.top
 * @param {number} d.zr1 @param {number} d.zf0 @param {number} d.zf1
 * @param {number} d.gw0 glass width at the belt @param {number} d.gw1 and at the roof
 * @param {THREE.Vector3} d.seat where the driver sits
 */
export function makeInterior({ Wd, belt, top, zf0, zf1, zr1, gw0, gw1, seat }) {
  const group = new THREE.Group();
  const x = seat.x;
  const wheelAt = new THREE.Vector3(x, belt + 0.1, zf0 - 0.43);
  const TILT = 0.62;

  // ---- the shell you see from the seat ----
  group.add(box(gw1 * 0.98, 0.03, zf1 - zr1 + 0.06, C.roof, { y: top - 0.07, z: (zr1 + zf1) / 2, mat: dbl(C.roof), edge: false }));
  const along = (/** @type {THREE.Vector3} */ a, /** @type {THREE.Vector3} */ b, /** @type {number} */ w, /** @type {number} */ t, /** @type {string} */ color) => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const m = box(w, t, len, color, { mat: dbl(color), edge: false });
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
    return m;
  };
  for (const s of [-1, 1]) {
    // A-pillar: from the cowl corner up to the roof's front corner, with a lit inner edge.
    const lo = new THREE.Vector3(s * (gw0 / 2 - 0.02), belt, zf0);
    const hi = new THREE.Vector3(s * (gw1 / 2 - 0.02), top - 0.06, zf1);
    group.add(along(lo, hi, 0.09, 0.06, C.pillar));
    group.add(along(lo.clone().add(new THREE.Vector3(-s * 0.05, 0, 0)), hi.clone().add(new THREE.Vector3(-s * 0.05, 0, 0)), 0.015, 0.03, C.pillarHi));
    // Door card and window sill.
    group.add(box(0.05, 0.34, 1.1, C.dash, { x: s * (Wd / 2 - 0.1), y: belt - 0.12, z: (zr1 + zf0) / 2 - 0.1, mat: dbl(C.dash), edge: false }));
    group.add(box(0.07, 0.04, 1.1, C.dashHi, { x: s * (Wd / 2 - 0.11), y: belt + 0.03, z: (zr1 + zf0) / 2 - 0.1, mat: dbl(C.dashHi), edge: false }));
  }
  // The header over the screen, and the mirror hung from it.
  group.add(box(gw1 * 0.98, 0.07, 0.07, C.pillar, { y: top - 0.07, z: zf1 - 0.01, mat: dbl(C.pillar), edge: false }));
  group.add(box(0.02, 0.07, 0.02, C.dashLow, { y: top - 0.13, z: zf1 + 0.04, edge: false }));
  group.add(box(0.26, 0.075, 0.025, C.mirror, { y: top - 0.19, z: zf1 + 0.05, mat: new THREE.MeshBasicMaterial({ color: C.mirror }), edge: false }));

  // ---- the dash ----
  group.add(box(Wd * 0.86, 0.17, 0.46, C.dash, { y: belt + 0.03, z: zf0 - 0.24, mat: dbl(C.dash), edge: false }));
  // A lit lip along the top, and a darker lower panel with the vents.
  group.add(box(Wd * 0.86, 0.02, 0.1, C.dashHi, { y: belt + 0.125, z: zf0 - 0.06, mat: dbl(C.dashHi), edge: false }));
  group.add(box(Wd * 0.84, 0.15, 0.34, C.dashLow, { y: belt - 0.1, z: zf0 - 0.3, mat: dbl(C.dashLow), edge: false }));
  for (const vx of [-0.42, -0.26]) {
    group.add(box(0.12, 0.05, 0.02, C.dashLow, { x: vx, y: belt + 0.075, z: zf0 - 0.04, edge: false }));
    group.add(box(0.1, 0.01, 0.022, C.dashHi, { x: vx, y: belt + 0.078, z: zf0 - 0.039, edge: false }));
  }
  // The binnacle: a hood over the dials, facing the driver.
  const cluster = new THREE.Group();
  cluster.position.set(x, belt + 0.2, zf0 - 0.33);
  cluster.rotation.x = 0.42;
  cluster.add(box(0.44, 0.17, 0.05, C.outline, { y: 0, z: 0.01, mat: dbl(C.outline), edge: false }));
  cluster.add(box(0.45, 0.02, 0.07, C.dashHi, { y: 0.09, z: 0.02, edge: false }));
  /** @param {number} dx @param {number} ticks @param {number} red */
  const dial = (dx, ticks, red) => {
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.076, 20), new THREE.MeshBasicMaterial({ map: dialTexture(ticks, red), transparent: true }));
    face.position.set(dx, 0, -0.018);
    face.rotation.y = Math.PI;
    cluster.add(face);
    const pivot = new THREE.Group();
    pivot.position.set(dx, 0, -0.022);
    const needle = box(0.008, 0.062, 0.004, C.needle, { y: 0.03, mat: new THREE.MeshBasicMaterial({ color: C.needle }), edge: false });
    pivot.add(needle);
    pivot.add(box(0.018, 0.018, 0.006, C.ink, { mat: new THREE.MeshBasicMaterial({ color: C.ink }), edge: false }));
    cluster.add(pivot);
    return pivot;
  };
  const speedPivot = dial(-0.105, 16, -1);
  const rpmPivot = dial(0.105, 11, 9);
  /** @type {THREE.Mesh[]} */
  const lamps = [];
  for (let k = 0; k < 4; k += 1) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.01, 0.004), new THREE.MeshBasicMaterial({ color: C.lampOff }));
    l.position.set(-0.04 + k * 0.027, -0.075, -0.021);
    cluster.add(l);
    lamps.push(l);
  }
  group.add(cluster);

  // ---- the steering column and wheel ----
  const column = box(0.07, 0.07, 0.3, C.dashLow, { x, y: belt + 0.04, z: zf0 - 0.3, edge: false });
  column.rotation.x = 0.55;
  group.add(column);
  const pivot = new THREE.Group();
  pivot.position.copy(wheelAt);
  pivot.rotation.x = TILT;
  const spin = new THREE.Group();
  pivot.add(spin);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.024, 6, 16), toon(C.wheel));
  spin.add(rim);
  spin.add(box(0.03, 0.026, 0.03, C.marker, { y: 0.15, edge: false, mat: new THREE.MeshBasicMaterial({ color: C.marker }) }));
  for (const [sx, sy, w, h] of /** @type {[number, number, number, number][]} */ ([[-0.075, 0, 0.15, 0.04], [0.075, 0, 0.15, 0.04], [0, -0.075, 0.04, 0.15]])) spin.add(box(w, h, 0.03, C.wheel, { x: sx, y: sy, edge: false }));
  spin.add(cyl(0.05, 0.055, 0.06, C.wheelHi, { axis: 'z', z: -0.01, seg: 10, edge: false }));
  spin.add(box(0.03, 0.03, 0.01, C.marker, { z: -0.045, edge: false, mat: new THREE.MeshBasicMaterial({ color: C.marker }) }));
  group.add(pivot);

  // ---- the driver's arms: shoulder, elbow, wrist; hands gripping the rim at ten and two ----
  // A hand turns with the wheel until it would cross the top or the bottom of the rim; then it
  // lets go and slides, the way a driver feeds the wheel hand over hand.
  const R = 0.15;
  const hands = [-1, 1].map((side) => {
    const hand = new THREE.Group();
    // A fist wrapped round the rim: knuckles in front of it, the thumb hooked over the top.
    hand.add(box(0.05, 0.075, 0.05, C.skin, { z: 0.03, edge: false }));
    hand.add(box(0.05, 0.075, 0.035, C.skinShade, { z: -0.03, edge: false }));
    hand.add(box(0.02, 0.03, 0.06, C.skinHi, { x: -side * 0.03, y: 0.04, edge: false }));
    pivot.add(hand);
    const upper = box(0.06, 0.06, 1, C.sleeve, { edge: false });
    const fore = box(0.05, 0.05, 1, C.sleeve, { edge: false });
    const elbow = box(0.065, 0.065, 0.065, C.sleeveDark, { edge: false });
    const cuff = box(0.058, 0.058, 0.035, C.sleeveDark, { edge: false });
    group.add(upper, fore, elbow, cuff);
    return { side, hand, upper, fore, elbow, cuff };
  });
  const shoulder = (/** @type {number} */ side) => new THREE.Vector3(x + side * 0.22, seat.y - 0.12, seat.z - 0.12);
  /** Where a hand sits round the rim, radians from the top: it turns with the rim, within its side. */
  const grip = (/** @type {number} */ side, /** @type {number} */ wheel) => (side > 0
    ? Math.max(0.25, Math.min(2.4, 1.0 - wheel)) : Math.max(-2.4, Math.min(-0.25, -1.0 - wheel)));
  const handAt = (/** @type {number} */ phi) => new THREE.Vector3(Math.sin(phi) * R, Math.cos(phi) * R, 0);
  const zAxis = new THREE.Vector3(0, 0, 1);
  const xAxis = new THREE.Vector3(1, 0, 0);
  const inCar = (/** @type {THREE.Vector3} */ v) => v.clone().applyAxisAngle(xAxis, TILT).add(wheelAt);
  // Bone lengths from the resting reach, so the elbows always keep a bend.
  const reach = inCar(handAt(1.0)).distanceTo(shoulder(1));
  const BONE = reach * 0.6;
  /** Lay a unit-long box between two points. @param {THREE.Mesh} m @param {THREE.Vector3} a @param {THREE.Vector3} b */
  const span = (m, a, b) => {
    const d = new THREE.Vector3().subVectors(b, a);
    m.scale.set(1, 1, d.length());
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(zAxis, d.normalize());
  };

  const api = {
    group,
    /** Turn the wheel: radians, clockwise as the driver sees it. @param {number} angle */
    setWheel(angle) {
      spin.rotation.z = angle;
      for (const h of hands) {
        const phi = grip(h.side, angle);
        h.hand.position.copy(handAt(phi));
        h.hand.rotation.z = -phi;
        const wrist = inCar(handAt(phi));
        const s = shoulder(h.side);
        const to = new THREE.Vector3().subVectors(wrist, s);
        const d = Math.min(to.length(), BONE * 2 - 1e-3);
        to.normalize();
        // The elbow: out to the side and down, as far off the shoulder-wrist line as the bones need.
        const pole = new THREE.Vector3(h.side, -1.2, 0).addScaledVector(to, -new THREE.Vector3(h.side, -1.2, 0).dot(to)).normalize();
        const off = Math.sqrt(Math.max(0, BONE * BONE - (d / 2) ** 2));
        const elbow = s.clone().addScaledVector(to, d / 2).addScaledVector(pole, off);
        span(h.upper, s, elbow);
        span(h.fore, elbow, wrist);
        h.elbow.position.copy(elbow);
        h.cuff.position.copy(wrist).addScaledVector(new THREE.Vector3().subVectors(elbow, wrist).normalize(), 0.045);
        h.cuff.quaternion.copy(h.fore.quaternion);
      }
    },
    /** @param {number} speed 0..1 of the sweep @param {number} rpm 0..1 of the sweep @param {boolean[]} [on] lamps lit */
    setGauges(speed, rpm, on = []) {
      speedPivot.rotation.z = -((-135 + Math.max(0, Math.min(1.05, speed)) * 270) * Math.PI) / 180;
      rpmPivot.rotation.z = -((-135 + Math.max(0, Math.min(1.05, rpm)) * 270) * Math.PI) / 180;
      lamps.forEach((l, i) => { /** @type {THREE.MeshBasicMaterial} */ (l.material).color.set(on[i] ? (i > 1 ? C.lampBad : C.lampOn) : C.lampOff); });
    },
  };
  api.setWheel(0);
  return api;
}
