/**
 * Things in a garage, a street and a showroom: lifts, a dyno, desks, shelves, signs,
 * trees. Each is a small group of boxes at metre scale, origin on the floor at its middle.
 */

import { world as W } from '../../tokens.js';
import { THREE, box, cone, cyl, edged, glow, pixelTexture, sign, toon } from '../gfx.js';

const G = () => new THREE.Group();

/** A two-post car lift. Posts either side of a car along z; the carriage rides up and down. */
export function makeLift() {
  const g = G();
  g.userData.dynamic = true;
  const gap = 2.15;
  for (const s of [-1, 1]) {
    g.add(box(0.5, 0.1, 0.9, W.metalDark, { x: s * gap, y: 0.05 }));
    g.add(box(0.28, 2.7, 0.3, W.toolYellow, { x: s * gap, y: 1.4 }));
    g.add(box(0.3, 0.12, 0.32, W.black, { x: s * gap, y: 2.72, edge: false }));
  }
  const carriage = G();
  for (const s of [-1, 1]) {
    for (const z of [-1.2, 1.2]) {
      carriage.add(box(gap - 0.55, 0.08, 0.22, W.metalLight, { x: s * (gap / 2 + 0.2), y: 0.09, z: z * 0.5 + (z > 0 ? 0.35 : -0.35) }));
      carriage.add(cyl(0.14, 0.14, 0.05, W.rubber, { x: s * 0.82, y: 0.15, z: z * 0.5 + (z > 0 ? 0.35 : -0.35), edge: false }));
    }
    carriage.add(box(0.3, 0.28, 0.4, W.toolYellow, { x: s * gap, y: 0.2, z: 0 }));
  }
  g.add(carriage);
  g.userData.carriage = carriage;
  /** @param {number} h metres */
  g.userData.setHeight = (h) => { carriage.position.y = h; };
  return g;
}

/** A chassis dyno: rollers in a pit, a big fan, and a monitor on a stand. */
export function makeDyno(owned = true) {
  const g = G();
  g.userData.dynamic = true;
  if (!owned) {
    g.add(box(2.6, 0.04, 4.0, W.floorStripe, { y: 0.02, edge: false, receive: true }));
    g.add(box(2.4, 0.045, 3.8, W.floorEpoxyAlt, { y: 0.022, edge: false }));
    return g;
  }
  g.add(box(3.0, 0.1, 4.2, W.black, { y: 0.05 }));
  g.add(box(0.12, 0.14, 4.2, W.hazard, { x: 1.54, y: 0.06, edge: false }), box(0.12, 0.14, 4.2, W.hazard, { x: -1.54, y: 0.06, edge: false }));
  const rollers = [];
  for (const s of [-1, 1]) {
    for (const z of [-0.45, 0.45]) {
      const r = cyl(0.22, 0.22, 1.0, W.rimDark, { axis: 'x', x: s * 0.92, y: 0.22, z: z + 0.5 });
      g.add(r);
      rollers.push(r);
    }
    g.add(box(1.1, 0.06, 1.5, W.rimDark, { x: s * 0.92, y: 0.13, z: 0.5, edge: false }));
  }
  g.userData.rollers = rollers;
  // The cooling fan stands in front of the nose.
  const fan = G();
  fan.position.set(0, 0.9, 3.7);
  fan.add(cyl(0.7, 0.7, 0.18, W.metalDark, { axis: 'z' }));
  const blades = G();
  for (let i = 0; i < 4; i += 1) {
    const b = box(0.14, 1.1, 0.04, W.metalLight, { edge: false });
    b.rotation.z = (i * Math.PI) / 2 + 0.3;
    blades.add(b);
  }
  fan.add(blades);
  fan.add(box(0.12, 0.9, 0.12, W.metal, { y: -0.45, z: 0 }));
  g.add(fan);
  g.userData.fan = blades;
  // Monitor stand and strap anchors.
  g.add(box(0.1, 1.3, 0.1, W.metal, { x: -2.1, y: 0.65, z: 1.6 }));
  g.add(box(0.8, 0.5, 0.06, W.screenOff, { x: -2.1, y: 1.35, z: 1.6 }));
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.4), glow(W.screen));
  scr.position.set(-2.1, 1.35, 1.64);
  g.add(scr);
  g.userData.screen = scr;
  for (const s of [-1, 1]) for (const z of [-0.6, 1.8]) g.add(cyl(0.07, 0.07, 0.08, W.toolRed, { x: s * 1.9, y: 0.06, z, edge: false }));
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

/** A rolling tool chest. @param {string} color */
export function makeToolChest(color = W.toolRed) {
  const g = G();
  g.add(box(1.1, 1.0, 0.55, color, { y: 0.55 }));
  for (let i = 0; i < 4; i += 1) {
    g.add(box(1.0, 0.02, 0.02, W.black, { y: 0.25 + i * 0.22, z: 0.28, edge: false }));
    g.add(box(0.3, 0.04, 0.04, W.metalLight, { y: 0.35 + i * 0.22, z: 0.3, edge: false }));
  }
  g.add(box(1.14, 0.06, 0.6, W.metalDark, { y: 1.08 }));
  for (const x of [-0.45, 0.45]) g.add(cyl(0.06, 0.06, 0.04, W.black, { x, y: 0.05, edge: false, axis: 'x' }));
  return g;
}

/** A stack of tyres. @param {number} n */
export function makeTyreStack(n = 4) {
  const g = G();
  for (let i = 0; i < n; i += 1) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12), toon(W.tyre));
    t.position.y = 0.12 + i * 0.24;
    t.castShadow = true;
    edged(t, 60);
    g.add(t);
    g.add(cyl(0.2, 0.2, 0.245, W.tyreWall, { y: 0.12 + i * 0.24, edge: false }));
  }
  return g;
}

/** Shelving with boxes and parts. Faces +z. */
export function makeShelf(seed = 0) {
  const g = G();
  const cols = [W.crate, W.toolBlue, W.toolRed, W.paint.grey, W.toolYellow, W.barrel];
  for (const x of [-1.5, 1.5]) g.add(box(0.1, 2.4, 0.6, W.metalDark, { x, y: 1.2, edge: false }));
  for (let r = 0; r < 4; r += 1) {
    g.add(box(3.1, 0.06, 0.6, W.metal, { y: 0.35 + r * 0.65 }));
    for (let i = 0; i < 4; i += 1) {
      const k = (seed + r * 3 + i * 7) % cols.length;
      g.add(box(0.4 + ((i + r) % 3) * 0.1, 0.3 + ((r + i) % 2) * 0.1, 0.4, cols[k], { x: -1.1 + i * 0.7, y: 0.55 + r * 0.65, edge: false }));
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

/** A tree, trunk and cones. @param {number} seed */
export function makeTree(seed = 0, autumn = false) {
  const g = G();
  const s = 0.85 + ((seed * 37) % 10) / 25;
  g.add(cyl(0.18 * s, 0.24 * s, 1.5 * s, W.trunk, { y: 0.75 * s, seg: 6, edge: false }));
  const cols = autumn ? [W.leafAutumn, W.leaf] : [W.leaf, W.leafDark];
  g.add(cone(1.2 * s, 2.0 * s, cols[0], { y: 2.1 * s, seg: 7, edge: false }));
  g.add(cone(0.9 * s, 1.6 * s, cols[1], { y: 3.0 * s, seg: 7, edge: false }));
  g.add(cone(0.55 * s, 1.1 * s, cols[0], { y: 3.8 * s, seg: 7, edge: false }));
  return g;
}

/** A round deciduous tree. @param {number} seed */
export function makeRoundTree(seed = 0) {
  const g = G();
  const s = 0.9 + ((seed * 53) % 10) / 20;
  g.add(cyl(0.2 * s, 0.26 * s, 1.8 * s, W.trunk, { y: 0.9 * s, seg: 6, edge: false }));
  const c = [W.leaf, W.leafDark, W.grassLight][seed % 3];
  g.add(box(2.0 * s, 1.6 * s, 2.0 * s, c, { y: 2.5 * s, edge: false }));
  g.add(box(1.4 * s, s, 1.4 * s, c, { y: 3.5 * s, edge: false }));
  return g;
}

export function makeStreetLamp(on = false) {
  const g = G();
  g.add(cyl(0.07, 0.1, 4.6, W.metalDark, { y: 2.3, seg: 6, edge: false }));
  g.add(box(0.9, 0.08, 0.16, W.metalDark, { x: 0.35, y: 4.6, edge: false }));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, 0.2), glow(on ? W.lampWarm : W.cloth.silver)));
  g.children[g.children.length - 1].position.set(0.65, 4.52, 0);
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

/** A workbench with a vice and tools. */
export function makeWorkbench() {
  const g = G();
  g.add(box(2.4, 0.08, 0.9, W.woodLight, { y: 0.95 }));
  for (const x of [-1.1, 1.1]) g.add(box(0.1, 0.95, 0.8, W.metalDark, { x, y: 0.47, edge: false }));
  g.add(box(2.2, 0.06, 0.7, W.metal, { y: 0.35, edge: false }));
  g.add(box(0.25, 0.25, 0.25, W.toolRed, { x: -0.8, y: 1.12, edge: false }));
  g.add(box(0.5, 0.06, 0.12, W.metalLight, { x: 0.3, y: 1.02, z: 0.15, edge: false }));
  g.add(cyl(0.08, 0.08, 0.15, W.toolYellow, { x: 0.9, y: 1.07, edge: false }));
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

/** A small dog. Faces +z. @param {string} color */
export function makeDog(color = W.paint.copper) {
  const g = G();
  g.userData.dynamic = true;
  const body = G();
  body.add(box(0.28, 0.26, 0.6, color, { y: 0.38, edge: false }));
  const head = G();
  head.position.set(0, 0.55, 0.36);
  head.add(box(0.22, 0.2, 0.24, color, { edge: false }));
  head.add(box(0.14, 0.1, 0.12, W.cloth.cream, { y: -0.04, z: 0.15, edge: false }));
  head.add(box(0.06, 0.08, 0.04, W.black, { y: -0.02, z: 0.22, edge: false }));
  head.add(box(0.07, 0.14, 0.05, W.woodDark, { x: 0.1, y: 0.12, edge: false }), box(0.07, 0.14, 0.05, W.woodDark, { x: -0.1, y: 0.12, edge: false }));
  body.add(head);
  const tail = box(0.06, 0.06, 0.26, color, { y: 0.55, z: -0.4, edge: false });
  tail.rotation.x = 0.7;
  body.add(tail);
  const legs = [];
  for (const [x, z] of [[-0.09, 0.2], [0.09, 0.2], [-0.09, -0.2], [0.09, -0.2]]) {
    const leg = G();
    leg.position.set(x, 0.26, z);
    leg.add(box(0.07, 0.26, 0.07, color, { y: -0.13, edge: false }));
    body.add(leg);
    legs.push(leg);
  }
  g.add(body);
  Object.assign(g.userData, { body, head, tail, legs, phase: 0 });
  /** @param {number} dt @param {number} speed */
  g.userData.update = (dt, speed) => {
    const u = g.userData;
    u.phase += dt * (6 + speed * 3);
    const sw = speed > 0.1 ? Math.sin(u.phase) * 0.7 : 0;
    legs[0].rotation.x = sw; legs[3].rotation.x = sw; legs[1].rotation.x = -sw; legs[2].rotation.x = -sw;
    tail.rotation.z = Math.sin(u.phase * 0.8) * (speed > 0.1 ? 0.2 : 0.6);
    body.position.y = speed > 0.1 ? Math.abs(Math.sin(u.phase)) * 0.03 : 0;
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
