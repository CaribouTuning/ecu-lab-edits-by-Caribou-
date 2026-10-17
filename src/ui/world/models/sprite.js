/**
 * Pixel-art sprites in the 3-D world: a sheet of frames painted texel by texel, shown on
 * a card that turns to face the camera, with a soft blob of shadow on the floor.
 *
 * A sheet has one row per view (front, back, side facing screen right) and one column per
 * frame. Which row shows is worked out at draw time from where the camera stands relative
 * to the way the owner faces, so a sprite turns as the camera, or the sprite, goes round;
 * the left-facing side view is the right-facing one mirrored.
 */

import { world as W } from '../../tokens.js';
import { SPRITE_LIGHT, THREE } from '../gfx.js';

/** A tiny raster: a colour (or nothing) per texel. @param {number} w @param {number} h */
export function raster(w, h) {
  /** @type {(string|null)[]} */
  const px = new Array(w * h).fill(null);
  const r = {
    w, h, px,
    /** @param {number} x @param {number} y @param {string|null} c */
    set(x, y, c) { if (x >= 0 && y >= 0 && x < w && y < h) px[y * w + x] = c; },
    /** @param {number} x @param {number} y */
    get(x, y) { return x >= 0 && y >= 0 && x < w && y < h ? px[y * w + x] : null; },
    /** Fill a rectangle, inclusive. @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 @param {string|null} c */
    rect(x0, y0, x1, y1, c) { for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) r.set(x, y, c); },
  };
  return r;
}

const toneCache = new Map();
/** A palette colour a touch lighter or darker, as a CSS string. @param {string} c @param {number} dl */
export function tone(c, dl) {
  const key = `${c}|${dl}`;
  let v = toneCache.get(key);
  if (!v) { v = new THREE.Color(c).offsetHSL(0, dl < 0 ? 0.04 : -0.02, dl).getStyle(); toneCache.set(key, v); }
  return v;
}

/**
 * Light from the top left: each colour run gets a darker right and bottom edge and a
 * brighter top-left texel, then the figure gets a one-texel dark outline. This is what
 * makes a flat drawing read as a rounded figure.
 * @param {ReturnType<typeof raster>} r
 */
export function finish(r) {
  const { w, h } = r;
  const src = r.px.slice();
  const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? src[y * w + x] : null);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const c = at(x, y);
      if (!c) continue;
      if (!at(x + 1, y) || !at(x, y + 1)) r.set(x, y, tone(c, -0.1));
      else if (!at(x, y - 1) && at(x - 1, y)) r.set(x, y, tone(c, 0.07));
    }
  }
  const shaded = r.px.slice();
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (shaded[y * w + x]) continue;
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const xx = x + dx; const yy = y + dy;
        return xx >= 0 && yy >= 0 && xx < w && yy < h && shaded[yy * w + xx];
      });
      if (near) r.set(x, y, W.outline);
    }
  }
}

/**
 * Bakes painted frames into a texture: `paint(r, row, col)` paints one frame.
 * @param {{cw: number, ch: number, cols: number, rows: number, paint: (r: ReturnType<typeof raster>, row: number, col: number) => void}} o
 * @returns {THREE.CanvasTexture}
 */
export function bakeSheet({ cw, ch, cols, rows, paint }) {
  const c = document.createElement('canvas');
  c.width = cw * cols;
  c.height = ch * rows;
  const g = c.getContext('2d');
  const img = g.createImageData(c.width, c.height);
  const rgb = new Map();
  const srgb = { r: 0, g: 0, b: 0 };
  const toRgb = (s) => { let v = rgb.get(s); if (!v) { new THREE.Color(s).getRGB(srgb, THREE.SRGBColorSpace); v = [srgb.r, srgb.g, srgb.b].map((k) => Math.round(Math.min(1, Math.max(0, k)) * 255)); rgb.set(s, v); } return v; };
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const r = raster(cw, ch);
      paint(r, row, col);
      finish(r);
      for (let y = 0; y < ch; y += 1) {
        for (let x = 0; x < cw; x += 1) {
          const s = r.px[y * cw + x];
          if (!s) continue;
          const [R, G, B] = toRgb(s);
          const i = ((row * ch + y) * c.width + col * cw + x) * 4;
          img.data[i] = R; img.data[i + 1] = G; img.data[i + 2] = B; img.data[i + 3] = 255;
        }
      }
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const blobMat = new THREE.MeshBasicMaterial({ color: W.shadow, transparent: true, opacity: 0.32, depthWrite: false });
const blobGeos = new Map();
const cardGeos = new Map();

const _pos = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _scale = new THREE.Vector3();

/**
 * A camera-facing card for a sheet, plus its shadow. Add `card` under the thing that
 * moves (it may bob), `blob` on the floor group; `owner` is what turns to face a way.
 *
 * @param {{cw: number, ch: number, cols: number, rows?: number, px: number, foot?: number, blob?: number, owner: THREE.Object3D}} o
 *   `foot` is how many texels of margin sit under the feet; `blob` the shadow radius in metres
 */
export function spriteCard(o) {
  const rows = o.rows ?? 3;
  const foot = o.foot ?? 1;
  const gkey = `${o.cw}|${o.ch}|${o.px}|${foot}`;
  let geo = cardGeos.get(gkey);
  if (!geo) { geo = new THREE.PlaneGeometry(o.cw * o.px, o.ch * o.px).translate(0, (o.ch * o.px) / 2 - foot * o.px, 0); cardGeos.set(gkey, geo); }
  const mat = new THREE.MeshBasicMaterial({ alphaTest: 0.5, side: THREE.DoubleSide });
  const card = new THREE.Mesh(geo, mat);
  card.castShadow = false;
  card.receiveShadow = false;
  // Never culled by its own box: the card is turned to the camera at draw time.
  card.frustumCulled = false;
  const br = o.blob ?? 0.42;
  let bgeo = blobGeos.get(br);
  if (!bgeo) { bgeo = new THREE.CircleGeometry(br, 14).rotateX(-Math.PI / 2); blobGeos.set(br, bgeo); }
  const blob = new THREE.Mesh(bgeo, blobMat);
  blob.position.y = 0.02;
  blob.renderOrder = -1;

  const api = {
    card, blob,
    /** The frame column showing now. */
    frame: 0,
    /** Show a new sheet (a change of clothes). @param {THREE.Texture} tex */
    setSheet(tex) {
      // Each card gets its own sampling window on the shared pixels.
      const t = tex.clone();
      t.needsUpdate = true;
      t.repeat.set(1 / o.cols, 1 / rows);
      if (mat.map) mat.map.dispose();
      mat.map = t;
      mat.needsUpdate = true;
    },
  };

  let last = 0;
  card.onBeforeRender = (_r, _s, camera) => {
    card.getWorldPosition(_pos);
    o.owner.getWorldDirection(_dir);
    card.getWorldScale(_scale);
    const facing = Math.atan2(_dir.x, _dir.z);
    const toCam = Math.atan2(camera.position.x - _pos.x, camera.position.z - _pos.z);
    let rel = facing - toCam;
    rel = ((rel + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    // Eight ways to walk, three ways to draw: on a diagonal, keep the view already showing
    // until the angle is clearly past it, so a sprite walking at 45 degrees does not flicker.
    const view = (x) => (Math.abs(x) > (Math.PI * 3) / 4 ? 1 : x > Math.PI / 4 ? 2 : x < -Math.PI / 4 ? 3 : 0);
    let v = view(rel);
    if (v !== last && view(rel + 0.14) === last) v = last;
    else if (v !== last && view(rel - 0.14) === last) v = last;
    last = v;
    const row = v === 3 ? 2 : v;
    const flip = v === 3;
    const t = mat.map;
    if (t) {
      const u = api.frame / o.cols;
      t.repeat.x = flip ? -1 / o.cols : 1 / o.cols;
      t.offset.x = flip ? u + 1 / o.cols : u;
      t.offset.y = 1 - (row + 1) / rows;
    }
    mat.color.copy(SPRITE_LIGHT);
    card.matrixWorld.compose(_pos, camera.quaternion, _scale);
  };
  return api;
}
