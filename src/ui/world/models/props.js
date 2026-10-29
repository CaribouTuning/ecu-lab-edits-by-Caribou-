/**
 * Things in a garage, a street and a showroom: lifts, a dyno, desks, shelves, signs,
 * trees. Each is a small group of boxes at metre scale, origin on the floor at its middle.
 */

import { world as W } from '../../tokens.js';
import { THREE, ball, box, cone, cyl, edged, glow, pixelTexture, rbox, sign, strut, toon, tyreGeometry } from '../gfx.js';
import { bakeSheet, spriteCard, tone } from './sprite.js';

const G = () => new THREE.Group();

/**
 * A two-post lift, as one is bolted to a shop floor: two posts either side of the car on
 * base plates, an overhead bar between their tops carrying the hydraulic line and the
 * shut-off bar, the power unit on one post. On each post a carriage rides up and down,
 * and from it two swing arms reach in under the car's sills to its lifting points, each
 * ending in a screw-up pad. Posts across x, the car along z.
 */
export function makeLift() {
  const g = G();
  g.userData.dynamic = true;
  // Posts' centres either side: about three metres between their inner faces, as a
  // symmetric lift is set out for a car with its doors open.
  const gap = 1.62;
  const post = W.engine.stand;
  const H = 3.4;
  for (const s of [-1, 1]) {
    const x = s * gap;
    g.add(box(0.52, 0.025, 0.44, W.metalDark, { x, y: 0.0125 }));
    for (const [bx, bz] of [[-0.2, -0.16], [0.2, -0.16], [-0.2, 0.16], [0.2, 0.16]]) g.add(cyl(0.014, 0.014, 0.03, W.metalLight, { x: x + bx, y: 0.035, z: bz, seg: 6, edge: false }));
    // The post: a folded channel, its open side toward the car with the carriage's slot in it.
    g.add(box(0.26, H, 0.3, post, { x, y: 0.025 + H / 2 }));
    g.add(box(0.02, H - 0.3, 0.13, W.black, { x: x - s * 0.131, y: 0.2 + (H - 0.3) / 2, edge: false, cast: false }));
    g.add(box(0.3, 0.05, 0.34, post, { x, y: H + 0.05 }));
    // A rubber guard on the post's corner at door height.
    g.add(box(0.03, 0.9, 0.05, W.rubber, { x: x - s * 0.13, y: 1.15, z: 0.16, edge: false }));
    // The extension up to the overhead bar.
    g.add(box(0.14, 0.62, 0.16, post, { x, y: H + 0.38 }));
  }
  // Overhead: the bar, the padded shut-off bar under it (it stops the lift if a roof touches it), the line.
  g.add(box(gap * 2 + 0.14, 0.12, 0.16, post, { y: H + 0.74 }));
  g.add(cyl(0.025, 0.025, gap * 2 - 0.5, W.rubber, { axis: 'x', y: H + 0.56, z: 0.04, edge: false }));
  for (const s of [-1, 1]) g.add(box(0.02, 0.12, 0.02, W.metalDark, { x: s * (gap - 0.3), y: H + 0.62, z: 0.04, edge: false }));
  g.add(strut([gap + 0.14, 1.5, -0.12], [gap + 0.14, H + 0.66, -0.12], 0.018, 0.018, W.black, { round: true }));
  g.add(strut([gap + 0.14, H + 0.66, -0.12], [-gap, H + 0.66, -0.1], 0.018, 0.018, W.black, { round: true }));
  // The power unit on the outside of one post: motor, pump, the reservoir under them.
  const pu = G();
  pu.position.set(gap + 0.2, 1.1, 0);
  pu.add(box(0.03, 0.5, 0.26, W.metalDark));
  pu.add(cyl(0.085, 0.085, 0.3, W.black, { x: 0.1, y: 0.22, seg: 14 }));
  pu.add(box(0.14, 0.08, 0.14, W.metalDark, { x: 0.1, y: 0.03 }));
  pu.add(box(0.14, 0.24, 0.16, W.plaster, { x: 0.1, y: -0.14 }));
  pu.add(box(0.05, 0.05, 0.03, W.black, { x: 0.1, y: 0.06, z: 0.09, edge: false }));
  g.add(pu);

  const carriage = G();
  for (const s of [-1, 1]) {
    const cx = s * (gap - 0.25);
    carriage.add(box(0.22, 0.82, 0.3, post, { x: cx, y: 0.41 }));
    // Two swing arms off the carriage foot, telescoping in to the car's lifting points just
    // inboard of its wheels; a pad on a screw at each end, wound up to the sill.
    for (const z of [-1, 1]) {
      const pivot = [cx - s * 0.08, 0.06, z * 0.12];
      const pad = [s * 0.62, 0.06, z * 0.92];
      const mid = [pivot[0] + (pad[0] - pivot[0]) * 0.62, 0.06, pivot[2] + (pad[2] - pivot[2]) * 0.62];
      carriage.add(cyl(0.05, 0.05, 0.12, W.metalDark, { ...{ x: pivot[0], y: 0.06, z: pivot[2] }, seg: 10, edge: false }));
      carriage.add(strut(/** @type {any} */ (pivot), /** @type {any} */ (mid), 0.11, 0.08, W.toolYellow));
      carriage.add(strut(/** @type {any} */ (mid), /** @type {any} */ (pad), 0.08, 0.06, W.toolYellow));
      carriage.add(cyl(0.07, 0.07, 0.04, W.metalDark, { x: pad[0], y: 0.1, z: pad[2], seg: 12, edge: false }));
      carriage.add(cyl(0.03, 0.03, 0.17, W.metalLight, { x: pad[0], y: 0.2, z: pad[2], seg: 8, edge: false }));
      carriage.add(cyl(0.075, 0.075, 0.035, W.rubber, { x: pad[0], y: 0.29, z: pad[2], seg: 12, edge: false }));
    }
  }
  g.add(carriage);
  g.userData.carriage = carriage;
  /** @param {number} h metres: the arms' height; the pads' tops are 0.3 m above it */
  g.userData.setHeight = (h) => { carriage.position.y = h; };
  return g;
}

/**
 * A chassis dyno set into the floor, as most tuning shops have one: a steel deck flush
 * with the slab, two pairs of rollers showing through it where the driven wheels sit,
 * each wheel cradled between a pair, and tie-down rings let into the deck. A drum fan
 * stands at the car's nose. The car faces -z; its driven wheels sit at `rollerZ`.
 * @param {boolean} [owned] false: only the painted bay where one will go
 * @param {{monitor?: boolean, fanZ?: number, rollerZ?: number}} [o] `monitor: false` leaves the stand off (the shop's own
 *   dyno has its computer on a cart beside it)
 */
export function makeDyno(owned = true, o = {}) {
  const g = G();
  g.userData.dynamic = true;
  if (!owned) {
    g.add(box(2.6, 0.04, 4.0, W.floorStripe, { y: 0.02, edge: false, receive: true }));
    g.add(box(2.4, 0.045, 3.8, W.floorEpoxyAlt, { y: 0.022, edge: false }));
    return g;
  }
  const rz = o.rollerZ ?? 0.5;
  // The deck: chequer plate in a steel angle frame, cut round two roller openings.
  const DW = 2.9; const DL = 4.8; const T = 0.03;
  const ox0 = 0.42; const ox1 = 1.18; const oz = 0.42;
  const plate = (x0, x1, z0, z1) => g.add(box(x1 - x0, T, z1 - z0, W.metal, { x: (x0 + x1) / 2, y: T / 2, z: (z0 + z1) / 2, cast: false }));
  plate(-DW / 2, DW / 2, -DL / 2, rz - oz);
  plate(-DW / 2, DW / 2, rz + oz, DL / 2);
  plate(-ox0, ox0, rz - oz, rz + oz);
  for (const s of [-1, 1]) plate(s > 0 ? ox1 : -DW / 2, s > 0 ? DW / 2 : -ox1, rz - oz, rz + oz);
  for (const s of [-1, 1]) {
    g.add(box(0.05, T + 0.008, DL + 0.05, W.metalDark, { x: s * (DW / 2 + 0.025), y: (T + 0.008) / 2, cast: false, edge: false }));
    g.add(box(DW + 0.1, T + 0.008, 0.05, W.metalDark, { y: (T + 0.008) / 2, z: s * (DL / 2 + 0.025), cast: false, edge: false }));
  }
  // Chequer: the plate's raised pattern, a strip at a time, catching the light.
  for (let z = -DL / 2 + 0.15; z < DL / 2; z += 0.3) {
    if (Math.abs(z - rz) < oz + 0.05) continue;
    g.add(box(DW - 0.12, 0.004, 0.012, W.metalLight, { y: T + 0.002, z, cast: false, edge: false }));
  }
  const rollers = [];
  for (const s of [-1, 1]) {
    const cx = s * (ox0 + ox1) / 2;
    // The pit under the opening, and the rollers in it: a pair, the tyre between them.
    g.add(box(ox1 - ox0, 0.004, oz * 2, W.black, { x: cx, y: 0.003, z: rz, cast: false, edge: false }));
    for (const dz of [-0.21, 0.21]) {
      const r = cyl(0.17, 0.17, ox1 - ox0 - 0.08, W.rimDark, { axis: 'x', x: cx, y: -0.07, z: rz + dz, seg: 20 });
      // Knurled bands round the drum, so it reads as turning when it turns.
      for (const k of [-1, 0, 1]) r.add(cyl(0.172, 0.172, 0.02, W.metalLight, { axis: 'x', x: k * 0.22, seg: 20, edge: false, cast: false }));
      g.add(r);
      rollers.push(r);
    }
    // The axle's bearing housings at the opening's ends.
    for (const e of [-1, 1]) g.add(box(0.06, 0.06, 0.6, W.metalDark, { x: cx + e * ((ox1 - ox0) / 2 + 0.03), y: 0.03, z: rz, edge: false }));
  }
  g.userData.rollers = rollers;
  g.userData.rollerZ = rz;
  // Tie-down rings let into the deck, two each end.
  for (const s of [-1, 1]) for (const z of [-DL / 2 + 0.35, DL / 2 - 0.35]) g.add(cyl(0.05, 0.05, 0.015, W.metalDark, { x: s * 1.05, y: T + 0.008, z, seg: 12, edge: false }));
  // The cooling fan stands in front of the nose: a drum fan, its open shroud on a yoke on a
  // wheeled base, blowing at the radiator. `fanZ` puts it where the car's nose is.
  const fan = G();
  const fanZ = o.fanZ ?? 3.7;
  fan.position.set(0, 0.62, fanZ);
  if (fanZ < 0) fan.rotation.y = Math.PI;
  const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.26, 28, 1, true), toon(W.metalDark, { side: THREE.DoubleSide }));
  shroud.rotation.x = Math.PI / 2;
  shroud.castShadow = true;
  fan.add(shroud);
  // The guard: rings and spokes over the face, as on any drum fan.
  for (const r of [0.44, 0.3, 0.16]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.006, 4, 28), toon(W.metalLight));
    ring.position.z = 0.13;
    fan.add(ring);
  }
  for (let i = 0; i < 4; i += 1) {
    const sp = box(0.008, 0.9, 0.008, W.metalLight, { z: 0.13, edge: false, cast: false });
    sp.rotation.z = (i * Math.PI) / 4;
    fan.add(sp);
  }
  fan.add(cyl(0.09, 0.09, 0.2, W.black, { axis: 'z', z: -0.08, seg: 16 }));
  for (const s of [-1, 1]) fan.add(box(0.04, 0.52, 0.04, W.metalDark, { x: s * 0.5, y: -0.26 }));
  fan.add(box(1.04, 0.05, 0.5, W.metalDark, { y: -0.56 }));
  for (const s of [-1, 1]) for (const z of [-0.2, 0.2]) fan.add(cyl(0.03, 0.03, 0.03, W.black, { axis: 'x', x: s * 0.44, y: -0.6, z }));
  const blades = G();
  for (let i = 0; i < 4; i += 1) {
    const b = box(0.12, 0.8, 0.02, W.metalLight, { edge: false });
    b.rotation.z = (i * Math.PI) / 2 + 0.3;
    b.rotation.y = 0.35;
    blades.add(b);
  }
  fan.add(blades);
  g.add(fan);
  g.userData.fan = blades;
  if (o.monitor !== false) {
    g.add(box(0.1, 1.3, 0.1, W.metal, { x: -2.1, y: 0.65, z: 1.6 }));
    g.add(box(0.8, 0.5, 0.06, W.screenOff, { x: -2.1, y: 1.35, z: 1.6 }));
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.4), glow(W.screen));
    scr.position.set(-2.1, 1.35, 1.64);
    g.add(scr);
    g.userData.screen = scr;
  }
  return g;
}

/** Desk with two monitors and a laptop. Faces +z (the chair is on the +z side). */
export function makeDesk({ lit = true } = {}) {
  const g = G();
  g.userData.dynamic = true;
  g.add(box(3.4, 0.08, 1.1, W.woodLight, { y: 0.78 }));
  for (const x of [-1.6, 1.6]) g.add(box(0.1, 0.78, 0.9, W.woodDark, { x, y: 0.39, edge: false }));
  g.add(box(3.2, 0.5, 0.05, W.woodDark, { y: 0.55, z: -0.5, edge: false }));
  for (const x of [-0.75, 0.45]) {
    g.add(box(0.9, 0.55, 0.06, W.screenOff, { x, y: 1.3, z: -0.25 }));
    g.add(box(0.1, 0.3, 0.1, W.metal, { x, y: 0.96, z: -0.25, edge: false }));
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.47), glow(lit ? W.screen : W.screenOff));
    s.position.set(x, 1.3, -0.215);
    g.add(s);
    if (!g.userData.screens) g.userData.screens = [];
    g.userData.screens.push(s);
  }
  g.add(box(0.6, 0.02, 0.22, W.black, { x: -0.15, y: 0.83, z: 0.25, edge: false }));
  // The laptop on the right.
  g.add(box(0.5, 0.03, 0.34, W.metalDark, { x: 1.15, y: 0.84, z: 0.1 }));
  const lid = box(0.5, 0.32, 0.02, W.metalDark, { x: 1.15, y: 1.0, z: -0.06 });
  lid.rotation.x = -0.25;
  g.add(lid);
  const ls = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.27), glow(lit ? W.screenAmber : W.screenOff));
  ls.position.set(1.15, 1.0, -0.045);
  ls.rotation.x = -0.25;
  g.add(ls);
  g.userData.screens.push(ls);
  g.add(box(0.14, 0.12, 0.14, W.toolRed, { x: 0.95, y: 0.88, z: 0.4, edge: false })); // a mug
  // Chair.
  g.add(box(0.55, 0.08, 0.55, W.wallBlack, { x: -0.1, y: 0.5, z: 0.95 }));
  g.add(box(0.55, 0.6, 0.08, W.wallBlack, { x: -0.1, y: 0.85, z: 1.2 }));
  g.add(cyl(0.05, 0.05, 0.4, W.metalDark, { x: -0.1, y: 0.25, z: 0.95, edge: false }));
  g.add(cyl(0.28, 0.28, 0.04, W.metalDark, { x: -0.1, y: 0.03, z: 0.95, edge: false }));
  return g;
}

const TICKET_COLORS = [W.cloth.yellow, W.cloth.white, W.cloth.sky, W.cloth.pink, W.cloth.lime];
function ticketTexture(n) {
  return pixelTexture(64, 40, (g) => {
    g.fillStyle = W.woodLight;
    g.fillRect(0, 0, 64, 40);
    for (let i = 0; i < n; i += 1) {
      const x = 3 + (i % 4) * 15 + (i * 7) % 3;
      const y = 7 + Math.floor(i / 4) * 15 + (i * 5) % 3;
      g.fillStyle = TICKET_COLORS[i % TICKET_COLORS.length];
      g.fillRect(x, y, 12, 11);
      g.fillStyle = W.black;
      g.globalAlpha = 0.55;
      for (let l = 0; l < 3; l += 1) g.fillRect(x + 2, y + 3 + l * 3, 8 - (l % 2) * 2, 1);
      g.globalAlpha = 1;
      g.fillStyle = W.toolRed;
      g.fillRect(x + 5, y, 2, 2);
    }
  });
}

/** The job board on the wall: a cork board with tickets. Faces +z. @param {number} tickets */
export function makeJobBoard(tickets = 4) {
  const g = G();
  g.add(box(3.0, 1.9, 0.12, W.woodDark, { y: 1.7 }));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.7), new THREE.MeshToonMaterial({ map: ticketTexture(Math.max(1, Math.min(12, tickets))) }));
  face.position.set(0, 1.7, 0.07);
  g.add(face);
  const head = sign('CUSTOMERS', { w: 2.0, h: 0.4, bg: W.toolRed, fg: W.white });
  head.position.set(0, 2.9, 0.07);
  g.add(head);
  return g;
}

/**
 * A roll cab with a top chest on it, as every mechanic owns one: drawers of a few depths,
 * shallow at the top and deep at the bottom, each with a full-width pull, on four casters;
 * the top chest's lid shut. Faces +z. @param {string} color
 */
export function makeToolChest(color = W.toolRed) {
  const g = G();
  const w = 1.06; const d = 0.48;
  g.add(box(w, 0.88, d, color, { y: 0.14 + 0.44 }));
  const rows = [0.07, 0.07, 0.1, 0.1, 0.14, 0.2, 0.2];
  let y = 1.02 - 0.03;
  for (const h of rows) {
    y -= h;
    g.add(box(w - 0.06, 0.006, 0.01, W.black, { y, z: d / 2 + 0.002, edge: false, cast: false }));
    g.add(box(w - 0.16, 0.018, 0.022, W.metalLight, { y: y + h - 0.025, z: d / 2 + 0.012, edge: false }));
  }
  g.add(box(w + 0.02, 0.025, d + 0.02, W.rubber, { y: 1.035 }));
  // The top chest, a little shallower, its lid shut.
  g.add(box(w - 0.04, 0.42, d - 0.08, color, { y: 1.26, z: -0.03 }));
  for (const yy of [1.13, 1.2, 1.27]) g.add(box(w - 0.18, 0.016, 0.02, W.metalLight, { y: yy, z: d / 2 - 0.06, edge: false }));
  g.add(box(w - 0.02, 0.06, d - 0.06, color, { y: 1.5, z: -0.03 }));
  g.add(box(0.3, 0.02, 0.03, W.metalLight, { y: 1.47, z: d / 2 - 0.05, edge: false }));
  for (const s of [-1, 1]) g.add(box(0.025, 0.025, 0.3, W.metalLight, { x: s * (w / 2 + 0.03), y: 0.92, edge: false }));
  for (const [x, z] of [[-0.44, -0.16], [0.44, -0.16], [-0.44, 0.16], [0.44, 0.16]]) {
    g.add(box(0.07, 0.02, 0.07, W.metalDark, { x, y: 0.125, z, edge: false }));
    g.add(cyl(0.05, 0.05, 0.035, W.rubber, { axis: 'x', x, y: 0.06, z, seg: 12, edge: false }));
  }
  return g;
}

/** A stack of tyres. @param {number} n */
export function makeTyreStack(n = 4) {
  const g = G();
  for (let i = 0; i < n; i += 1) {
    const t = new THREE.Mesh(tyreGeometry(0.34, 0.24), toon(W.tyre));
    t.position.y = 0.12 + i * 0.24;
    t.castShadow = true;
    edged(t, 60);
    g.add(t);
    g.add(cyl(0.2, 0.2, 0.245, W.tyreWall, { y: 0.12 + i * 0.24, edge: false }));
  }
  return g;
}

/**
 * Steel racking, the kind a shop keeps its stock on: two braced end frames, four shelves,
 * and on them what a tuning shop orders in: parts in their brown boxes, oil by the case,
 * a cylinder head on a pallet of cardboard, a coil of hose. Faces +z. @param {number} seed
 */
export function makeShelf(seed = 0) {
  const g = G();
  for (const x of [-1.5, 1.5]) {
    for (const z of [-0.27, 0.27]) g.add(box(0.06, 2.4, 0.06, W.metalDark, { x, y: 1.2, z }));
    for (let k = 0; k < 4; k += 1) g.add(strut([x, 0.2 + k * 0.55, -0.27], [x, 0.75 + k * 0.55, 0.27], 0.02, 0.02, W.metalDark));
  }
  const cols = [W.crate, W.crate, W.plaster, W.crate, W.plasterDark];
  for (let r = 0; r < 4; r += 1) {
    const sy = 0.12 + r * 0.66;
    g.add(box(3.06, 0.035, 0.6, W.metal, { y: sy }));
    for (const z of [-0.29, 0.29]) g.add(box(3.06, 0.07, 0.03, W.metalDark, { y: sy + 0.01, z, edge: false }));
    let x = -1.38;
    for (let i = 0; i < 5 && x < 1.2; i += 1) {
      const k = (seed + r * 3 + i * 7) % 11;
      const bw = 0.3 + (k % 4) * 0.08;
      const bh = r === 3 ? 0.22 : 0.18 + (k % 3) * 0.09;
      if (k === 4 && r === 1) {
        // A cylinder head waiting for its engine, on its cardboard.
        g.add(box(0.62, 0.02, 0.3, W.crate, { x: x + 0.31, y: sy + 0.03 }));
        g.add(box(0.58, 0.12, 0.24, W.engine.head, { x: x + 0.31, y: sy + 0.1 }));
        x += 0.72;
        continue;
      }
      if (k === 9) {
        const hose = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 6, 16), toon(W.rubber));
        hose.rotation.x = Math.PI / 2;
        hose.position.set(x + 0.17, sy + 0.05, 0);
        g.add(hose);
        x += 0.4;
        continue;
      }
      g.add(box(bw, bh, 0.4 + (k % 2) * 0.08, cols[k % cols.length], { x: x + bw / 2, y: sy + 0.02 + bh / 2 }));
      x += bw + 0.05;
    }
  }
  return g;
}

/** An oil drum. @param {string} color */
export function makeBarrel(color = W.barrel) {
  const g = G();
  g.add(cyl(0.3, 0.3, 0.9, color, { y: 0.45, seg: 10 }));
  g.add(cyl(0.31, 0.31, 0.05, W.metalDark, { y: 0.2, edge: false, seg: 10 }), cyl(0.31, 0.31, 0.05, W.metalDark, { y: 0.7, edge: false, seg: 10 }));
  return g;
}

export const makeCrate = () => { const g = G(); g.add(box(0.7, 0.6, 0.7, W.crate, { y: 0.3 })); g.add(box(0.72, 0.06, 0.72, W.woodDark, { y: 0.55, edge: false })); return g; };

/** A couch. Faces +z. @param {string} color */
export function makeCouch(color = W.cloth.purple) {
  const g = G();
  g.add(box(2.0, 0.4, 0.9, color, { y: 0.3 }));
  g.add(box(2.0, 0.6, 0.2, color, { y: 0.7, z: -0.35 }));
  for (const x of [-0.9, 0.9]) g.add(box(0.2, 0.55, 0.9, color, { x, y: 0.55 }));
  g.add(box(0.8, 0.12, 0.7, W.cloth.cream, { x: -0.4, y: 0.55, z: 0.05, edge: false }), box(0.8, 0.12, 0.7, W.cloth.cream, { x: 0.45, y: 0.55, z: 0.05, edge: false }));
  return g;
}

export function makeCoffeeMachine() {
  const g = G();
  g.add(box(1.0, 0.9, 0.5, W.wallBlack, { y: 0.45 }));
  g.add(box(0.6, 0.5, 0.45, W.metal, { y: 1.15, z: 0.0 }));
  g.add(box(0.14, 0.14, 0.05, W.neonGreen, { x: -0.2, y: 1.2, z: 0.24, mat: glow(W.neonGreen), edge: false }));
  g.add(cyl(0.07, 0.07, 0.14, W.white, { y: 0.97, z: 0.2, edge: false }));
  return g;
}

export function makeArcade() {
  const g = G();
  g.userData.dynamic = true;
  g.add(box(0.9, 1.9, 0.8, W.paint.purple, { y: 0.95 }));
  g.add(box(0.8, 0.5, 0.05, W.screenOff, { y: 1.5, z: 0.4 }));
  const s = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.4), glow(W.neonCyan));
  s.position.set(0, 1.5, 0.43);
  g.add(s);
  g.userData.screen = s;
  g.add(box(0.8, 0.1, 0.4, W.wallBlack, { y: 0.95, z: 0.45 }));
  g.add(cyl(0.04, 0.04, 0.12, W.toolRed, { x: -0.15, y: 1.05, z: 0.5, edge: false }));
  g.add(box(0.8, 0.3, 0.05, W.neonPink, { y: 1.8, z: 0.4, mat: glow(W.neonPink), edge: false }));
  return g;
}

/** A trophy shelf holding n cups. Faces +z. @param {number} n */
export function makeTrophyShelf(n = 3) {
  const g = G();
  g.add(box(2.4, 0.08, 0.4, W.woodDark, { y: 1.6 }));
  g.add(box(2.4, 0.08, 0.4, W.woodDark, { y: 2.3 }));
  for (let i = 0; i < Math.min(n, 10); i += 1) {
    const row = i < 5 ? 0 : 1;
    const x = -0.9 + (i % 5) * 0.45;
    const y = 1.64 + row * 0.7;
    const col = i % 3 === 0 ? W.paint.gold : i % 3 === 1 ? W.cloth.silver : W.paint.bronze;
    g.add(cyl(0.12, 0.05, 0.22, col, { x, y: y + 0.18, edge: false, seg: 8 }));
    g.add(cyl(0.04, 0.04, 0.12, col, { x, y: y + 0.06, edge: false, seg: 6 }));
    g.add(box(0.16, 0.05, 0.16, W.woodDark, { x, y: y + 0.025, edge: false }));
  }
  return g;
}

/** A poster on a wall: a pixel picture. Faces +z. @param {number} seed */
export function makePoster(seed = 0) {
  const g = G();
  const pal = [W.toolRed, W.toolBlue, W.toolYellow, W.neonPink, W.neonCyan, W.paint.green];
  const tex = pixelTexture(24, 32, (c) => {
    const a = pal[seed % pal.length];
    const b = pal[(seed + 2) % pal.length];
    c.fillStyle = W.wallBlack;
    c.fillRect(0, 0, 24, 32);
    c.fillStyle = a;
    c.fillRect(2, 2, 20, 19);
    c.fillStyle = b;
    // a little pixel car silhouette
    c.fillRect(4, 13, 16, 4);
    c.fillRect(7, 10, 9, 3);
    c.fillStyle = W.black;
    c.fillRect(6, 16, 3, 3);
    c.fillRect(15, 16, 3, 3);
    c.fillStyle = W.white;
    c.fillRect(3, 24, 18, 2);
    c.fillRect(6, 28, 12, 1);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.2), new THREE.MeshToonMaterial({ map: tex }));
  g.add(m);
  g.add(box(0.96, 1.26, 0.03, W.black, { z: -0.02, edge: false }));
  return g;
}

export function makePlant(big = false) {
  const g = G();
  g.add(cyl(0.22, 0.17, 0.3, W.brick, { y: 0.15, seg: 8 }));
  const s = big ? 1.4 : 1;
  g.add(cone(0.35 * s, 0.9 * s, W.leaf, { y: 0.6 * s + 0.3, seg: 6 }));
  g.add(cone(0.26 * s, 0.7 * s, W.leafDark, { y: s + 0.3, seg: 6 }));
  return g;
}

/** A wardrobe locker with a mirror. Faces +z. */
export function makeLocker() {
  const g = G();
  g.add(box(1.4, 2.2, 0.6, W.wallBlue, { y: 1.1 }));
  g.add(box(0.06, 2.0, 0.04, W.black, { x: 0, y: 1.1, z: 0.31, edge: false }));
  const mir = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.2), glow(W.glass, 0.55));
  mir.position.set(-0.35, 1.2, 0.31);
  g.add(mir);
  g.add(box(0.14, 0.1, 0.04, W.metalLight, { x: -0.1, y: 1.1, z: 0.32, edge: false }));
  g.add(box(0.14, 0.1, 0.04, W.metalLight, { x: 0.1, y: 1.1, z: 0.32, edge: false }));
  return g;
}

/** A wall calendar and clock, for closing up. Faces +z. @param {number} day */
export function makeCalendar(day = 1) {
  const g = G();
  g.add(box(0.8, 1.0, 0.05, W.white, { y: 1.8 }));
  const hd = sign(`DAY ${day}`, { w: 0.76, h: 0.3, bg: W.toolRed, fg: W.white });
  hd.position.set(0, 2.15, 0.03);
  g.add(hd);
  for (let r = 0; r < 4; r += 1) for (let c = 0; c < 5; c += 1) {
    const n = r * 5 + c + 1;
    g.add(box(0.1, 0.1, 0.01, n < day ? W.cloth.silver : W.cloth.yellow, { x: -0.3 + c * 0.15, y: 1.85 - r * 0.15, z: 0.03, edge: false }));
  }
  return g;
}

/** A ceiling lamp that is drawn as a hanging fitting. */
export function makeLamp(color = W.lampWarm) {
  const g = G();
  g.add(cyl(0.02, 0.02, 0.6, W.black, { y: 0.3, edge: false, cast: false }));
  g.add(cyl(0.45, 0.2, 0.2, W.metalDark, { y: -0.05, seg: 8, edge: false, cast: false }));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.04, 8), glow(color)));
  g.children[g.children.length - 1].position.y = -0.17;
  return g;
}

/** A floor lamp: a pole and a warm shade. */
export function makeFloorLamp() {
  const g = G();
  g.add(cyl(0.18, 0.2, 0.05, W.metalDark, { y: 0.025, seg: 8, edge: false }));
  g.add(cyl(0.025, 0.025, 1.5, W.metalDark, { y: 0.8, seg: 6, edge: false }));
  g.add(cyl(0.2, 0.28, 0.32, W.cloth.cream, { y: 1.6, seg: 8, edge: false }));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.05, 8), glow(W.lampWarm)));
  g.children[g.children.length - 1].position.y = 1.44;
  return g;
}

/** A neon sign board: text in glowing colour on a dark backing. @param {string} text @param {string} color */
export function makeNeon(text, color = W.neonPink, w = 3.2) {
  const g = G();
  g.add(box(w + 0.2, 0.9, 0.12, W.black, { edge: false }));
  const s = sign(text, { w, h: 0.7, bg: W.black, fg: color, glowing: true });
  s.position.z = 0.07;
  g.add(s);
  g.userData.sign = s;
  return g;
}

/** The garage door, rolled right up. @param {number} width */
export function makeRollupDoor(width = 7.5) {
  const g = G();
  // Open, so nothing hangs between the camera and the floor: just the two jambs and a
  // hazard-striped threshold.
  g.add(box(0.3, 1.4, 0.4, W.metalDark, { x: -width / 2 - 0.15, y: 0.7 }));
  g.add(box(0.3, 1.4, 0.4, W.metalDark, { x: width / 2 + 0.15, y: 0.7 }));
  g.add(box(width, 0.02, 0.5, W.hazard, { y: 0.012, z: 0.5, edge: false, cast: false }));
  return g;
}

/** A tree: a trunk and tiers of soft pine. @param {number} seed */
export function makeTree(seed = 0, autumn = false) {
  const g = G();
  const s = 0.85 + ((seed * 37) % 10) / 25;
  g.add(cyl(0.18 * s, 0.26 * s, 1.5 * s, W.trunk, { y: 0.75 * s, seg: 7, edge: false }));
  const cols = autumn ? [W.leafAutumn, W.leaf] : [W.leaf, W.leafDark];
  const tiers = [[1.35, 1.8, 2.0], [1.05, 1.5, 2.9], [0.72, 1.2, 3.7], [0.4, 0.9, 4.4]];
  tiers.forEach(([r, h, y], i) => g.add(cone(r * s, h * s, cols[i % 2], { y: y * s, seg: 10, edge: false })));
  return g;
}

/** A round deciduous tree: a clump of leaf balls on a trunk. @param {number} seed */
export function makeRoundTree(seed = 0) {
  const g = G();
  const s = 0.9 + ((seed * 53) % 10) / 20;
  g.add(cyl(0.2 * s, 0.28 * s, 1.9 * s, W.trunk, { y: 0.95 * s, seg: 7, edge: false }));
  const c = [W.leaf, W.leafDark, W.grassLight][seed % 3];
  const hi = [W.grassLight, W.leaf, W.leaf][seed % 3];
  g.add(ball(1.25 * s, c, { y: 2.8 * s, sy: 0.9 }));
  g.add(ball(0.95 * s, hi, { x: 0.55 * s, y: 3.35 * s, z: 0.2 * s }));
  g.add(ball(0.85 * s, c, { x: -0.6 * s, y: 3.1 * s, z: -0.3 * s }));
  g.add(ball(0.7 * s, hi, { x: 0.05 * s, y: 3.75 * s, z: -0.25 * s }));
  return g;
}

/** A bush, now and then with flowers. @param {number} seed */
export function makeBush(seed = 0) {
  const g = G();
  const s = 0.8 + ((seed * 29) % 10) / 20;
  g.add(ball(0.75 * s, W.leafDark, { y: 0.5 * s, sy: 0.75 }));
  g.add(ball(0.55 * s, W.leaf, { x: 0.5 * s, y: 0.42 * s, z: 0.1, sy: 0.8 }));
  g.add(ball(0.5 * s, W.leaf, { x: -0.45 * s, y: 0.4 * s, z: -0.15, sy: 0.8 }));
  if (seed % 3 === 0) for (let i = 0; i < 5; i += 1) g.add(ball(0.1, i % 2 ? W.flowerA : W.flowerB, { x: Math.sin(i * 2.4) * 0.6 * s, y: 0.7 * s + (i % 2) * 0.08, z: Math.cos(i * 2.4) * 0.5 * s, seg: 5 }));
  return g;
}

export function makeStreetLamp(on = false) {
  const g = G();
  g.add(cyl(0.07, 0.1, 4.6, W.metalDark, { y: 2.3, seg: 6, edge: false }));
  g.add(rbox(0.9, 0.1, 0.14, W.metalDark, { x: 0.35, y: 4.6, r: 0.04 }));
  g.add(ball(0.2, on ? W.lampWarm : W.cloth.silver, { x: 0.7, y: 4.5, sy: 0.7, seg: 8, mat: glow(on ? W.lampWarm : W.cloth.silver) }));
  return g;
}

export function makeBench() {
  const g = G();
  g.add(box(1.6, 0.08, 0.5, W.woodLight, { y: 0.5 }));
  g.add(box(1.6, 0.4, 0.06, W.woodLight, { y: 0.8, z: -0.22 }));
  for (const x of [-0.7, 0.7]) g.add(box(0.08, 0.5, 0.4, W.metalDark, { x, y: 0.25, edge: false }));
  return g;
}

export function makeCone() {
  const g = G();
  g.add(box(0.4, 0.04, 0.4, W.black, { y: 0.02, edge: false }));
  g.add(cone(0.16, 0.6, W.cone, { y: 0.34, seg: 8, edge: false }));
  g.add(cyl(0.1, 0.12, 0.08, W.white, { y: 0.32, edge: false, seg: 8 }));
  return g;
}

/**
 * A steel workbench: a thick hardwood top on a welded frame, a drawer pedestal under one
 * end and a shelf low down, the top worn where the work is done. Faces +z.
 */
export function makeWorkbench() {
  const g = G();
  g.add(box(2.3, 0.06, 0.8, W.woodLight, { y: 0.92 }));
  g.add(box(2.3, 0.08, 0.03, W.metalDark, { y: 0.86, z: 0.39, edge: false }));
  for (const x of [-1.1, 1.1]) for (const z of [-0.34, 0.34]) g.add(box(0.05, 0.86, 0.05, W.metalDark, { x, y: 0.43, z }));
  g.add(box(2.2, 0.03, 0.7, W.metal, { y: 0.16 }));
  // The drawer pedestal, three drawers and their pulls.
  g.add(box(0.5, 0.6, 0.7, W.metalDark, { x: 0.82, y: 0.58 }));
  for (const y of [0.78, 0.6, 0.4]) g.add(box(0.3, 0.02, 0.02, W.metalLight, { x: 0.82, y, z: 0.36, edge: false }));
  // A toolbox and a parts tray on top, where a bench has them.
  g.add(box(0.5, 0.2, 0.24, W.toolRed, { x: -0.7, y: 1.05, z: -0.15 }));
  g.add(box(0.2, 0.03, 0.04, W.black, { x: -0.7, y: 1.17, z: -0.15, edge: false }));
  g.add(box(0.36, 0.04, 0.26, W.metal, { x: 0.25, y: 0.97, z: 0.08 }));
  return g;
}

/** A fence section along x. @param {number} length */
export function makeFence(length = 4) {
  const g = G();
  const n = Math.max(2, Math.round(length / 1.0));
  for (let i = 0; i <= n; i += 1) g.add(box(0.1, 1.3, 0.1, W.metalDark, { x: -length / 2 + (i * length) / n, y: 0.65, edge: false }));
  g.add(box(length, 0.06, 0.04, W.metal, { y: 1.2, edge: false }), box(length, 0.06, 0.04, W.metal, { y: 0.5, edge: false }));
  return g;
}

const DOG_FRAMES = ['stand', 'stepA', 'stepB', 'sit'];
const dogSheets = new Map();

/**
 * Paints the shop dog: a short-legged mutt with dark ears and a pale muzzle.
 * @param {ReturnType<typeof import('./sprite.js').raster>} r @param {number} row 0 front, 1 back, 2 side
 * @param {string} frame @param {string} coat
 */
function paintDog(r, row, frame, coat) {
  const ear = W.woodDark;
  const pale = W.cloth.cream;
  const step = frame === 'stepA' ? 1 : frame === 'stepB' ? -1 : 0;
  const sit = frame === 'sit';
  if (row === 2) {
    // Side, facing right: tail up at the back, head forward.
    r.rect(4, sit ? 8 : 7, 13, 11, coat);
    r.rect(5, 12, 5 + (step > 0 ? 1 : 0), 14, coat); r.rect(7 - (step > 0 ? 1 : 0), 12, 7, 14, coat);
    if (!sit) { r.rect(11 + (step < 0 ? 1 : 0), 12, 11 + (step < 0 ? 1 : 0), 14, coat); r.rect(13 - (step < 0 ? 1 : 0), 12, 13, 14, coat); }
    else r.rect(11, 12, 14, 13, coat);
    r.rect(2, 4, 3, 7, coat); r.set(1, 3, coat);
    r.rect(12, 2, 17, 8, coat);
    r.rect(16, 6, 19, 8, pale); r.set(19, 6, W.black);
    r.rect(12, 1, 13, 4, ear);
    r.set(15, 4, W.eye);
    r.rect(8, 10, 11, 11, pale);
    return;
  }
  // Front or back.
  r.rect(6, 8, 13, 13, coat);
  if (!sit) { r.rect(6, 13, 7, 15 - (step > 0 ? 1 : 0), coat); r.rect(12, 13, 13, 15 - (step < 0 ? 1 : 0), coat); }
  else { r.rect(5, 13, 8, 14, coat); r.rect(11, 13, 14, 14, coat); }
  r.rect(6, 1, 13, 8, coat);
  r.rect(4, 1, 5, 6, ear); r.rect(14, 1, 15, 6, ear);
  if (row === 0) {
    r.rect(8, 5, 11, 8, pale);
    r.rect(9, 5, 10, 5, W.black);
    r.set(8, 3, W.eye); r.set(11, 3, W.eye);
    r.rect(9, 7, 10, 7, W.mouth);
    r.rect(8, 9, 11, 11, pale);
  } else {
    r.rect(9, 0, 10, 2, coat);
    r.rect(9, -1, 10, 0, coat);
    r.rect(9, 6, 10, 13, tone(coat, -0.08));
  }
}

/** A small dog, drawn as a sprite like the people. Faces +z. @param {string} color */
export function makeDog(color = W.paint.copper) {
  const g = G();
  g.userData.dynamic = true;
  const body = G();
  g.add(body);
  let sheet = dogSheets.get(color);
  if (!sheet) {
    sheet = bakeSheet({ cw: 20, ch: 16, cols: DOG_FRAMES.length, rows: 3, paint: (r, row, col) => paintDog(r, row, DOG_FRAMES[col], color) });
    dogSheets.set(color, sheet);
  }
  const sprite = spriteCard({ cw: 20, ch: 16, cols: DOG_FRAMES.length, px: 0.055, foot: 1, blob: 0.34, owner: g });
  sprite.setSheet(sheet);
  body.add(sprite.card);
  g.add(sprite.blob);
  Object.assign(g.userData, { body, phase: 0, idle: 0 });
  /** @param {number} dt @param {number} speed */
  g.userData.update = (dt, speed) => {
    const u = g.userData;
    u.phase += dt * (6 + speed * 3);
    if (speed > 0.1) {
      u.idle = 0;
      const beat = Math.floor(u.phase) % 4;
      sprite.frame = beat === 0 ? 1 : beat === 2 ? 2 : 0;
      body.position.y = beat % 2 ? 0.03 : 0;
    } else {
      // Standing a while, he sits.
      u.idle += dt;
      sprite.frame = u.idle > 1.5 ? 3 : 0;
      body.position.y = 0;
    }
  };
  return g;
}

/** A hazard-taped, half-built corner for equipment the shop does not own yet. */
export function makeBuildSite(w = 4, d = 5) {
  const g = G();
  g.add(box(w, 0.03, d, W.floorEpoxyAlt, { y: 0.015, edge: false }));
  for (const [x, z, sw, sd] of [[0, d / 2, w, 0.12], [0, -d / 2, w, 0.12], [w / 2, 0, 0.12, d], [-w / 2, 0, 0.12, d]]) g.add(box(sw, 0.05, sd, W.hazard, { x, y: 0.04, z, edge: false }));
  for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) { const c = makeCone(); c.position.set(x, 0, z); g.add(c); }
  return g;
}

/** A paper-wrapped shop front sign for a location, facing +z. */
export function makeShopSign(text, color, w = 5) {
  const g = G();
  g.add(box(w, 1.1, 0.25, color));
  const s = sign(text, { w: w - 0.3, h: 0.8, bg: color, fg: W.white });
  s.position.z = 0.14;
  g.add(s);
  return g;
}
