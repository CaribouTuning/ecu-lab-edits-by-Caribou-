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
 * brighter top-left texel, then (unless `outline` is false) the figure gets a one-texel
 * dark outline. This is what makes a flat drawing read as a rounded figure.
 * @param {ReturnType<typeof raster>} r
 * @param {boolean} [outline]
 */
export function finish(r, outline = true) {
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
  if (!outline) return;
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

/** How many times bigger a sheet is drawn than it is painted: two doublings. */
const INK_SCALE = 4;

/**
 * One doubling of a painted frame with the corners rounded (EPX): a staircase of texels
 * becomes a slope, so the figure's outline reads as a pen line, not as pixels.
 * @param {(string|null)[]} px @param {number} w @param {number} h
 * @returns {(string|null)[]} twice the width and height
 */
function epx(px, w, h) {
  const out = new Array(w * h * 4).fill(null);
  const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? px[y * w + x] : null);
  const W2 = w * 2;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const P = at(x, y); const A = at(x, y - 1); const B = at(x + 1, y); const C = at(x - 1, y); const D = at(x, y + 1);
      let p1 = P; let p2 = P; let p3 = P; let p4 = P;
      if (C === A && C !== D && A !== B) p1 = A;
      if (A === B && A !== C && B !== D) p2 = B;
      if (D === C && D !== B && C !== A) p3 = C;
      if (B === D && B !== A && D !== C) p4 = D;
      const i = (y * 2) * W2 + x * 2;
      out[i] = p1; out[i + 1] = p2; out[i + W2] = p3; out[i + W2 + 1] = p4;
    }
  }
  return out;
}

/**
 * A painted frame drawn up as an inked cartoon: smoothed, a bold pen line round the figure
 * and a fine one where its colours meet, the way the rest of the game is drawn.
 * @param {(string|null)[]} px @param {number} w @param {number} h
 * @param {(s: string) => number} lum how light a colour is, 0..1
 * @returns {(string|null)[]} INK_SCALE times the width and height
 */
function inkFrame(px, w, h, lum) {
  let big = px; let bw = w; let bh = h;
  for (let k = 1; k < INK_SCALE; k *= 2) { big = epx(big, bw, bh); bw *= 2; bh *= 2; }
  const out = big.slice();
  const at = (x, y) => (x >= 0 && y >= 0 && x < bw && y < bh ? big[y * bw + x] : null);
  for (let y = 0; y < bh; y += 1) {
    for (let x = 0; x < bw; x += 1) {
      const c = big[y * bw + x];
      if (!c) {
        // The outer line: outside the figure, hugging it, two drawn pixels wide.
        if (at(x + 1, y) || at(x - 1, y) || at(x, y + 1) || at(x, y - 1) || at(x + 2, y) || at(x - 2, y) || at(x, y + 2) || at(x, y - 2)) out[y * bw + x] = W.sketch.ink;
        continue;
      }
      // An inner line where two clearly different colours meet (not a shade of one).
      const r = at(x + 1, y); const d = at(x, y + 1);
      if ((r && r !== c && Math.abs(lum(r) - lum(c)) > 0.14) || (d && d !== c && Math.abs(lum(d) - lum(c)) > 0.14)) out[y * bw + x] = W.sketch.ink;
    }
  }
  return out;
}

/**
 * Bakes painted frames into a texture: `paint(r, row, col)` paints one frame. The frames
 * are painted small, texel by texel, then drawn up INK_SCALE times as inked cartoons.
 * @param {{cw: number, ch: number, cols: number, rows: number, paint: (r: ReturnType<typeof raster>, row: number, col: number) => void}} o
 * @returns {THREE.CanvasTexture}
 */
export function bakeSheet({ cw, ch, cols, rows, paint }) {
  const S = INK_SCALE;
  const c = document.createElement('canvas');
  c.width = cw * cols * S;
  c.height = ch * rows * S;
  const g = c.getContext('2d');
  const img = g.createImageData(c.width, c.height);
  const rgb = new Map();
  const srgb = { r: 0, g: 0, b: 0 };
  const toRgb = (s) => { let v = rgb.get(s); if (!v) { new THREE.Color(s).getRGB(srgb, THREE.SRGBColorSpace); v = [srgb.r, srgb.g, srgb.b].map((k) => Math.round(Math.min(1, Math.max(0, k)) * 255)); rgb.set(s, v); } return v; };
  const lum = (s) => { const [R, G, B] = toRgb(s); return (0.299 * R + 0.587 * G + 0.114 * B) / 255; };
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const r = raster(cw, ch);
      paint(r, row, col);
      finish(r, false);
      const px = inkFrame(r.px, cw, ch, lum);
      const fw = cw * S;
      for (let y = 0; y < ch * S; y += 1) {
        for (let x = 0; x < fw; x += 1) {
          const s = px[y * fw + x];
          if (!s) continue;
          const [R, G, B] = toRgb(s);
          const i = ((row * ch * S + y) * c.width + col * fw + x) * 4;
          img.data[i] = R; img.data[i + 1] = G; img.data[i + 2] = B; img.data[i + 3] = 255;
        }
      }
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  // Smooth, as ink on paper is: the drawing is big enough not to need hard texels.
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
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
