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
      emissive: o.emissive ?? '#000000', emissiveIntensity: o.emissiveIntensity ?? 1,
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

const edgeMat = new THREE.LineBasicMaterial({ color: W.outline, transparent: true, opacity: 0.85 });

/**
 * Adds a one-pixel dark edge along the creases of a mesh.
 * @param {THREE.Mesh} mesh
 * @param {number} [angle] degrees of crease that draws a line
 * @returns {THREE.Mesh} the same mesh
 */
export function edged(mesh, angle = 35) {
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
 */
export function profileMesh(pts, width, color, o = {}) {
  const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, steps: 1 });
  g.rotateY(-Math.PI / 2);
  g.translate(width / 2, 0, 0);
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

const groundCache = new Map();

/**
 * A ground plane covered in a small repeating pixel pattern: tiles with grout, speckled
 * asphalt, grass. One mesh however big it is.
 *
 * @param {number} w @param {number} d metres
 * @param {{base: string, alt?: string, line?: string, kind?: 'tile'|'speckle'|'blades', tile?: number, seed?: number}} o
 */
export function groundPlane(w, d, o) {
  const tile = o.tile ?? 2;
  const key = `${o.base}|${o.alt}|${o.line}|${o.kind}`;
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
      }
    });
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    groundCache.set(key, tex);
  }
  const t = tex.clone();
  t.needsUpdate = true;
  t.repeat.set(w / tile, d / tile);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshToonMaterial({ map: t, gradientMap: RAMP }));
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  return m;
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

export { THREE };
