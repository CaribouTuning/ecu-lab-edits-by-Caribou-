/**
 * The sky and the far horizon, for driving.
 *
 * Walking, the camera looks down on the street and the sky is the flat colour behind it.
 * From behind the wheel you look along the road to the horizon, so the stage shows more:
 * a sky dome painted in a few hard bands of colour (pixel art does not do smooth gradients),
 * blocky clouds by day and stars at night, and two rings of hills, the farther one paler in
 * the haze. All of it rides with the camera, so it is always at the horizon however far
 * you drive, and none of it writes depth, so the town draws over it and the outline pass
 * leaves it alone.
 */

import { world as W } from '../tokens.js';

import { THREE } from './gfx.js';

const DOME_R = 300;
const TEX_W = 128;
const TEX_H = 48;
const BANDS = 7;

/** A repeatable pseudo-random number from an integer. @param {number} i */
const hash = (i) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * A ring of hills: a wall round the camera whose top rises and falls.
 * @param {number} r radius @param {number} lo lowest top, metres @param {number} hi highest @param {number} seed @param {THREE.Material} mat
 */
function hillRing(r, lo, hi, seed, mat) {
  const N = 72;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= N; i += 1) {
    const a = (i / N) * Math.PI * 2;
    // Two octaves of smooth noise round the circle: long ridges with a few bumps on them.
    const k = i % N;
    const n1 = hash(seed + Math.floor(k / 6)) * (1 - (k % 6) / 6) + hash(seed + ((Math.floor(k / 6) + 1) % (N / 6))) * ((k % 6) / 6);
    const n2 = hash(seed * 7 + k);
    const h = lo + (hi - lo) * (0.75 * n1 + 0.25 * n2);
    pos.push(Math.sin(a) * r, -20, Math.cos(a) * r, Math.sin(a) * r, h, Math.cos(a) * r);
    if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = -1;
  m.frustumCulled = false;
  return m;
}

export function makeSky() {
  const group = new THREE.Group();
  group.visible = false;

  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  // The upper half of a sphere, a little past the horizon so no seam shows under the hills.
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(DOME_R, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2 + 0.08),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  dome.renderOrder = -2;
  dome.frustumCulled = false;
  group.add(dome);

  const farMat = new THREE.MeshBasicMaterial({ color: W.hillFar, fog: false, depthWrite: false, side: THREE.DoubleSide });
  const nearMat = new THREE.MeshBasicMaterial({ color: W.hillNear, fog: false, depthWrite: false, side: THREE.DoubleSide });
  group.add(hillRing(DOME_R * 0.92, 14, 46, 3, farMat));
  group.add(hillRing(DOME_R * 0.78, 4, 24, 11, nearMat));

  /** Paint the dome: bands from the horizon to the top, then clouds or stars. */
  function paint(top, horizon, night) {
    const a = new THREE.Color(horizon);
    const b = new THREE.Color(top);
    for (let y = 0; y < TEX_H; y += 1) {
      // y = 0 is the top of the sky; bands bunch toward the horizon, where the colour changes fastest.
      const t = 1 - y / (TEX_H - 1);
      const band = Math.floor(Math.pow(t, 0.7) * BANDS) / (BANDS - 1);
      g.fillStyle = `#${a.clone().lerp(b, Math.min(1, band)).getHexString()}`;
      g.fillRect(0, y, TEX_W, 1);
    }
    if (night) {
      for (let i = 0; i < 90; i += 1) {
        const x = Math.floor(hash(i) * TEX_W);
        const y = Math.floor(hash(i + 500) ** 1.6 * TEX_H * 0.8);
        g.fillStyle = hash(i + 900) > 0.8 ? W.starBright : W.star;
        g.fillRect(x, y, 1, 1);
      }
    } else {
      // A few flat-bottomed clouds, as stacked runs of pixels, low in the sky.
      for (let c = 0; c < 9; c += 1) {
        const cx = Math.floor(hash(c + 40) * TEX_W);
        const cy = Math.floor(TEX_H * (0.45 + hash(c + 80) * 0.3));
        const w = 6 + Math.floor(hash(c + 120) * 10);
        const rows = [[0, w], [1, w - 2], [2, Math.max(2, w - 5)]];
        rows.forEach(([dy, rw], k) => {
          g.fillStyle = k === 0 ? W.cloudShade : W.cloud;
          const x0 = cx + Math.floor((w - rw) / 2) + (k === 2 ? Math.floor(hash(c + 160) * 3) - 1 : 0);
          for (let x = 0; x < rw; x += 1) g.fillRect((x0 + x) % TEX_W, cy - dy, 1, 1);
        });
      }
    }
    tex.needsUpdate = true;
  }

  let last = '';
  return {
    group,
    /**
     * Colour for a time of day, blended as the stage blends its light.
     * @param {{top: string, horizon: string, ground: string}} a @param {{top: string, horizon: string, ground: string}} b
     * @param {number} f @param {boolean} night stars instead of clouds
     */
    setTime(a, b, f, night) {
      const top = new THREE.Color(a.top).lerp(new THREE.Color(b.top), f);
      const horizon = new THREE.Color(a.horizon).lerp(new THREE.Color(b.horizon), f);
      const key = `${top.getHexString()}${horizon.getHexString()}${night}`;
      if (key !== last) { last = key; paint(top, horizon, night); }
      // Hills take on the air between: the far ring almost the horizon's colour.
      const dark = new THREE.Color(a.ground).lerp(new THREE.Color(b.ground), f);
      nearMat.color.set(W.hillNear).lerp(dark, 0.35).lerp(horizon, 0.35);
      farMat.color.set(W.hillFar).lerp(dark, 0.2).lerp(horizon, 0.6);
    },
    /** Keep it centred on the camera. @param {THREE.Vector3} at */
    follow(at) { group.position.set(at.x, 0, at.z); },
  };
}
