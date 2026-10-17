/**
 * A car: eleven body shapes, wheel styles, paint, stripes, wings, and an engine bay that
 * shows what is actually fitted. Faces +z, sits on y = 0.
 *
 * The same builder draws a customer's hatchback on the lift with its bonnet up, the
 * player's own project car on the road, and a rival's car on the strip. Anything that is
 * a REAL hardware choice (a turbo, an intercooler, a supercharger, the cylinder layout,
 * a bigger exhaust) is drawn from the build, so opening the bonnet is a way to read the
 * car the way a tuner would.
 */

import { world as W } from '../../tokens.js';
import { THREE, box, cyl, edged, glow, loftMesh, profileMesh, sign, toon } from '../gfx.js';

/**
 * Body shapes. Dimensions in metres; z is along the car, front positive. `belt` is the
 * height of the shoulder line, `top` the roof, `nose` the front edge of the bonnet, `tail`
 * the rear deck. `cab` is the glasshouse: [rear base, front base, rear top, front top].
 */
export const BODY_STYLES = {
  coupe: { label: 'Coupe', len: 4.35, wid: 1.82, belt: 0.88, top: 1.27, nose: 0.74, tail: 0.84, wr: 0.33, cab: [-1.15, 0.5, -0.7, 0.05], hood: 0.55 },
  sedan: { label: 'Sedan', len: 4.75, wid: 1.82, belt: 0.92, top: 1.42, nose: 0.78, tail: 0.9, wr: 0.33, cab: [-1.5, 0.8, -1.05, 0.25], hood: 0.7 },
  hatch: { label: 'Hatchback', len: 4.0, wid: 1.76, belt: 0.9, top: 1.42, nose: 0.76, tail: 0.98, wr: 0.31, cab: [-1.85, 0.6, -1.5, 0.15], hood: 0.5 },
  wagon: { label: 'Wagon', len: 4.8, wid: 1.82, belt: 0.92, top: 1.46, nose: 0.78, tail: 1.0, wr: 0.33, cab: [-2.2, 0.75, -2.0, 0.2], hood: 0.7 },
  muscle: { label: 'Muscle car', len: 4.85, wid: 1.92, belt: 0.92, top: 1.32, nose: 0.82, tail: 0.92, wr: 0.35, cab: [-1.1, 0.2, -0.75, -0.25], hood: 1.1 },
  supercar: { label: 'Supercar', len: 4.5, wid: 1.98, belt: 0.78, top: 1.13, nose: 0.62, tail: 0.86, wr: 0.34, cab: [-0.7, 0.75, -0.4, 0.35], hood: 0.45 },
  suv: { label: 'SUV', len: 4.65, wid: 1.9, belt: 1.12, top: 1.72, nose: 1.0, tail: 1.2, wr: 0.39, cab: [-2.15, 0.9, -1.95, 0.4], hood: 0.7, lift: 0.1 },
  pickup: { label: 'Pickup', len: 5.3, wid: 1.95, belt: 1.12, top: 1.75, nose: 1.0, tail: 1.1, wr: 0.4, cab: [-0.5, 1.0, -0.35, 0.5], hood: 0.75, lift: 0.12, bed: true },
  van: { label: 'Van', len: 4.9, wid: 1.9, belt: 1.12, top: 1.95, nose: 0.95, tail: 1.9, wr: 0.36, cab: [-2.3, 1.3, -2.3, 0.95], hood: 0.35, lift: 0.08 },
  kei: { label: 'Kei car', len: 3.4, wid: 1.48, belt: 0.82, top: 1.58, nose: 0.74, tail: 1.0, wr: 0.27, cab: [-1.45, 0.55, -1.3, 0.2], hood: 0.35 },
  roadster: { label: 'Roadster', len: 3.95, wid: 1.74, belt: 0.82, top: 1.14, nose: 0.68, tail: 0.8, wr: 0.31, cab: [-0.55, 0.35, -0.5, 0.12], hood: 0.6, open: true },
};

/** Wheel designs. */
export const WHEEL_STYLES = {
  steel: { label: 'Steel', spokes: 0, dish: 0.62 },
  alloy5: { label: '5-spoke alloy', spokes: 5, dish: 0.7 },
  mesh: { label: 'Mesh', spokes: 12, dish: 0.74 },
  deep: { label: 'Deep dish', spokes: 6, dish: 0.8 },
  race: { label: 'Race 6-spoke', spokes: 6, dish: 0.72 },
  slick: { label: 'Slicks', spokes: 5, dish: 0.58 },
};

/**
 * @typedef {object} CarSpec
 * @property {keyof typeof BODY_STYLES} [body]
 * @property {string} [color] a `world.paint` key
 * @property {keyof typeof WHEEL_STYLES} [wheels]
 * @property {string} [wheelColor] a `world.paint` key or 'chrome'/'black'
 * @property {string|null} [stripes] a `world.paint` key for racing stripes
 * @property {'none'|'lip'|'wing'|'gt'} [spoiler]
 * @property {boolean} [scoop]
 * @property {number} [lowered] 0..1
 * @property {boolean} [wide]
 * @property {'single'|'dual'|'big'} [exhaust]
 * @property {string|null} [underglow] a `world` neon key
 * @property {string} [plate]
 * @property {EngineBay} [engine]
 */

/**
 * @typedef {object} EngineBay
 * @property {'I4'|'I6'|'V6'|'V8'|'flat'} [layout]
 * @property {boolean} [turbo]
 * @property {boolean} [supercharger]
 * @property {boolean} [intercooler]
 * @property {boolean} [intake] an aftermarket intake
 * @property {boolean} [nitrous]
 * @property {string} [block] a `world` key for the engine casting
 */

const paintOf = (k) => W.paint[k] ?? W.paint.silver;

/** The engine bay, lying between the fenders. @param {EngineBay} e @param {number} width @param {number} len */
function makeEngineBay(e, width, len) {
  const g = new THREE.Group();
  const cast = e.block ? W[e.block] : W.metalDark;
  const layout = e.layout ?? 'V6';
  const bw = Math.min(width - 0.35, 1.0);
  g.add(box(bw + 0.1, 0.03, len, W.black, { y: 0.015, edge: false }));
  // The block and heads.
  if (layout === 'V6' || layout === 'V8') {
    g.add(box(0.5, 0.26, len * 0.62, cast, { y: 0.15, edge: false }));
    for (const s of [-1, 1]) {
      const head = box(0.22, 0.14, len * 0.6, W.metalLight, { x: s * 0.26, y: 0.3, z: 0, edge: false });
      head.rotation.z = -s * 0.5;
      g.add(head);
    }
    g.add(box(0.34, 0.1, len * 0.52, W.metal, { y: 0.34, edge: true }));
  } else if (layout === 'flat') {
    g.add(box(0.36, 0.22, len * 0.55, cast, { y: 0.12, edge: false }));
    for (const s of [-1, 1]) g.add(box(0.26, 0.2, len * 0.5, W.metalLight, { x: s * 0.32, y: 0.12, edge: false }));
  } else {
    g.add(box(0.36, 0.34, len * (layout === 'I6' ? 0.7 : 0.5), cast, { y: 0.17, edge: false }));
    g.add(box(0.34, 0.1, len * (layout === 'I6' ? 0.66 : 0.46), W.metalLight, { y: 0.39, edge: false }));
  }
  // Coloured fluid bottles and the battery, always there.
  g.add(box(0.14, 0.12, 0.1, W.toolYellow, { x: bw / 2 + 0.05 - 0.3, y: 0.12, z: len / 2 - 0.15, edge: false }));
  g.add(box(0.22, 0.18, 0.14, W.black, { x: -(bw / 2 - 0.1), y: 0.1, z: len / 2 - 0.2, edge: false }));
  // Intake: stock airbox or an aftermarket pipe with a cone filter.
  if (e.intake) {
    g.add(cyl(0.05, 0.05, 0.4, W.neonCyan, { axis: 'z', x: bw / 2 - 0.1, y: 0.28, z: len / 2 - 0.35, edge: false }));
    g.add(cyl(0.11, 0.07, 0.2, W.neonAmber, { axis: 'z', x: bw / 2 - 0.1, y: 0.28, z: len / 2 - 0.1, edge: false }));
  } else {
    g.add(box(0.3, 0.14, 0.34, W.rubber, { x: bw / 2 - 0.16, y: 0.12, z: len / 2 - 0.3, edge: false }));
  }
  if (e.turbo) {
    g.add(cyl(0.14, 0.14, 0.16, W.cone, { axis: 'x', x: -0.24, y: 0.2, z: -len * 0.22, edge: true }));
    g.add(cyl(0.12, 0.12, 0.16, W.neonCyan, { axis: 'x', x: -0.4, y: 0.2, z: -len * 0.22, edge: true }));
    g.add(cyl(0.035, 0.035, 0.5, W.rim, { axis: 'z', x: -0.4, y: 0.2, z: -len * 0.06, edge: false }));
  }
  if (e.supercharger) {
    g.add(box(0.36, 0.2, 0.38, W.metalLight, { y: 0.48, edge: true }));
    g.add(cyl(0.12, 0.12, 0.04, W.toolRed, { axis: 'z', y: 0.48, z: len * 0.22, edge: false }));
  }
  if (e.nitrous) g.add(cyl(0.06, 0.06, 0.3, W.neonAmber, { x: -bw / 2 + 0.05, y: 0.18, z: len / 2 - 0.4, edge: false }));
  return g;
}

/**
 * @param {CarSpec} spec
 */
export function makeCar(spec = {}) {
  const S = BODY_STYLES[spec.body ?? 'coupe'] ?? BODY_STYLES.coupe;
  const paint = paintOf(spec.color ?? 'silver');
  const paintMat = toon(paint);
  const wide = spec.wide ? 0.12 : 0;
  const L = S.len;
  const Wd = S.wid + wide;
  const lift = S.lift ?? 0;
  const drop = (spec.lowered ?? 0) * 0.07;
  const y0 = 0.2 + lift - drop;
  const wr = S.wr;
  const wheelbase = L * 0.6;
  const rig = { group: new THREE.Group(), spec, dims: { len: L, wid: Wd, height: S.top + lift - drop, wheelbase, wheelR: wr } };
  const car = rig.group;
  car.userData.kind = 'car';

  // ---- body ----
  const hoodZ0 = S.cab[1];
  const nz = L / 2;
  // In the bonnet region the body is a low tray; the fenders and the bonnet are separate
  // pieces so the bonnet can open on a real engine bay.
  const hoodTopFront = S.nose + lift - drop - 0.05;
  const hoodTopRear = S.belt + lift - drop + 0.01;
  const trayY = hoodTopFront - 0.3;
  const trayPts = [
    [-nz, y0 + 0.06], [-nz, S.tail + lift - drop - 0.02], [-nz + 0.3, S.tail + lift - drop], [S.cab[0], S.belt + lift - drop],
    [hoodZ0, S.belt + lift - drop], [hoodZ0, trayY], [nz - 0.1, trayY], [nz, trayY - 0.04], [nz, y0 + 0.1], [nz - 0.1, y0], [-nz + 0.1, y0],
  ];
  const body = profileMesh(trayPts, Wd, paint);
  body.material = paintMat;
  car.add(body);

  // Fenders either side of the bay, the nose panel, and the cowl.
  const hoodLen = nz - hoodZ0;
  for (const sd of [-1, 1]) {
    const f = profileMesh([[hoodZ0, trayY], [nz, trayY], [nz, hoodTopFront - 0.03], [hoodZ0, hoodTopRear - 0.03]], 0.13, paint);
    f.material = paintMat;
    f.position.x = sd * (Wd / 2 - 0.065);
    car.add(f);
  }
  car.add(box(Wd - 0.04, hoodTopFront - trayY, 0.1, paint, { y: (hoodTopFront + trayY) / 2 - 0.03, z: nz - 0.06, mat: paintMat }));
  // The bonnet: hinged at the cowl.
  const hoodHinge = new THREE.Group();
  hoodHinge.position.set(0, hoodTopRear, hoodZ0);
  const slab = loftMesh({ y: -0.05, z0: 0, z1: hoodLen, w: Wd - 0.02 }, { y: 0, z0: 0, z1: hoodLen - 0.04, w: Wd - 0.1 }, paint, { mat: paintMat });
  slab.position.y = 0;
  const slopeDrop = hoodTopRear - hoodTopFront;
  slab.rotation.x = Math.atan2(slopeDrop, hoodLen);
  hoodHinge.add(slab);
  if (spec.scoop) {
    const sc = box(0.5, 0.1, hoodLen * 0.4, W.black, { y: 0.04, z: hoodLen * 0.4, edge: false });
    sc.rotation.x = slab.rotation.x;
    hoodHinge.add(sc);
  }
  if (spec.stripes) {
    const st = loftMesh({ y: 0.002, z0: 0.01, z1: hoodLen, w: 0.34 }, { y: 0.004, z0: 0.01, z1: hoodLen - 0.04, w: 0.3 }, paintOf(spec.stripes), { edge: false });
    st.rotation.x = slab.rotation.x;
    hoodHinge.add(st);
  }
  car.add(hoodHinge);
  const bayGroup = new THREE.Group();
  bayGroup.position.set(0, trayY, (nz + hoodZ0) / 2);
  const bay = makeEngineBay(spec.engine ?? {}, Wd - 0.26, hoodLen - 0.2);
  bay.scale.y = 0.5;
  bayGroup.add(bay);
  car.add(bayGroup);

  // ---- greenhouse ----
  const zr0 = S.cab[0];
  const zf0 = S.cab[1];
  const zr1 = S.cab[2];
  const zf1 = S.cab[3];
  const belt = S.belt + lift - drop;
  const top = S.top + lift - drop;
  const gw0 = Wd * 0.94;
  const gw1 = Wd * 0.8;
  if (!S.open) {
    car.add(loftMesh({ y: belt, z0: zr0, z1: zf0, w: gw0 }, { y: top - 0.04, z0: zr1, z1: zf1, w: gw1 }, W.glassDark, { mat: toon(W.glassDark, { opacity: 0.9 }) }));
    car.add(loftMesh({ y: top - 0.045, z0: zr1 - 0.08, z1: zf1 + 0.04, w: gw1 + 0.04 }, { y: top, z0: zr1 - 0.06, z1: zf1 + 0.02, w: gw1 + 0.02 }, paint, { mat: paintMat }));
    // Pillars: body-coloured cross-slabs that tie the roof to the shoulder line, so the
    // roof reads as part of the car rather than a lid floating over a hole.
    const slab = (f0, f1, w) => {
      const lerp = (a, b, t) => a + (b - a) * t;
      return loftMesh(
        { y: belt, z0: lerp(zr0, zf0, f0), z1: lerp(zr0, zf0, f1), w: gw0 + 0.01 },
        { y: top - 0.04, z0: lerp(zr1, zf1, f0), z1: lerp(zr1, zf1, f0 + w), w: gw1 + 0.01 },
        paint, { mat: paintMat, edge: false },
      );
    };
    car.add(slab(0.93, 1.0, 0.07), slab(0.47, 0.53, 0.06), slab(0.0, 0.07, 0.07));
  } else {
    // A roadster has no roof: a windscreen, a roll hoop and a hump behind the seats.
    car.add(box(Wd * 0.8, 0.28, 0.05, W.glass, { y: belt + 0.14, z: zf1, mat: toon(W.glass, { opacity: 0.55 }), edge: false }));
    car.add(box(Wd * 0.5, 0.14, 0.25, paint, { y: belt + 0.07, z: zr0 - 0.1, mat: paintMat }));
  }
  if (spec.stripes && !S.open) {
    car.add(loftMesh({ y: top + 0.002, z0: zr1 - 0.06, z1: zf1 + 0.02, w: 0.34 }, { y: top + 0.004, z0: zr1 - 0.06, z1: zf1 + 0.02, w: 0.3 }, paintOf(spec.stripes), { edge: false }));
  }
  // Interior: seats, dash, wheel, and the driver's head is the person's own.
  const seatY = belt - 0.2;
  for (const s of [-1, 1]) car.add(box(0.42, 0.5, 0.12, W.wallBlack, { x: s * 0.4, y: seatY + 0.2, z: (zr0 + zf0) / 2 - 0.15, edge: false }));
  for (const s of [-1, 1]) car.add(box(0.42, 0.1, 0.45, W.wallBlack, { x: s * 0.4, y: seatY, z: (zr0 + zf0) / 2 + 0.05, edge: false }));
  const dash = box(Wd * 0.8, 0.14, 0.18, W.wallBlack, { y: belt - 0.05, z: zf0 - 0.2, edge: false });
  car.add(dash);
  const wheel = cyl(0.14, 0.14, 0.03, W.black, { axis: 'z', x: 0.4, y: belt + 0.05, z: zf0 - 0.45, edge: false, seg: 12 });
  wheel.rotation.x = -0.9;
  car.add(wheel);
  rig.seat = new THREE.Vector3(0.4, seatY + 0.22, (zr0 + zf0) / 2 + 0.1);

  // ---- lights and trim ----
  const headMat = glow(W.headlight);
  const tailMat = glow(W.taillight);
  const lights = [];
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.05), headMat);
    h.position.set(s * (Wd / 2 - 0.3), S.nose + lift - drop - 0.2, nz + 0.01);
    car.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.05), tailMat);
    t.position.set(s * (Wd / 2 - 0.28), S.tail + lift - drop - 0.12, -nz - 0.01);
    car.add(t);
    lights.push(t);
    car.add(box(0.12, 0.05, 0.05, W.indicator, { x: s * (Wd / 2 - 0.08), y: S.nose + lift - drop - 0.28, z: nz + 0.005, edge: false }));
  }
  car.add(box(Wd * 0.5, 0.1, 0.04, W.black, { y: S.nose + lift - drop - 0.32, z: nz + 0.015, edge: false })); // grille
  car.add(box(Wd - 0.04, 0.12, 0.2, W.black, { y: y0 + 0.1, z: nz - 0.05, edge: false })); // bumper lip
  car.add(box(Wd - 0.04, 0.1, 0.16, W.black, { y: y0 + 0.1, z: -nz + 0.05, edge: false }));
  // Number plates.
  const plate = sign(spec.plate ?? 'ECU LAB', { w: 0.5, h: 0.12, bg: W.plate, fg: W.black });
  plate.position.set(0, y0 + 0.28, -nz - 0.035);
  plate.rotation.y = Math.PI;
  car.add(plate);
  const platef = sign(spec.plate ?? 'ECU LAB', { w: 0.5, h: 0.12, bg: W.plate, fg: W.black });
  platef.position.set(0, y0 + 0.22, nz + 0.07);
  car.add(platef);
  // Exhaust tips.
  const ex = spec.exhaust ?? 'single';
  const tipR = ex === 'big' ? 0.07 : 0.045;
  const tips = ex === 'single' ? [0.5] : ex === 'dual' ? [-0.5, 0.5] : [-0.55, 0.55];
  for (const x of tips) car.add(cyl(tipR, tipR, 0.1, W.metalLight, { axis: 'z', x: x * (Wd / 2) * 1.1, y: y0 + 0.08, z: -nz - 0.04, edge: false }));
  // Mirrors.
  for (const s of [-1, 1]) car.add(box(0.14, 0.09, 0.07, paint, { x: s * (gw0 / 2 + 0.08), y: belt + 0.12, z: zf0 - 0.06, mat: paintMat, edge: false }));

  // ---- spoiler ----
  const sp = spec.spoiler ?? 'none';
  if (sp === 'lip') car.add(box(Wd * 0.8, 0.04, 0.12, paint, { y: S.tail + lift - drop + 0.03, z: -nz + 0.1, mat: paintMat, edge: false }));
  if (sp === 'wing' || sp === 'gt') {
    const h = sp === 'gt' ? 0.34 : 0.22;
    const zz = -nz + 0.2;
    for (const s of [-1, 1]) car.add(box(0.05, h, 0.12, W.black, { x: s * Wd * 0.3, y: S.tail + lift - drop + h / 2, z: zz, edge: false }));
    car.add(box(Wd * (sp === 'gt' ? 0.98 : 0.8), 0.04, 0.34, sp === 'gt' ? W.black : paint, { y: S.tail + lift - drop + h + 0.02, z: zz, mat: sp === 'gt' ? undefined : paintMat }));
    car.add(box(0.04, 0.12, 0.34, W.black, { x: Wd * (sp === 'gt' ? 0.49 : 0.4), y: S.tail + lift - drop + h + 0.04, z: zz, edge: false }));
    car.add(box(0.04, 0.12, 0.34, W.black, { x: -Wd * (sp === 'gt' ? 0.49 : 0.4), y: S.tail + lift - drop + h + 0.04, z: zz, edge: false }));
  }
  // A pickup's bed is an open box; a van is slab-sided.
  if (S.bed) {
    const bedZ = (zr0 - nz) / 2 - 0.1;
    car.add(box(Wd - 0.1, 0.05, zr0 + nz - 0.2, W.black, { y: belt - 0.02, z: bedZ, edge: false }));
    for (const s of [-1, 1]) car.add(box(0.06, 0.28, zr0 + nz - 0.1, paint, { x: s * (Wd / 2 - 0.05), y: belt + 0.12, z: bedZ, mat: paintMat }));
    car.add(box(Wd - 0.04, 0.28, 0.06, paint, { y: belt + 0.12, z: -nz + 0.03, mat: paintMat }));
    car.add(box(Wd - 0.04, 0.3, 0.06, paint, { y: belt + 0.14, z: zr0 - 0.04, mat: paintMat }));
  }

  // ---- wheels ----
  const wstyle = WHEEL_STYLES[spec.wheels ?? 'alloy5'] ?? WHEEL_STYLES.alloy5;
  const rimCol = spec.wheelColor === 'black' ? W.black : spec.wheelColor && W.paint[spec.wheelColor] ? W.paint[spec.wheelColor] : W.rim;
  const tw = (spec.wheels === 'slick' ? 0.3 : 0.24) + wide * 0.4;
  const wheels = [];
  const track = Wd - tw + 0.04;
  const spokeGeom = new THREE.BoxGeometry(0.03, wr * 0.85, 0.04);
  for (const [sx, sz, front] of [[1, 1, true], [-1, 1, true], [1, -1, false], [-1, -1, false]]) {
    const hub = new THREE.Group();
    hub.position.set(sx * track / 2, wr, sz * wheelbase / 2 - (S.cab[1] > 0.9 ? 0 : 0));
    const steer = new THREE.Group();
    const spin = new THREE.Group();
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(wr, wr, tw, 14).rotateZ(Math.PI / 2), toon(W.tyre));
    tyre.castShadow = true;
    edged(tyre, 60);
    spin.add(tyre);
    const out = sx * (tw / 2 + 0.002);
    const face = new THREE.Mesh(new THREE.CylinderGeometry(wr * wstyle.dish, wr * wstyle.dish, 0.03, 14).rotateZ(Math.PI / 2), toon(rimCol));
    face.position.x = out;
    spin.add(face);
    const lip = new THREE.Mesh(new THREE.CylinderGeometry(wr * (wstyle.dish + 0.1), wr * (wstyle.dish + 0.1), 0.02, 14).rotateZ(Math.PI / 2), toon(W.tyreWall));
    lip.position.x = out - sx * 0.01;
    spin.add(lip);
    if (wstyle.spokes) {
      for (let i = 0; i < wstyle.spokes; i += 1) {
        const sp2 = new THREE.Mesh(spokeGeom, toon(spec.wheels === 'race' ? W.paint.gold : W.rimDark));
        sp2.position.x = out + sx * 0.02;
        const pivot = new THREE.Group();
        pivot.rotation.x = (i / wstyle.spokes) * Math.PI * 2;
        sp2.position.y = wr * 0.45;
        pivot.add(sp2);
        pivot.position.x = 0;
        spin.add(pivot);
      }
    } else {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(wr * 0.2, wr * 0.2, 0.05, 8).rotateZ(Math.PI / 2), toon(W.metalLight));
      cap.position.x = out + sx * 0.02;
      spin.add(cap);
    }
    // Brake disc and a coloured caliper that does not turn with the wheel.
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(wr * 0.5, wr * 0.5, 0.025, 12).rotateZ(Math.PI / 2), toon(W.brake));
    disc.position.x = -sx * (tw / 2 - 0.05);
    spin.add(disc);
    steer.add(spin);
    steer.add(box(0.05, wr * 0.35, wr * 0.55, W.toolRed, { x: sx * (tw / 2 - 0.1), y: wr * 0.35, z: 0, edge: false }));
    hub.add(steer);
    car.add(hub);
    wheels.push({ hub, steer, spin, front });
    // Wheel-arch shadow disc on the bodywork.
    const arch = new THREE.Mesh(new THREE.CylinderGeometry(wr * 1.18, wr * 1.18, 0.02, 14).rotateZ(Math.PI / 2), toon(W.black));
    arch.position.set(sx * (Wd / 2 + 0.003), wr, sz * wheelbase / 2);
    car.add(arch);
  }
  rig.wheels = wheels;

  // ---- underglow ----
  if (spec.underglow) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(Wd * 1.3, L * 0.95), glow(W[spec.underglow] ?? W.neonCyan, 0.4));
    g.rotation.x = -Math.PI / 2;
    g.position.y = 0.03;
    car.add(g);
    rig.underglow = g;
  }

  // ---- animation and state ----
  let hoodOpen = 0;
  let hoodTarget = 0;
  rig.setHood = (open) => { hoodTarget = open ? 1 : 0; };
  rig.hoodOpen = () => hoodTarget === 1;
  let brake = false;
  rig.setBrake = (on) => {
    if (on === brake) return;
    brake = on;
    for (const l of lights) l.scale.set(on ? 1.5 : 1, on ? 1.5 : 1, 1);
  };
  /** @param {number} angle front-wheel steering angle, radians */
  rig.steer = (angle) => { for (const w of wheels) if (w.front) w.steer.rotation.y = angle; };
  /** @param {number} distance metres rolled since last call */
  rig.roll = (distance) => { for (const w of wheels) w.spin.rotation.x += distance / wr; };
  rig.update = (dt) => {
    hoodOpen += (hoodTarget - hoodOpen) * Math.min(1, dt * 5);
    hoodHinge.rotation.x = -hoodOpen * 1.0;
  };
  rig.hoodHinge = hoodHinge;

  car.traverse((o) => { const m = /** @type {THREE.Mesh} */ (o); if (m.isMesh) { m.castShadow = true; } });
  void sign;
  return rig;
}

/**
 * The spec a build implies: the bits of the car that are real hardware.
 * @param {object} build the store's `build` slice
 * @returns {EngineBay}
 */
export function engineBayOf(build) {
  const cfg = String(build?.engineConfig?.configuration ?? 'V6');
  const layout = ['I4', 'I6', 'V6', 'V8'].includes(cfg) ? cfg : 'V6';
  const m = build?.mods ?? {};
  return {
    layout,
    turbo: !!build?.turboOn,
    supercharger: !build?.turboOn && !!build?.blowerId,
    intercooler: !!m.intercooler,
    intake: !!m.intake,
    nitrous: !!build?.nitrous,
  };
}
