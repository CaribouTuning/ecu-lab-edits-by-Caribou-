/**
 * Things in the garage: lifts, a dyno, shelves, a workbench, tyres. Each is a small group of boxes at metre scale, origin on the floor at its middle.
 */

import { world as W } from '../../tokens.js';
import { THREE, box, cone, cyl, edged, glow, strut, toon, tyreGeometry } from '../gfx.js';

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

