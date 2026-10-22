/**
 * The inside of a car, for the one you are driving.
 *
 * Every kind of car has its own cabin, as real ones do:
 *   economy   hatchbacks, saloons, estates: grey plastics, two dials under a round hood, a
 *             four-spoke wheel, a radio and three heater knobs, cloth seats
 *   sport     coupes: black, a carbon strip, a big centre rev counter flanked by two small
 *             dials, a three-spoke wheel with a yellow top marker, bolstered buckets
 *   classic   muscle cars: a wood-faced dash with a row of four chrome-ringed gauges, a thin
 *             wheel with a chrome horn ring, a tan leather bench, a pistol-grip shifter
 *   exotic    supercars: a digital screen with a light-bar rev counter, a flat-bottomed
 *             wheel, suede with red stitching, a tunnel of toggle switches
 *   truck     SUVs and pickups: a tall square dash, a wide gauge pod, a big four-spoke wheel,
 *             a broad console with cup holders
 * All of them have the parts a driver sees: A-pillars, a headliner, the mirror and sun visors,
 * door cards with an armrest and a handle, a centre stack, a console with the gear lever, the
 * passenger seat, and the driver's own arms on the wheel.
 *
 * It is built only for the car you drive (a town of cars with full interiors would cost draw
 * calls for nothing). The first-person camera sits at the interior's `eye`, high in the glass; the
 * body's roof, glass and pillars are hidden then (`setCockpit`), and these panels, drawn
 * double-sided, are what you see of the cabin.
 *
 * Car-local coordinates: x to the driver's side, y up, z forward.
 */

import { world as W } from '../../tokens.js';
import { THREE, box, cyl, pixelTexture, toon } from '../gfx.js';

const C = W.cockpit;
const dbl = (/** @type {string} */ hex) => toon(hex, { side: THREE.DoubleSide });
const lit = (/** @type {string} */ hex) => new THREE.MeshBasicMaterial({ color: hex });

/** Which cabin each body has. @type {Record<string, keyof typeof W.interiors>} */
export const INTERIOR_OF = {
  hatch: 'economy', sedan: 'economy', wagon: 'economy', coupe: 'sport', muscle: 'classic', supercar: 'exotic', suv: 'truck', pickup: 'truck',
};

/**
 * How each cabin is laid out: its wheel, its instruments, its shifter and its seats.
 * @type {Record<keyof typeof W.interiors, {wheel: 'four'|'three'|'horn'|'flat', rim: number, cluster: 'twin'|'triple'|'row'|'digital'|'pod', shifter: 'knob'|'short'|'pistol'|'paddles'|'tall', seat: 'cloth'|'bucket'|'bench'|'race'|'captain'}>}
 */
const LAYOUT = {
  economy: { wheel: 'four', rim: 0.16, cluster: 'twin', shifter: 'knob', seat: 'cloth' },
  sport: { wheel: 'three', rim: 0.15, cluster: 'triple', shifter: 'short', seat: 'bucket' },
  classic: { wheel: 'horn', rim: 0.18, cluster: 'row', shifter: 'pistol', seat: 'bench' },
  exotic: { wheel: 'flat', rim: 0.14, cluster: 'digital', shifter: 'paddles', seat: 'race' },
  truck: { wheel: 'four', rim: 0.18, cluster: 'pod', shifter: 'tall', seat: 'captain' },
};

/**
 * A dial face painted once: a face, a ring, ticks and a red zone.
 * @param {{dial: string, dialRing: string, ink: string, needle: string}} P @param {number} ticks @param {number} red first red tick, or -1
 */
function dialTexture(P, ticks, red) {
  const N = 32;
  return pixelTexture(N, N, (g) => {
    for (let y = 0; y < N; y += 1) for (let x = 0; x < N; x += 1) {
      const d = Math.hypot(x - 15.5, y - 15.5);
      if (d > 15.5) continue;
      g.fillStyle = d > 13.5 ? P.dialRing : P.dial;
      g.fillRect(x, y, 1, 1);
    }
    for (let i = 0; i <= ticks; i += 1) {
      const a = ((-135 + (i / ticks) * 270) * Math.PI) / 180;
      for (let r = i % 2 === 0 ? 9 : 10.5; r <= 12.2; r += 0.5) {
        g.fillStyle = red >= 0 && i >= red ? P.needle : P.ink;
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
 * @param {string} [d.body] the body style, which picks the cabin
 */
export function makeInterior({ Wd, belt, top, zf0, zf1, zr1, gw0, gw1, seat, body = 'coupe' }) {
  const kind = INTERIOR_OF[body] ?? 'sport';
  const P = W.interiors[kind];
  const L = LAYOUT[kind];
  const group = new THREE.Group();
  const x = seat.x;
  // Everything is placed from the foot of the windscreen (zf0) and the beltline, so the view
  // works in every body: the eye sits well up in the glass, the dash and the dials stay under
  // the line from the eye to the road a few car lengths ahead, and the wheel is in the lap.
  const eye = new THREE.Vector3(x, Math.max(belt + 0.24, Math.min(top - 0.12, belt + 0.52 * (top - belt))), zf0 - 0.95);
  // Under a low roof the driver looks further down the road over the dash, not up at the lining.
  const pitch = Math.max(0.06, Math.min(0.2, 0.09 + (0.5 - (top - belt)) * 0.7));
  const R = L.rim;
  const wheelAt = new THREE.Vector3(x, belt - 0.05 - (R - 0.15) * 0.6, zf0 - 0.52);
  const TILT = kind === 'truck' ? 0.75 : kind === 'exotic' ? 0.5 : 0.62;
  const dashW = Wd * 0.86;
  const face = zf0 - 0.4;

  /** A box laid between two points. */
  const along = (/** @type {THREE.Vector3} */ a, /** @type {THREE.Vector3} */ b, /** @type {number} */ w, /** @type {number} */ t, /** @type {string} */ color) => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const m = box(w, t, dir.length(), color, { mat: dbl(color), edge: false });
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
    return m;
  };
  const add = (/** @type {THREE.Object3D[]} */ ...o) => { group.add(...o); };

  // ---- the shell you see from the seat ----
  // The headliner: light cloth, lit as much by the glass all round as by the floor below it.
  const liner = toon(C.roof, { side: THREE.DoubleSide, emissive: C.roof, emissiveIntensity: 0.35 });
  add(box(gw1 * 0.98, 0.03, zf1 - zr1 + 0.06, C.roof, { y: top - 0.07, z: (zr1 + zf1) / 2, mat: liner, edge: false }));
  for (const s of [-1, 1]) {
    // A-pillar: from the cowl corner up to the roof's front corner, with a lit inner edge.
    const lo = new THREE.Vector3(s * (gw0 / 2 - 0.02), belt, zf0);
    const hi = new THREE.Vector3(s * (gw1 / 2 - 0.02), top - 0.06, zf1);
    add(along(lo, hi, 0.09, 0.06, C.pillar));
    add(along(lo.clone().add(new THREE.Vector3(-s * 0.05, 0, 0)), hi.clone().add(new THREE.Vector3(-s * 0.05, 0, 0)), 0.015, 0.03, C.pillarHi));
    // Door card: the panel, a trim line, an armrest, a chrome handle, a window switch.
    const dx = s * (Wd / 2 - 0.1);
    const dz = (zr1 + zf0) / 2 - 0.1;
    add(box(0.05, 0.34, 1.1, P.dash, { x: dx, y: belt - 0.12, z: dz, mat: dbl(P.dash), edge: false }));
    add(box(0.07, 0.04, 1.1, P.dashHi, { x: s * (Wd / 2 - 0.11), y: belt + 0.03, z: dz, mat: dbl(P.dashHi), edge: false }));
    add(box(0.06, 0.025, 0.9, P.trim, { x: dx - s * 0.03, y: belt - 0.05, z: dz, edge: false }));
    add(box(0.1, 0.05, 0.4, P.dashLow, { x: dx - s * 0.06, y: belt - 0.16, z: eye.z + 0.05, edge: false }));
    add(box(0.03, 0.025, 0.1, C.chrome, { x: dx - s * 0.035, y: belt - 0.06, z: eye.z + 0.3, mat: lit(C.chrome), edge: false }));
    add(box(0.04, 0.012, 0.05, C.chromeDark, { x: dx - s * 0.08, y: belt - 0.13, z: eye.z + 0.12, edge: false }));
    // Sun visor, folded up against the headliner.
    add(box(0.34, 0.02, 0.17, C.roofShade, { x: s * 0.36, y: top - 0.1, z: zf1 - 0.14, edge: false }));
  }
  // The header over the screen, and the mirror hung from it.
  add(box(gw1 * 0.98, 0.035, 0.05, C.roofShade, { y: top - 0.075, z: zf1 - 0.01, mat: dbl(C.roofShade), edge: false }));
  add(box(0.02, 0.07, 0.02, C.pillar, { y: top - 0.13, z: zf1 + 0.04, edge: false }));
  add(box(0.27, 0.08, 0.03, C.pillar, { y: top - 0.19, z: zf1 + 0.055, edge: false }));
  add(box(0.25, 0.064, 0.02, C.mirror, { y: top - 0.19, z: zf1 + 0.04, mat: lit(C.mirror), edge: false }));

  // ---- floor and seats ----
  // The body's beltline deck runs across the cabin; carpet covers it, so the car reads as a
  // cabin around you and not a lid under you. (The driver's legs are under the dash, out of view.)
  add(box(Wd - 0.24, 0.012, zf0 - zr1 + 0.2, C.carpet, { y: belt + 0.004, z: (zr1 + zf0) / 2 - 0.15, edge: false }));
  /** A seat back beside you, with its headrest: the passenger's, seen as you glance across. @param {number} sx */
  const seatBack = (sx) => {
    const g = new THREE.Group();
    const wide = L.seat === 'bench' ? 0.5 : 0.46;
    g.add(box(wide, 0.55, 0.1, P.seat, { y: 0.27, edge: false }));
    if (L.seat === 'bucket' || L.seat === 'race') {
      // Side bolsters, and a contrasting centre stripe.
      for (const b of [-1, 1]) g.add(box(0.07, 0.5, 0.16, P.seat, { x: (b * wide) / 2, y: 0.25, z: -0.03, edge: false }));
      g.add(box(0.14, 0.5, 0.012, P.seatHi, { y: 0.27, z: -0.055, edge: false }));
    } else if (L.seat === 'bench') {
      for (let k = 0; k < 4; k += 1) g.add(box(wide - 0.04, 0.012, 0.012, P.seatHi, { y: 0.08 + k * 0.13, z: -0.056, edge: false }));
    } else {
      g.add(box(wide - 0.08, 0.3, 0.012, P.seatHi, { y: 0.3, z: -0.055, edge: false }));
    }
    if (L.seat === 'race') g.add(box(0.12, 0.08, 0.012, C.outline, { y: 0.47, z: -0.056, edge: false }));
    else g.add(box(0.24, 0.16, 0.09, P.seat, { y: 0.66, edge: false }));
    g.position.set(sx, belt - 0.05, eye.z - 0.32);
    g.rotation.x = -0.18;
    return g;
  };
  add(seatBack(-x));
  if (L.seat === 'bench') add(box(Wd - 0.3, 0.12, 0.5, P.seat, { y: belt + 0.02, z: eye.z - 0.05, edge: false }));

  // ---- the dash ----
  add(box(dashW, 0.32, 0.03, P.dashLow, { y: belt - 0.16, z: face, mat: dbl(P.dashLow), edge: false }));
  const dashH = kind === 'truck' ? 0.24 : 0.17;
  add(box(dashW, dashH, 0.4, P.dash, { y: belt - 0.1 + (dashH - 0.17) / 2, z: zf0 - 0.2, mat: dbl(P.dash), edge: false }));
  // The top lip, and the trim strip across the face: wood, carbon, red or plain.
  add(box(dashW, 0.02, 0.1, P.dashHi, { y: belt - 0.005 + (dashH - 0.17), z: zf0 - 0.06, mat: dbl(P.dashHi), edge: false }));
  add(box(dashW, kind === 'classic' ? 0.09 : 0.03, 0.015, P.trim, { y: belt - (kind === 'classic' ? 0.09 : 0.11), z: face - 0.02, edge: false }));
  if (kind === 'sport') for (let k = 0; k < 14; k += 1) add(box(0.03, 0.03, 0.016, k % 2 ? P.dash : P.dashHi, { x: -dashW / 2 + 0.05 + k * 0.06, y: belt - 0.11, z: face - 0.022, edge: false }));
  add(box(dashW * 0.98, 0.15, 0.3, P.dashLow, { y: belt - 0.25, z: zf0 - 0.25, mat: dbl(P.dashLow), edge: false }));
  // Vents: two at the ends, two in the middle.
  for (const vx of [-dashW / 2 + 0.12, -0.12, 0.12, dashW / 2 - 0.12]) {
    if (Math.abs(vx - x) < 0.16) continue;
    if (kind === 'exotic' || kind === 'classic') add(cyl(0.04, 0.04, 0.02, C.chromeDark, { axis: 'z', x: vx, y: belt - 0.06, z: face - 0.02, seg: 10, edge: false }));
    else {
      add(box(0.13, 0.055, 0.02, P.dashLow, { x: vx, y: belt - 0.06, z: face - 0.015, edge: false }));
      for (let k = 0; k < 3; k += 1) add(box(0.11, 0.008, 0.022, P.dashHi, { x: vx, y: belt - 0.08 + k * 0.02, z: face - 0.016, edge: false }));
    }
  }
  // The glovebox on the passenger's side.
  add(box(0.36, 0.13, 0.012, P.dash, { x: -x, y: belt - 0.22, z: face - 0.02, edge: false }));
  add(box(0.08, 0.02, 0.014, C.chromeDark, { x: -x, y: belt - 0.17, z: face - 0.022, edge: false }));

  // ---- the centre stack and the console ----
  add(box(0.3, 0.3, 0.06, P.dashLow, { y: belt - 0.2, z: face - 0.03, edge: false }));
  if (kind === 'exotic' || kind === 'truck' || kind === 'sport') {
    add(box(0.22, 0.11, 0.012, P.screen, { y: belt - 0.11, z: face - 0.065, mat: lit(P.screen), edge: false }));
  } else {
    // A radio: a display window and two knobs.
    add(box(0.2, 0.05, 0.012, P.screen, { y: belt - 0.11, z: face - 0.065, mat: lit(P.screen), edge: false }));
    for (const kx of [-0.08, 0.08]) add(cyl(0.018, 0.018, 0.02, C.chromeDark, { axis: 'z', x: kx, y: belt - 0.17, z: face - 0.07, seg: 8, edge: false }));
  }
  // The heater: three knobs, or a row of toggles.
  if (kind === 'exotic') {
    for (let k = 0; k < 5; k += 1) {
      add(box(0.018, 0.012, 0.04, C.chrome, { x: -0.09 + k * 0.045, y: belt - 0.25, z: face - 0.08, mat: lit(C.chrome), edge: false }));
      if (k === 2) add(box(0.04, 0.03, 0.03, P.accent, { y: belt - 0.25, z: face - 0.07, mat: lit(P.accent), edge: false }));
    }
  } else for (const kx of [-0.09, 0, 0.09]) add(cyl(0.025, 0.025, 0.025, P.dashHi, { axis: 'z', x: kx, y: belt - 0.26, z: face - 0.07, seg: 10, edge: false }));
  // The console between the seats, low, and the gear lever on it.
  const consoleW = kind === 'truck' ? 0.32 : 0.22;
  add(box(consoleW, 0.08, face - eye.z + 0.15, P.dashLow, { y: belt + 0.02, z: (face + eye.z - 0.15) / 2, edge: false }));
  add(box(consoleW - 0.04, 0.012, 0.3, P.dashHi, { y: belt + 0.065, z: face - 0.25, edge: false }));
  add(box(0.012, 0.013, 0.3, P.trim, { y: belt + 0.066, z: face - 0.25, edge: false }));
  if (kind === 'truck') for (const cx of [-0.07, 0.07]) add(cyl(0.04, 0.04, 0.02, C.outline, { x: cx, y: belt + 0.065, z: eye.z + 0.05, seg: 10, edge: false }));
  const lever = new THREE.Group();
  lever.position.set(0, belt + 0.06, face - 0.25);
  if (L.shifter === 'paddles') {
    // A paddle each side of the column, and a reverse toggle on the tunnel.
    add(box(0.06, 0.03, 0.03, P.accent, { y: belt + 0.08, z: face - 0.22, mat: lit(P.accent), edge: false }));
  } else {
    const tall = L.shifter === 'tall' ? 0.2 : L.shifter === 'short' ? 0.09 : 0.14;
    lever.add(box(0.02, tall, 0.02, C.chromeDark, { y: tall / 2, edge: false }));
    if (L.shifter === 'pistol') lever.add(box(0.035, 0.08, 0.06, P.rimHi, { y: tall + 0.02, z: -0.015, edge: false }));
    else lever.add(L.shifter === 'short' ? box(0.045, 0.045, 0.045, C.chrome, { y: tall + 0.02, mat: lit(C.chrome), edge: false }) : cyl(0.03, 0.03, 0.05, P.rimHi, { y: tall + 0.02, seg: 8, edge: false }));
    lever.add(box(0.08, 0.02, 0.08, P.dash, { y: 0.005, edge: false }));
    lever.rotation.x = -0.15;
    add(lever);
  }

  // ---- the instruments ----
  const cluster = new THREE.Group();
  cluster.position.set(x, belt + 0.02, zf0 - 0.36);
  cluster.rotation.x = 0.42;
  /** @param {number} dx @param {number} dy @param {number} r @param {number} ticks @param {number} red @param {boolean} [chrome] */
  const dial = (dx, dy, r, ticks, red, chrome = false) => {
    const faceM = new THREE.Mesh(new THREE.CircleGeometry(r, 20), new THREE.MeshBasicMaterial({ map: dialTexture(P, ticks, red), transparent: true }));
    faceM.position.set(dx, dy, -0.018);
    faceM.rotation.y = Math.PI;
    cluster.add(faceM);
    if (chrome) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.004, 0.007, 4, 18), lit(C.chrome));
      ring.position.set(dx, dy, -0.02);
      cluster.add(ring);
    }
    const pivot = new THREE.Group();
    pivot.position.set(dx, dy, -0.022);
    pivot.add(box(0.008, r * 0.82, 0.004, P.needle, { y: r * 0.4, mat: lit(P.needle), edge: false }));
    pivot.add(box(0.016, 0.016, 0.006, P.ink, { mat: lit(P.ink), edge: false }));
    cluster.add(pivot);
    return pivot;
  };
  /** @type {THREE.Group} */ let speedPivot;
  /** @type {THREE.Group|null} */ let rpmPivot = null;
  /** @type {THREE.Mesh[]} */ const bars = [];
  if (L.cluster === 'twin') {
    cluster.add(box(0.44, 0.17, 0.05, C.outline, { z: 0.01, mat: dbl(C.outline), edge: false }));
    cluster.add(box(0.46, 0.025, 0.09, P.dash, { y: 0.09, z: 0.02, edge: false }));
    speedPivot = dial(-0.105, 0, 0.076, 16, -1);
    rpmPivot = dial(0.105, 0, 0.076, 11, 9);
  } else if (L.cluster === 'triple') {
    cluster.add(box(0.48, 0.2, 0.05, C.outline, { z: 0.01, mat: dbl(C.outline), edge: false }));
    cluster.add(box(0.5, 0.025, 0.11, P.dashHi, { y: 0.105, z: 0.025, edge: false }));
    rpmPivot = dial(0, 0.005, 0.09, 10, 8);
    speedPivot = dial(-0.165, -0.02, 0.06, 12, -1);
    dial(0.165, -0.02, 0.06, 6, 5);
  } else if (L.cluster === 'row') {
    cluster.add(box(0.56, 0.15, 0.05, P.trim, { z: 0.01, mat: dbl(P.trim), edge: false }));
    dial(-0.21, 0, 0.055, 6, -1, true);
    rpmPivot = dial(-0.07, 0, 0.06, 8, 7, true);
    speedPivot = dial(0.07, 0, 0.06, 12, -1, true);
    dial(0.21, 0, 0.055, 6, 5, true);
  } else if (L.cluster === 'digital') {
    // A screen: a bar of lights across the top for the revs, a small dial for the speed.
    cluster.add(box(0.46, 0.17, 0.04, C.outline, { z: 0.01, mat: dbl(C.outline), edge: false }));
    cluster.add(box(0.42, 0.14, 0.006, P.screen, { z: -0.012, mat: lit(P.screen), edge: false }));
    for (let k = 0; k < 16; k += 1) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.022, 0.004), lit(C.glowOff));
      b.position.set(-0.17 + k * 0.0226, 0.045, -0.018);
      cluster.add(b);
      bars.push(b);
    }
    speedPivot = dial(0, -0.022, 0.045, 10, -1);
  } else {
    cluster.add(box(0.5, 0.22, 0.05, C.outline, { z: 0.01, mat: dbl(C.outline), edge: false }));
    cluster.add(box(0.52, 0.03, 0.1, P.dash, { y: 0.115, z: 0.02, edge: false }));
    speedPivot = dial(-0.11, 0.01, 0.085, 14, -1);
    rpmPivot = dial(0.11, 0.01, 0.085, 8, 7);
    dial(-0.21, -0.07, 0.03, 4, -1);
    dial(0.21, -0.07, 0.03, 4, 3);
  }
  /** @type {THREE.Mesh[]} */
  const lamps = [];
  for (let k = 0; k < 4; k += 1) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.01, 0.004), lit(C.lampOff));
    l.position.set(-0.04 + k * 0.027, -0.08, -0.021);
    cluster.add(l);
    lamps.push(l);
  }
  add(cluster);

  // ---- the steering column and wheel ----
  const column = box(0.07, 0.07, 0.24, P.dashLow, { x, y: wheelAt.y - 0.05, z: zf0 - 0.42, edge: false });
  column.rotation.x = 0.55;
  add(column);
  const pivot = new THREE.Group();
  pivot.position.copy(wheelAt);
  pivot.rotation.x = TILT;
  const spin = new THREE.Group();
  pivot.add(spin);
  const thick = L.wheel === 'horn' ? 0.014 : L.wheel === 'four' && kind === 'truck' ? 0.028 : 0.024;
  spin.add(new THREE.Mesh(new THREE.TorusGeometry(R, thick, 6, 18), toon(P.rim)));
  const spoke = (/** @type {number} */ ang, /** @type {number} */ w) => {
    const len = R - 0.04;
    const m = box(w, len, 0.025, P.rim, { edge: false });
    m.position.set(Math.sin(ang) * (len / 2 + 0.03), Math.cos(ang) * (len / 2 + 0.03), 0);
    m.rotation.z = -ang;
    spin.add(m);
  };
  if (L.wheel === 'four') {
    for (const a of [Math.PI / 2 + 0.25, -Math.PI / 2 - 0.25, Math.PI - 0.5, Math.PI + 0.5]) spoke(a, 0.045);
    spin.add(box(0.13, 0.1, 0.05, P.rimHi, { z: -0.01, edge: false }));
    spin.add(box(0.05, 0.02, 0.01, P.accent, { z: -0.04, edge: false }));
  } else if (L.wheel === 'three') {
    for (const a of [Math.PI / 2, -Math.PI / 2, Math.PI]) spoke(a, 0.045);
    spin.add(cyl(0.05, 0.055, 0.06, P.rimHi, { axis: 'z', z: -0.01, seg: 10, edge: false }));
    spin.add(box(0.03, 0.026, 0.03, P.accent, { y: R, mat: lit(P.accent), edge: false }));
  } else if (L.wheel === 'horn') {
    for (const a of [Math.PI / 2, -Math.PI / 2, Math.PI]) spoke(a, 0.016);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 0.55, 0.008, 4, 18), lit(C.chrome));
    ring.position.z = -0.012;
    spin.add(ring);
    spin.add(cyl(0.045, 0.045, 0.04, C.chromeDark, { axis: 'z', z: -0.01, seg: 10, edge: false }));
  } else {
    // Flat-bottomed: a bar across the bottom of the rim, buttons on the spokes, a red top marker.
    for (const a of [Math.PI / 2, -Math.PI / 2, Math.PI]) spoke(a, 0.05);
    spin.add(box(R * 1.3, 0.04, 0.035, P.rim, { y: -R * 0.82, edge: false }));
    for (const bx of [-0.07, 0.07]) spin.add(box(0.025, 0.025, 0.01, P.accent, { x: bx, y: 0.01, z: -0.02, mat: lit(P.accent), edge: false }));
    spin.add(box(0.03, 0.03, 0.03, P.accent, { y: R, mat: lit(P.accent), edge: false }));
    spin.add(cyl(0.045, 0.05, 0.05, P.rimHi, { axis: 'z', z: -0.01, seg: 8, edge: false }));
  }
  if (L.shifter === 'paddles') for (const s of [-1, 1]) pivot.add(box(0.06, 0.09, 0.012, C.chromeDark, { x: s * (R * 0.75), y: 0.02, z: 0.04, edge: false }));
  add(pivot);

  // ---- the driver's arms: shoulder, elbow, wrist; hands gripping the rim at ten and two ----
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
    add(upper, fore, elbow, cuff);
    return { side, hand, upper, fore, elbow, cuff };
  });
  const shoulder = (/** @type {number} */ side) => new THREE.Vector3(x + side * 0.2, eye.y - 0.3, eye.z - 0.08);
  /** Where a hand sits round the rim, radians from the top: it turns with the rim, within its side. */
  const grip = (/** @type {number} */ side, /** @type {number} */ wheel) => {
    // Turning past where the hand can follow, it lets go and takes a fresh hold back at the
    // other end of its side: over a turn and more of lock, the hands feed the rim round.
    const lo = 0.25;
    const span = 2.15;
    const u = (((1.0 - side * wheel - lo) % span) + span) % span;
    return side * (lo + u);
  };
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

  const sweep = (/** @type {number} */ v) => -((-135 + Math.max(0, Math.min(1.05, v)) * 270) * Math.PI) / 180;
  const api = {
    group,
    /** Which cabin this is. */
    kind,
    /** Where the driver's eyes are, car-local: the first-person camera goes here. */
    eye,
    /** How far below level the driver looks, radians. */
    pitch,
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
        const pole = new THREE.Vector3(h.side * 0.45, -1, 0).addScaledVector(to, -new THREE.Vector3(h.side * 0.45, -1, 0).dot(to)).normalize();
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
      speedPivot.rotation.z = sweep(speed);
      if (rpmPivot) rpmPivot.rotation.z = sweep(rpm);
      const litBars = Math.round(Math.max(0, Math.min(1, rpm)) * bars.length);
      bars.forEach((b, i) => {
        const col = i >= litBars ? C.glowOff : i >= bars.length - 3 ? P.needle : i >= bars.length - 6 ? C.lampOn : P.ink;
        /** @type {THREE.MeshBasicMaterial} */ (b.material).color.set(col);
      });
      lamps.forEach((l, i) => { /** @type {THREE.MeshBasicMaterial} */ (l.material).color.set(on[i] ? (i > 1 ? C.lampBad : C.lampOn) : C.lampOff); });
    },
  };
  api.setWheel(0);
  return api;
}
