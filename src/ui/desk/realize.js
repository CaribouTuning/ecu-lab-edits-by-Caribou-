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
/** @type {Array<[string[], {metalness: number, roughness: number, clearcoat?: number}]>} */
const FINISHES = [
  // Machined and cast aluminium, bright steel, chrome-ish trim.
  [[W.metal, W.metalLight, W.rim, W.brake, E.block, E.head, E.plenum, E.turbo, E.turboCold], { metalness: 0.75, roughness: 0.42 }],
  // Dull steel, cast iron, pulleys, a flywheel, a radiator core: metal, but dirty and rough.
  [[W.metalDark, W.steel, W.rimDark, W.corrugated, E.blockDark, E.blockIron, E.blockIronDark, E.headIron, E.pulley, E.flywheel, E.cooler], { metalness: 0.6, roughness: 0.62 }],
  // Exhaust: heat-coloured mild steel.
  [[E.pipe, E.pipeHot], { metalness: 0.5, roughness: 0.7 }],
  // Rubber: tyres, belts, hoses, casters, the black of things.
  [[W.tyre, W.tyreWall, W.rubber, W.black, E.belt, E.hose], { metalness: 0, roughness: 0.92 }],
  // Powder-coated equipment: the stands, the tool chests, the dyno's frame.
  [[E.stand, E.standDark, W.toolRed, W.toolBlue, W.toolYellow, W.hazard, W.floorStripe, E.cover, E.coverDark, E.coverOhv, E.filter], { metalness: 0.05, roughness: 0.55 }],
  // A sealed epoxy floor: a dull sheen, not a mirror.
  [[W.floorEpoxy, W.floorEpoxyAlt, W.floorGrout], { metalness: 0, roughness: 0.6 }],
  // Glass.
  [[W.glass, W.glassDark, W.doorGlass], { metalness: 0, roughness: 0.08 }],
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
  const f = paint ? { metalness: 0.1, roughness: 0.32, clearcoat: 0.6 } : finishOf.get(hex) ?? { metalness: 0, roughness: 0.82 };
  const o = {
    color: settle(t.color.clone()), map: t.map, roughness: f.roughness, metalness: f.metalness,
    emissive: t.emissive, emissiveIntensity: t.emissiveIntensity,
    transparent: t.transparent, opacity: t.opacity, side: t.side, depthWrite: t.depthWrite,
    // No outline is drawn over it here, so it need not be pushed back from one.
    polygonOffset: false,
  };
  r = f.clearcoat ? new THREE.MeshPhysicalMaterial({ ...o, clearcoat: f.clearcoat, clearcoatRoughness: 0.2 }) : new THREE.MeshStandardMaterial(o);
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
