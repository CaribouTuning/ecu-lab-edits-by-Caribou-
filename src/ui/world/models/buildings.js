/**
 * Buildings for the town and the shops: a box with a flat or pitched roof, a door, windows
 * that light up at night, an awning and a sign. Group origin is the middle of the base;
 * the front (the door side) faces +z.
 */

import { world as W } from '../../tokens.js';
import { THREE, box, cone, glow, loftMesh, sign, toon } from '../gfx.js';

/**
 * @typedef {object} BuildingSpec
 * @property {number} w width (x)
 * @property {number} d depth (z)
 * @property {number} h wall height
 * @property {string} [wall] a `world` colour
 * @property {string} [trim]
 * @property {string} [roof]
 * @property {'flat'|'gable'|'sawtooth'} [roofKind]
 * @property {number} [doorX] door centre along the front, local x
 * @property {number} [doorW]
 * @property {string} [doorColor]
 * @property {string} [text] sign text
 * @property {string} [signColor] sign board colour
 * @property {string|null} [awning] awning colour
 * @property {number} [winRows]
 * @property {number} [winCols]
 * @property {boolean} [night] windows lit
 * @property {boolean} [shopfront] big glass front instead of small windows
 * @property {boolean} [open] no front wall (a canopy or bay): the interior shows
 */

/** @param {BuildingSpec} s */
export function makeBuilding(s) {
  const g = new THREE.Group();
  const wall = s.wall ?? W.plaster;
  const trim = s.trim ?? W.plasterDark;
  const roof = s.roof ?? W.roof;
  const { w, d, h } = s;
  const doorW = s.doorW ?? 2.2;
  const doorX = s.doorX ?? 0;
  g.add(box(w, h, d, wall, { y: h / 2 }));
  // Plinth and cornice.
  g.add(box(w + 0.2, 0.5, d + 0.2, trim, { y: 0.25, edge: false }));
  g.add(box(w + 0.4, 0.35, d + 0.4, trim, { y: h + 0.17 }));
  // Roof.
  if (s.roofKind === 'gable') {
    const slab = loftMesh({ y: h + 0.35, z0: -d / 2 - 0.4, z1: d / 2 + 0.4, w: w + 0.8 }, { y: h + 0.35 + Math.min(3, w * 0.18), z0: -d / 2 - 0.4, z1: d / 2 + 0.4, w: 0.4 }, roof, { edge: true });
    g.add(slab);
  } else if (s.roofKind === 'sawtooth') {
    for (let i = 0; i < Math.floor(w / 4); i += 1) g.add(box(3.6, 0.9, d - 1, roof, { x: -w / 2 + 2 + i * 4, y: h + 0.8, edge: false }));
    g.add(box(w, 0.25, d, roof, { y: h + 0.4, edge: false }));
  } else {
    g.add(box(w - 0.2, 0.3, d - 0.2, roof, { y: h + 0.5, edge: false }));
    // A little rooftop clutter: an air-conditioner and a vent.
    g.add(box(1.6, 0.8, 1.2, W.metal, { x: w * 0.25, y: h + 0.9, z: -d * 0.15 }));
    g.add(box(0.5, 0.9, 0.5, W.metalDark, { x: -w * 0.3, y: h + 0.95, z: d * 0.1, edge: false }));
  }
  // Door.
  const dg = new THREE.Group();
  dg.position.set(doorX, 0, d / 2);
  dg.add(box(doorW + 0.4, 2.8, 0.2, trim, { y: 1.4, z: 0.02, edge: false }));
  dg.add(box(doorW, 2.5, 0.22, s.doorColor ?? W.door, { y: 1.25, z: 0.04 }));
  dg.add(box(doorW * 0.7, 1.0, 0.24, W.doorGlass, { y: 1.7, z: 0.05, edge: false }));
  dg.add(box(0.12, 0.12, 0.28, W.metalLight, { x: doorW * 0.32, y: 1.2, z: 0.08, edge: false }));
  g.add(dg);
  // Windows.
  const winMat = s.night ? glow(W.glassNight) : toon(W.glass);
  const dark = toon(W.glassDark);
  if (s.shopfront) {
    const side = (cx, cw) => {
      g.add(box(cw, 2.3, 0.12, W.metalDark, { x: cx, y: 1.7, z: d / 2 + 0.02, edge: false }));
      const m = new THREE.Mesh(new THREE.BoxGeometry(cw - 0.25, 2.05, 0.1), winMat);
      m.position.set(cx, 1.7, d / 2 + 0.07);
      g.add(m);
    };
    const leftW = doorX - doorW / 2 - 0.7 + w / 2;
    const rightW = w / 2 - (doorX + doorW / 2 + 0.7);
    if (leftW > 1.2) side(-w / 2 + 0.4 + leftW / 2 - 0.2, leftW - 0.4);
    if (rightW > 1.2) side(w / 2 - 0.4 - rightW / 2 + 0.2, rightW - 0.4);
  } else {
    const rows = s.winRows ?? Math.max(1, Math.floor((h - 3) / 2.6));
    const cols = s.winCols ?? Math.max(2, Math.floor(w / 4));
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const x = -w / 2 + (w / cols) * (c + 0.5);
        const y = 3.6 + r * 2.6;
        if (y > h - 1) continue;
        if (r === 0 && Math.abs(x - doorX) < doorW) continue;
        g.add(box(1.5, 1.5, 0.14, W.metalDark, { x, y, z: d / 2 + 0.02, edge: false }));
        const m = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 0.1), (c + r * 3) % 3 === 0 && !s.night ? dark : winMat);
        m.position.set(x, y, d / 2 + 0.08);
        g.add(m);
      }
    }
    // Windows on the side walls too, so the building looks like a building from the camera.
    for (const sx of [-1, 1]) for (let c = 0; c < Math.floor(d / 4); c += 1) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.3, 1.3), s.night ? glow(W.glassNight) : dark);
      m.position.set(sx * (w / 2 + 0.03), 3.6, -d / 2 + (d / Math.floor(d / 4)) * (c + 0.5));
      g.add(m);
    }
  }
  // Awning over the door.
  if (s.awning) {
    const aw = loftMesh({ y: 3.1, z0: d / 2, z1: d / 2 + 1.6, w: Math.min(w - 1, doorW + 3.5) }, { y: 2.7, z0: d / 2 + 0.2, z1: d / 2 + 1.6, w: Math.min(w - 1, doorW + 3.5) }, s.awning, { edge: true });
    aw.position.x = doorX;
    g.add(aw);
  }
  // Sign.
  if (s.text) {
    const bw = Math.min(w - 1, Math.max(3, s.text.length * 0.55 + 1));
    g.add(box(bw + 0.3, 1.05, 0.24, s.signColor ?? W.wallBlack, { x: doorX, y: Math.max(h - 0.9, 4.2) + (s.shopfront ? -0.4 : 0.4), z: d / 2 + 0.16 }));
    const sg = sign(s.text, { w: bw, h: 0.8, bg: s.signColor ?? W.wallBlack, fg: W.white, glowing: !!s.night });
    sg.position.set(doorX, Math.max(h - 0.9, 4.2) + (s.shopfront ? -0.4 : 0.4), d / 2 + 0.3);
    g.add(sg);
  }
  g.userData = { door: { x: doorX, z: d / 2 }, w, d, h };
  return g;
}

/** A petrol-station canopy with pumps. Faces +z. */
export function makeGasStation(w = 16, d = 12) {
  const g = new THREE.Group();
  for (const x of [-w / 2 + 1, w / 2 - 1]) for (const z of [-d / 2 + 1, d / 2 - 1]) g.add(box(0.4, 4.6, 0.4, W.metalLight, { x, y: 2.3, z }));
  g.add(box(w, 0.7, d, W.toolRed, { y: 4.9 }));
  g.add(box(w - 0.4, 0.2, d - 0.4, W.white, { y: 4.52, edge: false }));
  const s = sign('FUEL', { w: 3, h: 0.5, bg: W.toolRed, fg: W.white });
  s.position.set(0, 4.95, d / 2 + 0.06);
  g.add(s);
  for (const x of [-w / 4, w / 4]) {
    g.add(box(0.9, 0.2, 2.2, W.concreteLight, { x, y: 0.1, edge: false }));
    g.add(box(0.5, 1.5, 0.5, W.toolRed, { x, y: 0.95 }));
    g.add(box(0.4, 0.4, 0.06, W.screenOff, { x, y: 1.3, z: 0.28, edge: false }));
    g.add(box(0.3, 0.3, 0.05, W.screen, { x, y: 1.3, z: 0.3, mat: glow(W.screen), edge: false }));
    g.add(box(0.08, 0.5, 0.08, W.black, { x: x + 0.28, y: 0.85, z: 0.1, edge: false }));
  }
  return g;
}

/** A tall pylon sign, for a showroom or a track. @param {string} text @param {string} color */
export function makePylon(text, color) {
  const g = new THREE.Group();
  g.add(box(0.5, 6, 0.5, W.metalDark, { y: 3 }));
  g.add(box(4.2, 1.4, 0.4, color, { y: 6.4 }));
  const s = sign(text, { w: 3.9, h: 1.0, bg: color, fg: W.white });
  s.position.set(0, 6.4, 0.22);
  g.add(s);
  return g;
}

export { cone };
