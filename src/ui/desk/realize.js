/**
 * The shop lit as a real room: every flat toon material in it swapped, once, for a
 * physically based one with the roughness and metalness of what it is made of.
 *
 * The open world keeps its drawn look (stage.js `sketch`); the shop is a workshop you stand
 * in, so it is lit like one: overhead strip lights, soft shadows that put things on the
 * floor, metal that reflects the room and paint that does not glow.
 *
 * What a colour is made of is looked up by the palette value it was drawn in (tokens.js);
 * anything not listed is painted or plastic, matte.
 */

import { world as W } from '../tokens.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { THREE } from '../world/gfx.js';

const E = W.engine;
/**
 * `env` is how strongly the surface mirrors the room: a matte rubber barely, cast metal
 * dimly, glass and a clear-coated panel clearly. It is what makes a material read as what
 * it is when the colour alone cannot (black rubber against black plastic).
 * @type {Array<[string[], {metalness: number, roughness: number, env: number, clearcoat?: number}]>}
 */
const FINISHES = [
  // Machined and cast aluminium, bright steel, chrome-ish trim.
  [[W.metal, W.metalLight, W.rim, W.brake, E.block, E.head, E.plenum, E.turbo, E.turboCold], { metalness: 0.75, roughness: 0.42, env: 1.1 }],
  // Dull steel, cast iron, pulleys, a flywheel, a radiator core: metal, but dirty and rough.
  [[W.metalDark, W.steel, W.rimDark, W.corrugated, E.blockDark, E.blockIron, E.blockIronDark, E.headIron, E.pulley, E.flywheel, E.cooler], { metalness: 0.6, roughness: 0.62, env: 0.8 }],
  // Exhaust: heat-coloured mild steel.
  [[E.pipe, E.pipeHot], { metalness: 0.5, roughness: 0.7, env: 0.6 }],
  // Rubber: tyres, belts, hoses, casters, the black of things.
  [[W.tyre, W.tyreWall, W.rubber, W.black, E.belt, E.hose], { metalness: 0, roughness: 0.92, env: 0.25 }],
  // Moulded plastic: a sheen rubber does not have.
  [[W.plastic, E.plug], { metalness: 0, roughness: 0.42, env: 0.7 }],
  // Powder-coated equipment: the stands, the tool chests, the dyno's frame.
  [[E.stand, E.standDark, W.toolRed, W.toolBlue, W.toolYellow, W.hazard, W.floorStripe, E.cover, E.coverDark, E.coverOhv, E.filter], { metalness: 0.05, roughness: 0.55, env: 0.6 }],
  // A sealed epoxy floor: a dull sheen, not a mirror.
  [[W.floorEpoxy, W.floorEpoxyAlt, W.floorGrout, W.floorShop], { metalness: 0, roughness: 0.6, env: 0.6 }],
  // Glass.
  [[W.glass, W.glassDark, W.doorGlass, W.screenOff], { metalness: 0, roughness: 0.06, env: 1.8 }],
];
const PAINT = new Set(Object.values(W.paint).map((c) => new THREE.Color(c).getHex()));
const finishOf = new Map();
for (const [colors, f] of FINISHES) for (const c of colors) finishOf.set(new THREE.Color(c).getHex(), f);

/** Swapped once each, and shared like the toon ones were. */
const swapped = new WeakMap();

/**
 * Real colours are less loud than a palette's: pull the saturation down a little, as a
 * shop's dust and its light do.
 * @param {THREE.Color} c
 */
function settle(c) {
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s * 0.78, hsl.l);
  return c;
}

/** @param {THREE.Material} m */
function realMaterial(m) {
  let r = swapped.get(m);
  if (r) return r;
  const t = /** @type {THREE.MeshToonMaterial} */ (m);
  const hex = t.color.getHex();
  const paint = PAINT.has(hex);
  // Car paint: a metallic base coat under a hard clear coat, which is what mirrors the room.
  const f = paint ? { metalness: 0.35, roughness: 0.4, clearcoat: 1, env: 1.3 } : finishOf.get(hex) ?? { metalness: 0, roughness: 0.82, env: 0.5 };
  const o = {
    color: settle(t.color.clone()), map: t.map, roughness: f.roughness, metalness: f.metalness, envMapIntensity: f.env,
    emissive: t.emissive, emissiveIntensity: t.emissiveIntensity,
    transparent: t.transparent, opacity: t.opacity, side: t.side, depthWrite: t.depthWrite,
    // No outline is drawn over it here, so it need not be pushed back from one.
    polygonOffset: false,
  };
  r = f.clearcoat ? new THREE.MeshPhysicalMaterial({ ...o, clearcoat: f.clearcoat, clearcoatRoughness: 0.06 }) : new THREE.MeshStandardMaterial(o);
  swapped.set(m, r);
  return r;
}

/**
 * Swap every toon material under `root` for its real one. Cheap to call again after parts
 * of the scene are rebuilt: what is already real is passed over.
 * @param {THREE.Object3D} root
 */
export function realize(root) {
  root.traverse((o) => {
    const mesh = /** @type {THREE.Mesh} */ (o);
    if (!mesh.isMesh) return;
    if (Array.isArray(mesh.material)) mesh.material = mesh.material.map((m) => (m.type === 'MeshToonMaterial' ? realMaterial(m) : m));
    else if (mesh.material?.type === 'MeshToonMaterial') mesh.material = realMaterial(mesh.material);
  });
}

/**
 * A sealed concrete floor: grey, mottled where it was trowelled and where it has worn, with
 * saw-cut control joints on a grid. Drawn once into a canvas.
 * @param {number} w @param {number} d metres the floor covers
 * @returns {THREE.MeshStandardMaterial}
 */
export function concreteFloor(w, d) {
  const px = 64; // canvas pixels a metre
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * px / 2);
  cv.height = Math.round(d * px / 2);
  const g = cv.getContext('2d');
  const base = new THREE.Color(W.floorShop);
  if (g) {
    g.fillStyle = `#${base.getHexString()}`;
    g.fillRect(0, 0, cv.width, cv.height);
    // Mottling: soft blotches a little lighter and darker than the slab, seeded so it never changes.
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 900; i += 1) {
      const c = base.clone().offsetHSL(0, 0, (rnd() - 0.5) * 0.06);
      g.globalAlpha = 0.18;
      g.fillStyle = `#${c.getHexString()}`;
      g.beginPath();
      g.arc(rnd() * cv.width, rnd() * cv.height, 4 + rnd() * 26, 0, Math.PI * 2);
      g.fill();
    }
    // Control joints every 3 m each way, as a slab this size is cut.
    g.globalAlpha = 0.9;
    g.strokeStyle = W.floorShopJoint;
    g.lineWidth = 1;
    const step = (3 * px) / 2;
    for (let x = step; x < cv.width; x += step) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, cv.height); g.stroke(); }
    for (let y = step; y < cv.height; y += step) { g.beginPath(); g.moveTo(0, y); g.lineTo(cv.width, y); g.stroke(); }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.72, metalness: 0 });
}

/**
 * The room's light: what its walls and ceiling bounce back, for metal to reflect, from
 * three.js's own neutral room. Made once per renderer.
 * @param {THREE.WebGLRenderer} renderer
 */
export function roomReflections(renderer) {
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  pm.dispose();
  return tex;
}
