/**
 * The drawing toolkit the world's models and levels share: flat-shaded "toon" materials,
 * crisp pixel-edge lines, and the few shapes WebGL does not give for free (a cabin that
 * tapers, a side-profile car body).
 *
 * The look is pixel art in three dimensions. The scene is drawn small and scaled up with
 * nearest-neighbour filtering (see stage.js), shaded in a handful of hard steps rather than
 * a smooth gradient, and every model of consequence gets a one-pixel dark edge. Colours are
 * only ever palette keys; this file never names one.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

import { world as W } from '../tokens.js';

/** Hard light steps: shadow, mid, lit, highlight. A four-pixel ramp is what makes it read as pixel art. */
const RAMP = (() => {
  const data = new Uint8Array([70, 140, 205, 255]);
  const t = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
})();

const materialCache = new Map();

/**
 * The light on sprites (people), which are drawn unlit: white by day, warm at dusk, blue
 * at night. The stage sets it with the time of day; every sprite multiplies by it.
 */
export const SPRITE_LIGHT = new THREE.Color(1, 1, 1);

/**
 * A flat toon material in one colour, shared by everything that asks for the same one.
 * @param {string} color a CSS colour (always a palette value)
 * @param {{emissive?: string, emissiveIntensity?: number, opacity?: number, side?: number, flat?: boolean, depthWrite?: boolean}} [o]
 * @returns {THREE.MeshToonMaterial}
 */
export function toon(color, o = {}) {
  const key = `${color}|${o.emissive ?? ''}|${o.emissiveIntensity ?? ''}|${o.opacity ?? 1}|${o.side ?? 0}|${o.flat ?? 1}`;
  let m = materialCache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({
      color, gradientMap: RAMP,
      emissive: o.emissive ?? W.black, emissiveIntensity: o.emissiveIntensity ?? 1,
      transparent: (o.opacity ?? 1) < 1, opacity: o.opacity ?? 1,
      side: o.side ?? THREE.FrontSide,
      // Pushes the surface back a hair so the edge lines drawn on top never z-fight.
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    });
    materialCache.set(key, m);
  }
  return m;
}

/** A self-lit material: signs, lamps, screens. @param {string} color @param {number} [opacity] */
export function glow(color, opacity = 1) {
  const key = `glow|${color}|${opacity}`;
  let m = materialCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, toneMapped: false });
    materialCache.set(key, m);
  }
  return m;
}

/** Per-mesh crease lines: off, since the stage outlines the picture as a whole. */
const EDGE_MESHES = false;

const edgeMat = new THREE.LineBasicMaterial({ color: W.outline, transparent: true, opacity: 0.85 });

/**
 * Adds a one-pixel dark edge along the creases of a mesh.
 * @param {THREE.Mesh} mesh
 * @param {number} [angle] degrees of crease that draws a line
 * @returns {THREE.Mesh} the same mesh
 */
export function edged(mesh, angle = 35) {
  // The stage's outline pass draws every edge; a line mesh per box is no longer needed.
  if (!EDGE_MESHES) return mesh;
  const lines = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, angle), edgeMat);
  lines.userData.edge = true;
  mesh.add(lines);
  return mesh;
}

/**
 * A box at a position, in one colour.
 * @param {number} w @param {number} h @param {number} d size
 * @param {string} color
 * @param {{x?: number, y?: number, z?: number, edge?: boolean, cast?: boolean, receive?: boolean, mat?: THREE.Material}} [o]
 */
export function box(w, h, d, color, o = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), o.mat ?? toon(color));
  m.position.set(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  m.castShadow = o.cast !== false;
  m.receiveShadow = o.receive !== false;
  return o.edge === false ? m : edged(m);
}

/**
 * A box with its corners and edges rounded off: people, cushions, tyres' shoulders, anything
 * that should read as a soft toy rather than a crate. `r` defaults to a gentle bevel.
 * @param {number} w @param {number} h @param {number} d size
 * @param {string} color
 * @param {{x?: number, y?: number, z?: number, r?: number, seg?: number, edge?: boolean, cast?: boolean, receive?: boolean, mat?: THREE.Material|THREE.Material[]}} [o] (edge is accepted and ignored: the stage outlines everything)
 */
export function rbox(w, h, d, color, o = {}) {
  const r = Math.min(o.r ?? Math.min(w, h, d) * 0.32, Math.min(w, h, d) / 2 - 0.001);
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, o.seg ?? 2, r), o.mat ?? toon(color));
  m.position.set(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  m.castShadow = o.cast !== false;
  m.receiveShadow = o.receive !== false;
  return m;
}

/** A cylinder standing up, or lying on its X axis. @param {number} rTop @param {number} rBot @param {number} h @param {string} color */
export function cyl(rTop, rBot, h, color, o = {}) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, o.seg ?? 10);
  if (o.axis === 'x') g.rotateZ(Math.PI / 2);
  if (o.axis === 'z') g.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, o.mat ?? toon(color));
  m.position.set(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  m.castShadow = o.cast !== false;
  m.receiveShadow = true;
  return o.edge === false ? m : edged(m, 50);
}

/** A cone/pyramid. @param {number} r @param {number} h @param {string} color */
export function cone(r, h, color, o = {}) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, o.seg ?? 6), toon(color));
  m.position.set(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  m.castShadow = true;
  m.receiveShadow = true;
  return o.edge === false ? m : edged(m, 50);
}

/** A flat plane lying on the ground. @param {number} w @param {number} d @param {string} color */
export function floorPlane(w, d, color, o = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), toon(color));
  m.rotation.x = -Math.PI / 2;
  m.position.set(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  m.receiveShadow = true;
  return m;
}

/**
 * A prism that tapers: a rectangle at the bottom joined to a smaller one at the top, each
 * with its own length range. This is a car's cabin, a roof, a windscreen.
 *
 * @param {{y: number, z0: number, z1: number, w: number}} bottom
 * @param {{y: number, z0: number, z1: number, w: number}} top
 * @returns {THREE.BufferGeometry}
 */
export function loft(bottom, top) {
  const b = bottom;
  const t = top;
  const v = [
    [-b.w / 2, b.y, b.z0], [b.w / 2, b.y, b.z0], [b.w / 2, b.y, b.z1], [-b.w / 2, b.y, b.z1],
    [-t.w / 2, t.y, t.z0], [t.w / 2, t.y, t.z0], [t.w / 2, t.y, t.z1], [-t.w / 2, t.y, t.z1],
  ];
  // Quads, wound outward (counter-clockwise seen from outside).
  const quads = [
    [0, 3, 2, 1], // bottom
    [4, 5, 6, 7], // top
    [0, 1, 5, 4], // back (z0)
    [2, 3, 7, 6], // front (z1)
    [1, 2, 6, 5], // +x side
    [3, 0, 4, 7], // -x side
  ];
  const pos = [];
  for (const q of quads) {
    const [a, c, d, e] = q;
    pos.push(...v[a], ...v[c], ...v[d], ...v[a], ...v[d], ...v[e]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // Plan-view texture coordinates, a metre to half a tile: a roof's shingles line up along its slope.
  const uv = [];
  for (let i = 0; i < pos.length; i += 3) uv.push(pos[i] / 2, (pos[i + 2] + pos[i + 1] * 1.4) / 2);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/**
 * A mesh from a lofted prism.
 * @param {Parameters<typeof loft>[0]} bottom @param {Parameters<typeof loft>[1]} top @param {string} color
 */
export function loftMesh(bottom, top, color, o = {}) {
  const m = new THREE.Mesh(loft(bottom, top), o.mat ?? toon(color, { opacity: o.opacity }));
  m.castShadow = o.cast !== false;
  m.receiveShadow = true;
  return o.edge === false ? m : edged(m, 25);
}

/**
 * A side profile extruded across the car's width. The polygon is in (z, y): z along the
 * car (front is +z), y up.
 *
 * @param {number[][]} pts polygon points [z, y]
 * @param {number} width
 * @param {string} color
 * @param {{mat?: THREE.Material, bevel?: number}} [o] `bevel` rounds the panel's edges by that many metres
 */
export function profileMesh(pts, width, color, o = {}) {
  const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  // A bevel rounds every edge of the panel: a car body with soft shoulders, not a slab.
  const bv = o.bevel ?? 0;
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.01, width - 2 * bv), bevelEnabled: bv > 0, bevelThickness: bv, bevelSize: bv * 0.8, bevelOffset: -bv * 0.8, bevelSegments: 3, steps: 1 });
  g.translate(0, 0, bv > 0 ? 0 : 0);
  g.rotateY(-Math.PI / 2);
  g.translate(width / 2 - bv, 0, 0);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, o.mat ?? toon(color));
  m.castShadow = true;
  m.receiveShadow = true;
  return edged(m, 28);
}

/**
 * A small canvas texture with nearest-neighbour sampling, for faces, plates, signs and
 * shirts. The canvas is drawn at its real tiny size so the pixels stay big.
 *
 * @param {number} w @param {number} h
 * @param {(g: CanvasRenderingContext2D) => void} draw
 * @returns {THREE.CanvasTexture}
 */
export function pixelTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A palette colour a little lighter (+) or darker (-), as a CSS string. @param {string} c @param {number} dl */
export function shade(c, dl) {
  return new THREE.Color(c).offsetHSL(0, 0, dl).getStyle();
}

const patternCache = new Map();

/**
 * Little repeating pixel patterns for walls and roofs: what takes a flat wall from "a coloured
 * box" to "a brick wall". 16 by 16, drawn whole-pixel, repeating every `tile` metres.
 *
 * @param {'brick'|'siding'|'shingle'|'tile'|'plank'|'stucco'|'slate'} kind
 * @param {string} base a palette colour
 * @param {number} [tile] metres per repeat
 * @returns {THREE.MeshToonMaterial}
 */
export function patternMaterial(kind, base, tile = 2) {
  const key = `${kind}|${base}|${tile}`;
  let m = patternCache.get(key);
  if (m) return m;
  const dark = shade(base, -0.09);
  const darker = shade(base, -0.17);
  const light = shade(base, 0.06);
  let seed = kind.length * 977 + base.length * 31;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const tex = pixelTexture(16, 16, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 16, 16);
    if (kind === 'brick') {
      g.fillStyle = darker;
      for (let r = 0; r < 4; r += 1) {
        g.fillRect(0, r * 4 + 3, 16, 1);
        const off = r % 2 ? 4 : 0;
        g.fillRect((off + 0) % 16, r * 4, 1, 3);
        g.fillRect((off + 8) % 16, r * 4, 1, 3);
      }
      g.fillStyle = light;
      for (let i = 0; i < 10; i += 1) g.fillRect(Math.floor(rnd() * 16), Math.floor(rnd() * 4) * 4 + 1, 2, 1);
      g.fillStyle = dark;
      for (let i = 0; i < 8; i += 1) g.fillRect(Math.floor(rnd() * 16), Math.floor(rnd() * 4) * 4 + 2, 2, 1);
    } else if (kind === 'siding') {
      for (let r = 0; r < 4; r += 1) {
        g.fillStyle = light; g.fillRect(0, r * 4, 16, 1);
        g.fillStyle = darker; g.fillRect(0, r * 4 + 3, 16, 1);
        g.fillStyle = dark; g.fillRect(0, r * 4 + 2, 16, 1);
      }
    } else if (kind === 'shingle' || kind === 'slate') {
      for (let r = 0; r < 4; r += 1) {
        const off = r % 2 ? 2 : 0;
        g.fillStyle = darker; g.fillRect(0, r * 4 + 3, 16, 1);
        g.fillStyle = dark;
        for (let x = 0; x < 16; x += 4) g.fillRect((x + off) % 16, r * 4, 1, 3);
        g.fillStyle = light;
        for (let x = 0; x < 16; x += 4) g.fillRect((x + off + 1) % 16, r * 4, 2, 1);
      }
    } else if (kind === 'tile') {
      for (let x = 0; x < 16; x += 4) {
        g.fillStyle = dark; g.fillRect(x, 0, 1, 16);
        g.fillStyle = light; g.fillRect(x + 1, 0, 1, 16);
        g.fillStyle = darker; g.fillRect(x + 3, 0, 1, 16);
      }
    } else if (kind === 'plank') {
      for (let x = 0; x < 16; x += 8) { g.fillStyle = darker; g.fillRect(x, 0, 1, 16); g.fillStyle = light; g.fillRect(x + 1, 0, 1, 16); }
      g.fillStyle = dark;
      for (let i = 0; i < 6; i += 1) g.fillRect(Math.floor(rnd() * 16), Math.floor(rnd() * 15), 1, 2);
    } else {
      g.fillStyle = dark;
      for (let i = 0; i < 26; i += 1) g.fillRect(Math.floor(rnd() * 16), Math.floor(rnd() * 16), 1, 1);
      g.fillStyle = light;
      for (let i = 0; i < 14; i += 1) g.fillRect(Math.floor(rnd() * 16), Math.floor(rnd() * 16), 1, 1);
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  m = new THREE.MeshToonMaterial({ map: tex, gradientMap: RAMP, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  m.userData.tile = tile;
  patternCache.set(key, m);
  return m;
}

/**
 * A box covered in a pattern at true scale: the texture repeats every `tile` metres on every
 * face however big the box is, so a long wall gets more bricks, not bigger ones.
 *
 * @param {number} w @param {number} h @param {number} d
 * @param {Parameters<typeof patternMaterial>[0]} kind @param {string} base
 * @param {{x?: number, y?: number, z?: number, tile?: number, cast?: boolean}} [o]
 */
export function texBox(w, h, d, kind, base, o = {}) {
  const tile = o.tile ?? 2;
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // BoxGeometry builds four vertices per face in this order: +x, -x, +y, -y, +z, -z.
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f += 1) {
    for (let v = 0; v < 4; v += 1) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile, (uv.getY(i) * dims[f][1]) / tile);
    }
  }
  const m = new THREE.Mesh(g, patternMaterial(kind, base, tile));
  m.position.set(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  m.castShadow = o.cast !== false;
  m.receiveShadow = true;
  return m;
}

/**
 * A soft ball of leaves, a bush, a lamp globe: smooth-shaded, a handful of segments.
 * @param {number} r @param {string} color
 * @param {{x?: number, y?: number, z?: number, sy?: number, seg?: number, mat?: THREE.Material}} [o]
 */
export function ball(r, color, o = {}) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, o.seg ?? 10, Math.max(5, Math.round((o.seg ?? 10) * 0.7))), o.mat ?? toon(color));
  m.position.set(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  m.scale.y = o.sy ?? 1;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const groundCache = new Map();

/**
 * A ground plane covered in a small repeating pixel pattern: tiles with grout, speckled
 * asphalt, grass. One mesh however big it is.
 *
 * @param {number} w @param {number} d metres
 * @param {{base: string, alt?: string, line?: string, kind?: 'tile'|'speckle'|'blades', tile?: number, seed?: number, flowers?: string[]}} o
 */
export function groundPlane(w, d, o) {
  const tile = o.tile ?? 2;
  const tex = groundTexture(o);
  const t = tex.clone();
  t.needsUpdate = true;
  t.repeat.set(w / tile, d / tile);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshToonMaterial({ map: t, gradientMap: RAMP }));
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  return m;
}

const groundMats = new Map();

/**
 * The same pixel ground as `groundPlane`, as one shared material for geometry whose UVs are
 * world metres divided by the tile: roads laid as ribbons all share it, so a town of roads
 * is one draw call, and two pieces that overlap show the same texels and never flicker.
 * @param {Parameters<typeof groundPlane>[2]} o
 */
export function groundMaterial(o) {
  const key = `${o.base}|${o.alt}|${o.line}|${o.kind}|${o.flowers ?? ''}`;
  let m = groundMats.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ map: groundTexture(o), gradientMap: RAMP });
    groundMats.set(key, m);
  }
  return m;
}

/** @param {Parameters<typeof groundPlane>[2]} o */
function groundTexture(o) {
  const key = `${o.base}|${o.alt}|${o.line}|${o.kind}|${o.flowers ?? ''}`;
  let tex = groundCache.get(key);
  if (!tex) {
    let seed = o.seed ?? 7;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    tex = pixelTexture(16, 16, (g) => {
      g.fillStyle = o.base;
      g.fillRect(0, 0, 16, 16);
      if (o.kind === 'tile') {
        g.fillStyle = o.alt ?? o.base;
        g.fillRect(0, 0, 8, 8);
        g.fillRect(8, 8, 8, 8);
        g.fillStyle = o.line ?? o.base;
        g.fillRect(0, 0, 16, 1);
        g.fillRect(0, 0, 1, 16);
        g.fillRect(0, 8, 16, 1);
        g.fillRect(8, 0, 1, 16);
      } else {
        g.fillStyle = o.alt ?? o.base;
        const n = o.kind === 'blades' ? 22 : 30;
        for (let i = 0; i < n; i += 1) g.fillRect(Math.floor(rnd() * 16), Math.floor(rnd() * 16), o.kind === 'blades' ? 1 : 1 + Math.floor(rnd() * 2), o.kind === 'blades' ? 2 : 1);
        // Flowers, a few: the dot of colour that makes a lawn look cared for.
        if (o.flowers) for (let i = 0; i < 3; i += 1) { g.fillStyle = o.flowers[i % o.flowers.length]; g.fillRect(Math.floor(rnd() * 15), Math.floor(rnd() * 15), 1, 1); }
      }
    });
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    groundCache.set(key, tex);
  }
  return tex;
}

/**
 * The classic 5x7 bitmap font, one byte per column with the top row in bit 0. Drawn with
 * whole pixels so a sign stays crisp however far away it is; anti-aliased canvas text
 * turns to mush once it is scaled up with nearest-neighbour filtering.
 */
const FONT = {
  ' ': [0, 0, 0, 0, 0], '!': [0, 0, 0x5f, 0, 0], '"': [0, 7, 0, 7, 0], '#': [0x14, 0x7f, 0x14, 0x7f, 0x14], '$': [0x24, 0x2a, 0x7f, 0x2a, 0x12],
  '%': [0x23, 0x13, 8, 0x64, 0x62], '&': [0x36, 0x49, 0x55, 0x22, 0x50], "'": [0, 5, 3, 0, 0], '(': [0, 0x1c, 0x22, 0x41, 0], ')': [0, 0x41, 0x22, 0x1c, 0],
  '*': [0x14, 8, 0x3e, 8, 0x14], '+': [8, 8, 0x3e, 8, 8], ',': [0, 0x50, 0x30, 0, 0], '-': [8, 8, 8, 8, 8], '.': [0, 0x60, 0x60, 0, 0], '/': [0x20, 0x10, 8, 4, 2],
  0: [0x3e, 0x51, 0x49, 0x45, 0x3e], 1: [0, 0x42, 0x7f, 0x40, 0], 2: [0x42, 0x61, 0x51, 0x49, 0x46], 3: [0x21, 0x41, 0x45, 0x4b, 0x31], 4: [0x18, 0x14, 0x12, 0x7f, 0x10],
  5: [0x27, 0x45, 0x45, 0x45, 0x39], 6: [0x3c, 0x4a, 0x49, 0x49, 0x30], 7: [1, 0x71, 9, 5, 3], 8: [0x36, 0x49, 0x49, 0x49, 0x36], 9: [6, 0x49, 0x49, 0x29, 0x1e],
  ':': [0, 0x36, 0x36, 0, 0], '=': [0x14, 0x14, 0x14, 0x14, 0x14], '?': [2, 1, 0x51, 9, 6],
  A: [0x7e, 0x11, 0x11, 0x11, 0x7e], B: [0x7f, 0x49, 0x49, 0x49, 0x36], C: [0x3e, 0x41, 0x41, 0x41, 0x22], D: [0x7f, 0x41, 0x41, 0x22, 0x1c], E: [0x7f, 0x49, 0x49, 0x49, 0x41],
  F: [0x7f, 9, 9, 9, 1], G: [0x3e, 0x41, 0x49, 0x49, 0x7a], H: [0x7f, 8, 8, 8, 0x7f], I: [0, 0x41, 0x7f, 0x41, 0], J: [0x20, 0x40, 0x41, 0x3f, 1], K: [0x7f, 8, 0x14, 0x22, 0x41],
  L: [0x7f, 0x40, 0x40, 0x40, 0x40], M: [0x7f, 2, 0x0c, 2, 0x7f], N: [0x7f, 4, 8, 0x10, 0x7f], O: [0x3e, 0x41, 0x41, 0x41, 0x3e], P: [0x7f, 9, 9, 9, 6], Q: [0x3e, 0x41, 0x51, 0x21, 0x5e],
  R: [0x7f, 9, 0x19, 0x29, 0x46], S: [0x46, 0x49, 0x49, 0x49, 0x31], T: [1, 1, 0x7f, 1, 1], U: [0x3f, 0x40, 0x40, 0x40, 0x3f], V: [0x1f, 0x20, 0x40, 0x20, 0x1f], W: [0x3f, 0x40, 0x38, 0x40, 0x3f],
  X: [0x63, 0x14, 8, 0x14, 0x63], Y: [7, 8, 0x70, 8, 7], Z: [0x61, 0x51, 0x49, 0x45, 0x43],
};

/** The pixel width a string takes in the bitmap font. @param {string} text */
const fontWidth = (text) => Math.max(1, text.length * 6 - 1);

const signCache = new Map();

/**
 * A sign: text on a coloured board, drawn in the bitmap font as a pixel-textured plane
 * facing +z.
 *
 * @param {string} text
 * @param {{w?: number, h?: number, bg?: string, fg?: string, glowing?: boolean}} [o]
 */
export function sign(text, o = {}) {
  const w = o.w ?? 3;
  const h = o.h ?? 0.8;
  const bg = o.bg ?? W.wallBlack;
  const fg = o.fg ?? W.white;
  const t = text.toUpperCase();
  const key = `${t}|${bg}|${fg}`;
  let tex = signCache.get(key);
  if (!tex) {
    const tw = fontWidth(t) + 4;
    const th = 11;
    tex = pixelTexture(tw, th, (g) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, tw, th);
      g.fillStyle = fg;
      [...t].forEach((ch, i) => {
        const cols = FONT[ch] ?? FONT['?'];
        cols.forEach((bits, cx) => {
          for (let ry = 0; ry < 7; ry += 1) if (bits & (1 << ry)) g.fillRect(2 + i * 6 + cx, 2 + ry, 1, 1);
        });
      });
    });
    signCache.set(key, tex);
  }
  // Keep the letters square: shrink the plane to the text's own shape if the board is wider.
  const aspect = (fontWidth(t) + 4) / 11;
  const pw = Math.min(w, h * aspect);
  const ph = pw / aspect;
  const mat = o.glowing ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }) : new THREE.MeshToonMaterial({ map: tex, gradientMap: RAMP });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat);
  m.castShadow = false;
  return m;
}

/**
 * Frees a model's geometry and any per-instance materials. Shared (cached) toon materials
 * are left alone.
 * @param {THREE.Object3D} root
 */
export function disposeTree(root) {
  root.traverse((o) => {
    const mesh = /** @type {THREE.Mesh} */ (o);
    if (mesh.geometry) mesh.geometry.dispose();
  });
}

/** Sets cast/receive shadow on every mesh under a node. @param {THREE.Object3D} root */
export function shadowAll(root, cast = true, receive = true) {
  root.traverse((o) => {
    const m = /** @type {THREE.Mesh} */ (o);
    if (m.isMesh) { m.castShadow = cast; m.receiveShadow = receive; }
  });
}

/**
 * Merge a group of scenery that never moves into a handful of meshes: one per material (and
 * shadow setting), and one line set for every edge. A town of a thousand boxes becomes a few
 * dozen draw calls, which is the difference between a phone keeping up and not.
 *
 * Only meshes and edge lines directly or indirectly under `root` are touched; give it a group
 * that holds nothing that animates, is removed later, or is looked at through a hit test.
 *
 * @param {THREE.Object3D} root
 * @returns {number} how many meshes were merged away
 */
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  /** @type {Map<string, {material: THREE.Material, cast: boolean, receive: boolean, geoms: THREE.BufferGeometry[], lines: boolean}>} */
  const groups = new Map();
  /** @type {THREE.Object3D[]} */
  const doomed = [];
  /** @param {THREE.Object3D} o */
  const visit = (o) => {
    // Anything marked dynamic (a car, a person, a lift, a smoke puff) keeps its own meshes.
    if (o !== root && o.userData?.dynamic) return;
    for (const child of o.children) visit(child);
    const m = /** @type {THREE.Mesh} */ (o);
    const isLine = /** @type {any} */ (o).isLineSegments;
    if (!(m.isMesh || isLine) || Array.isArray(m.material) || !m.geometry || /** @type {any} */ (m.geometry).isInstancedBufferGeometry) return;
    if (!m.visible) return;
    const key = `${m.material.uuid}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}|${isLine ? 'L' : 'M'}`;
    let g = groups.get(key);
    if (!g) { g = { material: m.material, cast: m.castShadow, receive: m.receiveShadow, geoms: [], lines: !!isLine }; groups.set(key, g); }
    const geo = m.geometry.clone();
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    g.geoms.push(geo);
    doomed.push(o);
  };
  visit(root);
  for (const o of doomed) o.removeFromParent();
  let merged = 0;
  for (const g of groups.values()) {
    // Every geometry in a merge must carry the same attributes, so keep only what they all share.
    const common = [...Object.keys(g.geoms[0].attributes)].filter((k) => g.geoms.every((x) => x.attributes[k]));
    for (const geo of g.geoms) for (const k of Object.keys(geo.attributes)) if (!common.includes(k)) geo.deleteAttribute(k);
    const flat = g.geoms.map((x) => (x.index ? x.toNonIndexed() : x));
    const geo = mergeGeometries(flat, false);
    if (!geo) continue;
    const mesh = g.lines ? new THREE.LineSegments(geo, g.material) : new THREE.Mesh(geo, g.material);
    mesh.castShadow = g.cast;
    mesh.receiveShadow = g.receive;
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    root.add(mesh);
    merged += g.geoms.length - 1;
    for (const x of g.geoms) x.dispose();
  }
  return merged;
}

export { THREE };
