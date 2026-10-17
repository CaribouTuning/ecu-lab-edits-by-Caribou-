/**
 * A person: the tuner, a customer, the clerk behind a counter. Built from boxes, dressed
 * from the wardrobe catalogue, and animated by pose (walking, typing, sitting in a car,
 * cheering). Faces forward along +z.
 */

import { world as W } from '../../tokens.js';
import { itemById } from '../appearance.js';
import { THREE, box, cyl, edged, pixelTexture, toon } from '../gfx.js';

const LEG = 0.74;
const TORSO = 0.6;
const SHOULDER = LEG + TORSO;
const HEAD = 0.36;
const HEAD_Y = SHOULDER + 0.03 + HEAD / 2;

const cloth = (key) => W.cloth[key] ?? W.cloth.grey;

const faceCache = new Map();

/**
 * The face on the front of the head: eyes, a mouth, a little colour in the cheeks.
 * @param {string} skin
 * @param {'neutral'|'smile'|'shout'|'worry'} mood
 */
function faceTexture(skin, mood) {
  const key = `${skin}|${mood}`;
  let t = faceCache.get(key);
  if (!t) {
    t = pixelTexture(12, 12, (g) => {
      g.fillStyle = skin;
      g.fillRect(0, 0, 12, 12);
      g.fillStyle = W.cheek;
      g.globalAlpha = 0.45;
      g.fillRect(1, 6, 2, 1);
      g.fillRect(9, 6, 2, 1);
      g.globalAlpha = 1;
      g.fillStyle = W.eye;
      g.fillRect(3, 4, 2, 2);
      g.fillRect(7, 4, 2, 2);
      g.fillStyle = W.mouth;
      if (mood === 'smile') { g.fillRect(4, 8, 4, 1); g.fillRect(3, 7, 1, 1); g.fillRect(8, 7, 1, 1); }
      else if (mood === 'shout') { g.fillRect(4, 8, 4, 2); }
      else if (mood === 'worry') { g.fillRect(4, 8, 4, 1); g.fillRect(3, 9, 1, 1); g.fillRect(8, 9, 1, 1); g.fillStyle = W.eye; g.fillRect(2, 3, 3, 1); g.fillRect(7, 3, 3, 1); }
      else g.fillRect(4, 8, 4, 1);
    });
    faceCache.set(key, t);
  }
  return t;
}

/** A head: skin on every face, the face texture on the front. @param {string} skin @param {'neutral'|'smile'|'shout'|'worry'} mood */
function makeHead(skin, mood) {
  const mats = [0, 1, 2, 3, 4, 5].map((i) => (i === 4 ? new THREE.MeshToonMaterial({ map: faceTexture(skin, mood) }) : toon(skin)));
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z. The front is +z.
  const m = new THREE.Mesh(new THREE.BoxGeometry(HEAD, HEAD, HEAD), mats);
  m.castShadow = true;
  m.receiveShadow = true;
  return edged(m);
}

/** @param {THREE.Group} head @param {string} style @param {string} color */
function addHair(head, style, color) {
  const c = W.hair[color] ?? W.hair.brown;
  const h = HEAD / 2;
  const add = (w, ht, d, x, y, z) => head.add(box(w, ht, d, c, { x, y, z, edge: false }));
  switch (style) {
    case 'bald': break;
    case 'buzz': add(HEAD + 0.02, 0.05, HEAD + 0.02, 0, h + 0.01, 0); add(HEAD + 0.02, 0.1, 0.03, 0, h - 0.03, -h - 0.005); break;
    case 'spiky':
      add(HEAD + 0.03, 0.08, HEAD + 0.03, 0, h + 0.03, 0);
      for (let i = 0; i < 5; i += 1) head.add(cone2(c, -0.14 + i * 0.07, h + 0.12, (i % 2) * 0.06 - 0.03));
      break;
    case 'long': add(HEAD + 0.04, 0.1, HEAD + 0.04, 0, h + 0.04, 0); add(HEAD + 0.04, 0.4, 0.07, 0, -0.04, -h - 0.02); add(0.06, 0.34, HEAD * 0.8, h + 0.02, -0.04, -0.03); add(0.06, 0.34, HEAD * 0.8, -h - 0.02, -0.04, -0.03); break;
    case 'ponytail': add(HEAD + 0.03, 0.09, HEAD + 0.03, 0, h + 0.035, 0); add(0.1, 0.1, 0.1, 0, 0.04, -h - 0.06); add(0.08, 0.26, 0.08, 0, -0.08, -h - 0.1); break;
    case 'mohawk': add(0.08, 0.14, HEAD, 0, h + 0.06, -0.01); add(0.08, 0.09, 0.08, 0, 0.02, -h - 0.03); break;
    case 'afro': add(HEAD + 0.22, 0.26, HEAD + 0.22, 0, h + 0.07, -0.03); break;
    case 'bun': add(HEAD + 0.03, 0.09, HEAD + 0.03, 0, h + 0.035, 0); add(0.16, 0.16, 0.16, 0, h + 0.14, -0.04); break;
    case 'slick': add(HEAD + 0.03, 0.08, HEAD + 0.03, 0, h + 0.03, -0.01); add(HEAD + 0.03, 0.2, 0.06, 0, h - 0.07, -h - 0.015); break;
    case 'curly':
      add(HEAD + 0.03, 0.08, HEAD + 0.03, 0, h + 0.03, 0);
      for (let i = 0; i < 8; i += 1) add(0.1, 0.1, 0.1, ((i % 4) - 1.5) * 0.1, h + 0.1, (Math.floor(i / 4) - 0.5) * 0.14);
      break;
    default: add(HEAD + 0.03, 0.09, HEAD + 0.03, 0, h + 0.035, 0); add(HEAD + 0.03, 0.12, 0.04, 0, h - 0.06, -h - 0.01); add(0.04, 0.1, HEAD * 0.6, h + 0.01, h - 0.07, -0.05); add(0.04, 0.1, HEAD * 0.6, -h - 0.01, h - 0.07, -0.05);
  }
}

/** A hair spike. @param {string} color @param {number} x @param {number} y @param {number} z */
function cone2(color, x, y, z) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 4), toon(color));
  m.position.set(x, y, z);
  return m;
}

/** Hair hides under these. */
const COVERS_HAIR = new Set(['beanie', 'helmet', 'fullhelmet', 'hardhat', 'tophat']);

/** @param {THREE.Group} head @param {import('../appearance.js').Item} it */
function addHat(head, it) {
  const c = cloth(it.color);
  const a = cloth(it.accent ?? it.color);
  const h = HEAD / 2;
  const add = (w, ht, d, x, y, z, col = c) => head.add(box(w, ht, d, col, { x, y, z, edge: false }));
  switch (it.style) {
    case 'cap': add(HEAD + 0.05, 0.12, HEAD + 0.05, 0, h + 0.04, 0); add(HEAD, 0.03, 0.2, 0, h - 0.01, h + 0.12, a === c ? W.cloth.black : a); break;
    case 'beanie': add(HEAD + 0.06, 0.2, HEAD + 0.06, 0, h + 0.07, 0); add(HEAD + 0.08, 0.06, HEAD + 0.08, 0, h - 0.03, 0, a); break;
    case 'bucket': add(HEAD + 0.06, 0.13, HEAD + 0.06, 0, h + 0.05, 0); add(HEAD + 0.3, 0.025, HEAD + 0.3, 0, h - 0.01, 0); break;
    case 'hardhat': add(HEAD + 0.07, 0.15, HEAD + 0.07, 0, h + 0.06, 0); add(HEAD + 0.1, 0.025, HEAD + 0.1, 0, h - 0.01, 0.02); add(0.06, 0.04, HEAD + 0.07, 0, h + 0.15, 0); break;
    case 'bandana': add(HEAD + 0.04, 0.09, HEAD + 0.04, 0, h - 0.02, 0); add(0.12, 0.12, 0.05, 0.1, h - 0.06, -h - 0.05); break;
    case 'headband': add(HEAD + 0.03, 0.05, HEAD + 0.03, 0, h - 0.06, 0); break;
    case 'helmet': add(HEAD + 0.1, 0.2, HEAD + 0.1, 0, h + 0.03, -0.03); add(HEAD + 0.1, 0.2, 0.08, 0, -0.06, -h - 0.04); add(0.04, 0.1, HEAD + 0.12, 0, h + 0.15, -0.02, a); break;
    case 'fullhelmet': add(HEAD + 0.12, HEAD + 0.12, HEAD + 0.1, 0, 0.0, -0.02); add(HEAD, 0.12, 0.04, 0, 0.03, h + 0.04, W.cloth.black); add(HEAD + 0.12, 0.04, 0.04, 0, 0.1, h + 0.03, a); break;
    case 'tophat': add(HEAD + 0.22, 0.03, HEAD + 0.22, 0, h + 0.01, 0); add(HEAD, 0.3, HEAD, 0, h + 0.17, 0); add(HEAD + 0.02, 0.05, HEAD + 0.02, 0, h + 0.06, 0, a); break;
    default: break;
  }
}

/** @param {THREE.Group} head @param {import('../appearance.js').Item} it */
function addGlasses(head, it) {
  const c = cloth(it.color);
  const h = HEAD / 2;
  const z = h + 0.01;
  const lens = (x, w = 0.12, col = /** @type {string} */ (W.glassDark), y = 0.02) => head.add(box(w, 0.08, 0.02, col, { x, y, z, edge: false }));
  switch (it.style) {
    case 'shades': lens(-0.085, 0.13, W.cloth.black); lens(0.085, 0.13, W.cloth.black); head.add(box(0.05, 0.02, 0.02, W.cloth.black, { y: 0.045, z, edge: false })); break;
    case 'aviator': lens(-0.085, 0.13, W.glassDark); lens(0.085, 0.13, W.glassDark); head.add(box(0.36, 0.015, 0.02, c, { y: 0.065, z, edge: false })); break;
    case 'round': lens(-0.085, 0.1, W.glass); lens(0.085, 0.1, W.glass); head.add(box(0.36, 0.012, 0.02, W.cloth.black, { y: 0.06, z, edge: false })); break;
    case 'safety': lens(0, 0.3, W.glass); head.add(box(HEAD + 0.02, 0.03, HEAD + 0.02, W.cloth.sky, { y: 0.05, edge: false })); break;
    case 'goggles': lens(0, 0.3, c); head.add(box(HEAD + 0.03, 0.05, HEAD + 0.03, W.cloth.black, { y: 0.02, edge: false })); break;
    case 'visor': lens(0, 0.32, c); break;
    default: break;
  }
}

/** Pieces that sit on the torso. @param {THREE.Group} torso @param {import('../appearance.js').Item} it */
function addExtra(torso, it) {
  const c = cloth(it.color);
  const a = cloth(it.accent ?? it.color);
  const add = (w, h, d, x, y, z, col = c) => torso.add(box(w, h, d, col, { x, y, z, edge: false }));
  switch (it.style) {
    case 'toolbelt': add(0.5, 0.07, 0.32, 0, -TORSO / 2 + 0.05, 0, c); add(0.1, 0.16, 0.08, 0.2, -TORSO / 2 - 0.06, 0.15, a); add(0.1, 0.14, 0.08, -0.2, -TORSO / 2 - 0.05, 0.15, a); add(0.04, 0.22, 0.04, 0.27, -TORSO / 2 - 0.1, 0.12, W.cloth.silver); break;
    case 'backpack': add(0.38, 0.46, 0.2, 0, 0.02, -0.23, c); add(0.08, 0.4, 0.04, 0.14, 0.02, 0.14, W.cloth.black); add(0.08, 0.4, 0.04, -0.14, 0.02, 0.14, W.cloth.black); break;
    case 'scarf': add(0.5, 0.1, 0.32, 0, TORSO / 2 - 0.02, 0); add(0.11, 0.34, 0.05, 0.12, TORSO / 2 - 0.2, 0.17); break;
    case 'chain': add(0.3, 0.025, 0.02, 0, TORSO / 2 - 0.07, 0.14, c); add(0.04, 0.12, 0.02, 0.08, TORSO / 2 - 0.13, 0.14, c); add(0.04, 0.12, 0.02, -0.08, TORSO / 2 - 0.13, 0.14, c); add(0.09, 0.09, 0.03, 0, TORSO / 2 - 0.2, 0.15, c); break;
    case 'cape': add(0.5, 0.95, 0.04, 0, -0.15, -0.17, c); add(0.5, 0.06, 0.05, 0, 0.23, -0.17, a); add(0.5, 0.06, 0.05, 0, -0.62, -0.17, a); break;
    default: break;
  }
}

/** The torso and arms for a top. */
function dressTop(parts, it, skin) {
  const c = cloth(it.color);
  const a = cloth(it.accent ?? it.color);
  const { torso, armL, armR } = parts;
  const longSleeve = !['tee', 'tank', 'polo', 'vest'].includes(it.style);
  const torsoCol = it.style === 'vest' ? W.cloth.white : c;
  torso.add(box(0.46, TORSO, 0.26, torsoCol, { y: 0, edge: true }));
  const add = (w, h, d, x, y, z, col = a) => torso.add(box(w, h, d, col, { x, y, z, edge: false }));
  switch (it.style) {
    case 'polo': add(0.2, 0.06, 0.28, 0, TORSO / 2 - 0.03, 0.01); add(0.04, 0.12, 0.02, 0, TORSO / 2 - 0.1, 0.14, W.cloth.white); break;
    case 'hoodie': add(0.34, 0.1, 0.1, 0, TORSO / 2, -0.12, c); add(0.3, 0.14, 0.02, 0, -0.14, 0.14, a === c ? W.cloth.black : a); add(0.01, 0.2, 0.02, -0.07, TORSO / 2 - 0.12, 0.14, W.cloth.white); add(0.01, 0.2, 0.02, 0.07, TORSO / 2 - 0.12, 0.14, W.cloth.white); break;
    case 'vest': add(0.46, 0.06, 0.27, 0, 0.02, 0, c); add(0.14, TORSO, 0.27, 0.16, 0, 0, c); add(0.14, TORSO, 0.27, -0.16, 0, 0, c); add(0.47, 0.04, 0.275, 0, -0.1, 0, a); break;
    case 'jacket': add(0.04, TORSO, 0.27, 0, 0, 0, a); add(0.47, 0.06, 0.27, 0, -TORSO / 2 + 0.03, 0, a); add(0.4, 0.07, 0.3, 0, TORSO / 2 - 0.03, 0, c); break;
    case 'coverall': add(0.47, 0.04, 0.27, 0, -0.02, 0, a); add(0.12, 0.12, 0.02, 0.12, 0.12, 0.14, a); add(0.04, TORSO, 0.27, 0, 0, 0, W.cloth.silver); break;
    case 'racing': add(0.06, TORSO, 0.27, 0.17, 0, 0, a); add(0.06, TORSO, 0.27, -0.17, 0, 0, a); add(0.14, 0.1, 0.02, 0, 0.14, 0.14, W.cloth.blue); add(0.12, 0.08, 0.02, 0.12, -0.1, 0.14, W.cloth.yellow); break;
    case 'labcoat': add(0.47, 0.34, 0.27, 0, -0.34, 0, c); add(0.06, TORSO + 0.34, 0.27, 0, -0.17, 0.01, a); add(0.1, 0.12, 0.02, -0.15, -0.1, 0.14, a); break;
    case 'blazer': add(0.12, TORSO - 0.1, 0.27, 0.09, 0, 0, a); add(0.12, TORSO - 0.1, 0.27, -0.09, 0, 0, a); add(0.04, 0.5, 0.275, 0, -0.04, 0, W.cloth.white); break;
    case 'shirt': add(0.46, 0.04, 0.27, 0, 0.1, 0); add(0.46, 0.04, 0.27, 0, -0.08, 0); add(0.46, 0.04, 0.27, 0, -0.22, 0); add(0.14, 0.05, 0.28, 0, TORSO / 2 - 0.025, 0, W.cloth.white); break;
    default: break;
  }
  for (const [arm, side] of [[armL, 1], [armR, -1]]) {
    const upper = longSleeve ? 0.58 : it.style === 'tank' ? 0 : 0.24;
    if (upper > 0) {
      const m = box(0.13, upper, 0.13, it.style === 'vest' ? W.cloth.white : c, { y: -upper / 2 + 0.04, edge: false });
      arm.add(m);
      if (longSleeve && ['jacket', 'racing', 'coverall'].includes(it.style)) arm.add(box(0.135, 0.05, 0.135, a, { y: -0.5, edge: false }));
      if (it.style === 'racing') arm.add(box(0.136, 0.05, 0.136, a, { y: -0.18 * side * side, edge: false }));
    }
    const skinLen = 0.58 - upper;
    if (skinLen > 0.01) arm.add(box(0.115, skinLen, 0.115, skin, { y: -upper - skinLen / 2 + 0.04, edge: false }));
  }
}

function dressBottom(parts, it, skin) {
  const c = cloth(it.color);
  const a = it.accent ? cloth(it.accent) : null;
  for (const [leg, side] of [[parts.legL, 1], [parts.legR, -1]]) {
    const len = it.style === 'short' ? 0.34 : LEG - 0.08;
    leg.add(box(0.19, len, 0.2, c, { y: -len / 2, edge: true }));
    if (it.style === 'short') leg.add(box(0.15, LEG - 0.08 - len, 0.15, skin, { y: -len - (LEG - 0.08 - len) / 2, edge: false }));
    if (a) leg.add(box(0.02, len, 0.05, a, { x: 0.1 * side, y: -len / 2, edge: false }));
  }
  parts.hips.add(box(0.46, 0.14, 0.27, c, { y: -0.02, edge: false }));
}

function dressShoes(parts, it) {
  const c = cloth(it.color);
  const a = cloth(it.accent ?? 'black');
  for (const leg of [parts.legL, parts.legR]) {
    const bootH = it.style === 'boot' ? 0.2 : it.style === 'hightop' ? 0.16 : 0;
    if (bootH) leg.add(box(0.2, bootH, 0.21, c, { y: -LEG + 0.08 + bootH / 2, edge: false }));
    if (it.style === 'slide') { leg.add(box(0.19, 0.04, 0.34, c, { y: -LEG + 0.02, z: 0.06, edge: false })); continue; }
    leg.add(box(0.2, 0.1, 0.34, c, { y: -LEG + 0.05, z: 0.06, edge: true }));
    leg.add(box(0.205, 0.03, 0.345, a, { y: -LEG + 0.015, z: 0.06, edge: false }));
  }
}

/**
 * Builds a person.
 *
 * @param {import('../appearance.js').Look} look
 * @param {{scale?: number, mood?: 'neutral'|'smile'|'shout'|'worry'}} [opts]
 */
export function makePerson(look, opts = {}) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const rig = {
    group, body, look, mood: opts.mood ?? 'neutral', phase: Math.random() * 6, pose: 'idle', poseT: 0, speed: 0,
    /** @type {any} */ parts: null,
  };

  function build() {
    while (body.children.length) {
      const k = body.children[0];
      body.remove(k);
      k.traverse((o) => { const m = /** @type {THREE.Mesh} */ (o); if (m.geometry) m.geometry.dispose(); });
    }
    const skin = W.skin[look.skin] ?? W.skin[1];
    const hips = new THREE.Group();
    hips.position.y = LEG;
    body.add(hips);
    const legL = new THREE.Group(); legL.position.set(0.12, 0, 0);
    const legR = new THREE.Group(); legR.position.set(-0.12, 0, 0);
    hips.add(legL, legR);
    const torso = new THREE.Group();
    torso.position.y = LEG + TORSO / 2;
    body.add(torso);
    const armL = new THREE.Group(); armL.position.set(0.3, SHOULDER - 0.04, 0);
    const armR = new THREE.Group(); armR.position.set(-0.3, SHOULDER - 0.04, 0);
    body.add(armL, armR);
    const head = new THREE.Group();
    head.position.y = HEAD_Y;
    body.add(head);
    head.add(makeHead(skin, rig.mood));
    // Skin underneath everything, so a short sleeve or short trousers shows a limb.
    const parts = { hips, legL, legR, torso, armL, armR, head };
    for (const leg of [legL, legR]) leg.add(box(0.15, LEG - 0.08, 0.15, skin, { y: -(LEG - 0.08) / 2, edge: false }));
    // The hands: gloves recolour them.
    const gloves = look.extra ? itemById(look.extra) : null;
    for (const arm of [armL, armR]) arm.add(box(0.12, 0.12, 0.12, gloves?.style === 'gloves' ? cloth(gloves.color) : skin, { y: -0.58 + 0.04, edge: false }));
    const top = itemById(look.top) ?? itemById('tee-white');
    const bottom = itemById(look.bottom) ?? itemById('jeans');
    const shoes = itemById(look.shoes) ?? itemById('sneakers');
    dressBottom(parts, bottom, skin);
    dressShoes(parts, shoes);
    dressTop(parts, top, skin);
    const hat = look.hat ? itemById(look.hat) : null;
    if (!(hat && COVERS_HAIR.has(hat.style))) addHair(head, look.hair, look.hairColor);
    if (hat) addHat(head, hat);
    if (look.glasses) { const g = itemById(look.glasses); if (g) addGlasses(head, g); }
    if (look.extra) {
      const ex = itemById(look.extra);
      if (ex?.style === 'headset') {
        const c = cloth(ex.color);
        head.add(box(HEAD + 0.12, 0.04, 0.05, c, { y: HEAD / 2 + 0.05, edge: false }));
        head.add(box(0.07, 0.12, 0.1, c, { x: HEAD / 2 + 0.06, y: 0, edge: false }), box(0.07, 0.12, 0.1, c, { x: -HEAD / 2 - 0.06, y: 0, edge: false }));
        head.add(box(0.02, 0.02, 0.12, c, { x: HEAD / 2 + 0.06, y: -0.1, z: 0.07, edge: false }));
      } else if (ex) addExtra(torso, ex);
    }
    rig.parts = parts;
    body.traverse((o) => { const m = /** @type {THREE.Mesh} */ (o); if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  }

  build();
  group.scale.setScalar(opts.scale ?? 1);

  /** Re-dress the same character. @param {import('../appearance.js').Look} next */
  rig.setLook = (next) => { rig.look = next; look = next; build(); };

  /** @param {'neutral'|'smile'|'shout'|'worry'} m */
  rig.setMood = (m) => { if (m !== rig.mood) { rig.mood = m; build(); } };

  /** @param {string} p one of idle walk run type sit wave cheer think point */
  rig.setPose = (p) => { if (rig.pose !== p) { rig.pose = p; rig.poseT = 0; } };

  /**
   * @param {number} dt seconds
   * @param {number} [speed] metres per second, for the walk cycle
   */
  rig.update = (dt, speed = 0) => {
    const { hips, legL, legR, torso, armL, armR, head } = rig.parts;
    rig.poseT += dt;
    rig.speed = speed;
    let pose = rig.pose;
    if ((pose === 'idle' || pose === 'walk' || pose === 'run') && speed > 0.15) pose = speed > 4 ? 'run' : 'walk';
    else if (pose === 'walk' || pose === 'run') pose = 'idle';
    const t = rig.poseT;
    const reset = () => {
      legL.rotation.set(0, 0, 0); legR.rotation.set(0, 0, 0);
      armL.rotation.set(0, 0, 0); armR.rotation.set(0, 0, 0);
      torso.rotation.set(0, 0, 0); head.rotation.set(0, 0, 0);
      body.position.set(0, 0, 0); hips.rotation.set(0, 0, 0);
    };
    reset();
    if (pose === 'walk' || pose === 'run') {
      const run = pose === 'run';
      rig.phase += dt * (run ? 11 : 8) * Math.min(1.4, 0.7 + speed * 0.12);
      const s = Math.sin(rig.phase);
      const amp = run ? 1.0 : 0.65;
      legL.rotation.x = s * amp; legR.rotation.x = -s * amp;
      armL.rotation.x = -s * amp * 0.9; armR.rotation.x = s * amp * 0.9;
      body.position.y = Math.abs(Math.cos(rig.phase)) * (run ? 0.08 : 0.04);
      torso.rotation.y = s * 0.12; head.rotation.y = -s * 0.06;
      if (run) torso.rotation.x = 0.12;
    } else if (pose === 'type') {
      armL.rotation.x = -1.1 + Math.sin(t * 14) * 0.08; armR.rotation.x = -1.1 + Math.cos(t * 12) * 0.08;
      head.rotation.x = 0.2; torso.rotation.x = 0.08;
    } else if (pose === 'sit') {
      legL.rotation.x = -1.45; legR.rotation.x = -1.45;
      armL.rotation.x = -1.2; armR.rotation.x = -1.2;
      body.position.y = -0.28;
    } else if (pose === 'wave') {
      armL.rotation.z = -2.5 + Math.sin(t * 9) * 0.3; armR.rotation.x = 0;
      head.rotation.z = Math.sin(t * 3) * 0.05;
    } else if (pose === 'cheer') {
      body.position.y = Math.abs(Math.sin(t * 8)) * 0.15;
      armL.rotation.z = -2.7; armR.rotation.z = 2.7; armL.rotation.x = Math.sin(t * 8) * 0.2; armR.rotation.x = Math.sin(t * 8) * 0.2;
      head.rotation.x = -0.2;
    } else if (pose === 'think') {
      armR.rotation.x = -2.0; armR.rotation.z = 0.3; head.rotation.x = 0.15; head.rotation.y = Math.sin(t * 1.2) * 0.2;
    } else if (pose === 'point') {
      armL.rotation.x = -1.57; head.rotation.y = -0.2;
    } else if (pose === 'lookUnder') {
      head.rotation.x = 0.35; torso.rotation.x = 0.28; armL.rotation.x = -0.4; armR.rotation.x = -0.4;
    } else {
      // breathing
      const b = Math.sin(t * 2 + rig.phase) * 0.012;
      torso.scale.y = 1 + b; armL.rotation.z = 0.04 + b; armR.rotation.z = -0.04 - b;
      head.rotation.y = Math.sin(t * 0.6 + rig.phase) * 0.15;
    }
    if (pose !== 'idle') torso.scale.y = 1;
  };

  return rig;
}

export { cyl };
