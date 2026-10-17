/**
 * The shops you walk into: Gearhead Supply, the Tuning Academy, Threads, Pops' Diner and
 * the Caribou Motors showroom. Each is a small room with a counter, a clerk and the
 * things that shop sells on display; the counter opens that shop's panel.
 */

import { world as W } from '../../tokens.js';
import { OUTFITS, defaultLook, itemById, npcLook } from '../appearance.js';
import { THREE, box, cyl, floorPlane, glow, groundPlane, pixelTexture, sign } from '../gfx.js';
import { makeCar } from '../models/car.js';
import { makePerson } from '../models/person.js';
import {
  makeBarrel, makeCoffeeMachine, makeCone, makeCouch, makeCrate, makeDyno, makeFloorLamp, makeLift, makePlant, makePoster, makeShelf, makeToolChest,
  makeTyreStack,
} from '../models/props.js';
import { PHASE_TIME } from './garage.js';
import { dealerStock } from '../../career/ownedCars.js';
import { hash } from './common.js';

/** @typedef {{id: string, name: string, w: number, d: number}} InteriorDef */

const at = (o, x, z, ry = 0, y = 0) => { o.position.set(x, y, z); o.rotation.y = ry; return o; };

/** A counter with a clerk behind it. Returns the clerk. */
function counter(root, colliders, x, z, w, color, top) {
  root.add(box(w, 1.05, 0.9, color, { x, y: 0.525, z }));
  root.add(box(w + 0.15, 0.1, 1.05, top, { x, y: 1.08, z }));
  colliders.push({ x, z, hw: w / 2 + 0.1, hd: 0.55 });
}

/** The room's shell: floor, walls on three sides and a low front wall with a door gap. */
function shell(root, colliders, w, d, o) {
  const floor = groundPlane(w, d, { base: o.floorA, alt: o.floorB, line: o.floorLine ?? o.floorB, kind: 'tile', tile: 2 });
  floor.position.y = 0.001;
  root.add(floor);
  root.add(floorPlane(w + 30, d + 22, W.concreteDark, { y: -0.02 }));
  const H = 4.6;
  const wall = (x, z, ww, dd, h, c) => { root.add(box(ww, h, dd, c, { x, y: h / 2, z })); colliders.push({ x, z, hw: ww / 2, hd: dd / 2 }); };
  wall(0, -d / 2 - 0.2, w + 0.8, 0.4, H, o.wall);
  wall(-w / 2 - 0.2, 0, 0.4, d + 0.4, H, o.wall);
  wall(w / 2 + 0.2, 0, 0.4, d + 0.4, H, o.wall);
  root.add(box(w, 1.0, 0.1, o.base ?? W.wallBase, { x: 0, y: 0.5, z: -d / 2 + 0.05, edge: false }));
  const gap = 2.2;
  const fw = (w - gap * 2) / 2;
  wall(-(gap + fw / 2), d / 2 + 0.2, fw, 0.4, 1.2, o.wall);
  wall(gap + fw / 2, d / 2 + 0.2, fw, 0.4, 1.2, o.wall);
  root.add(box(gap * 2, 0.02, 0.6, W.hazard, { y: 0.012, z: d / 2 + 0.2, edge: false, cast: false }));
  // A window on the back wall.
  for (const x of [-w / 3, w / 3]) {
    root.add(box(2.4, 1.3, 0.08, W.glassDark, { x, y: 3.2, z: -d / 2 + 0.06, edge: false }));
    root.add(box(2.2, 1.1, 0.05, W.glass, { x, y: 3.2, z: -d / 2 + 0.1, edge: false }));
  }
  return { H, gap };
}

/** Ceiling-less lighting: bright fill plus warm tubes on the back wall. */
function tubes(root, w, d) {
  for (const x of [-w / 4, w / 4]) root.add(box(2.4, 0.12, 0.12, W.white, { x, y: 4.1, z: -d / 2 + 0.15, mat: glow(W.white), edge: false, cast: false }));
}

const BUILDERS = {
  supply(api, root, colliders, interactables, def) {
    const { w, d } = def;
    shell(root, colliders, w, d, { floorA: W.concreteLight, floorB: W.concrete, wall: W.wallBlue, base: W.wallBlack });
    tubes(root, w, d);
    counter(root, colliders, 0, -d / 2 + 2.6, 5, W.toolBlue, W.woodLight);
    const clerk = makePerson({ ...npcLook(hash('gus')), top: 'coverall-blue', hat: 'cap-shop', hair: 'short' }, { mood: 'smile' });
    at(clerk.group, 0, -d / 2 + 1.7, 0);
    root.add(clerk.group);
    // Shelves down the sides, stocked.
    for (const [x, ry] of [[-w / 2 + 0.7, Math.PI / 2], [w / 2 - 0.7, -Math.PI / 2]]) for (const z of [-2.8, 1.6]) { const s = makeShelf(hash(`s${x}${z}`)); at(s, x, z, ry); root.add(s); colliders.push({ x, z, hw: 0.4, hd: 1.6 }); }
    // On show: what the shop already owns, so the room tells you how far you have come.
    const owned = new Set(api.career().owned);
    const disp = new THREE.Group();
    if (owned.has('dyno')) { const dy = makeDyno(true); dy.scale.setScalar(0.28); at(dy, -3.4, 1.4); root.add(dy); }
    if (owned.has('lift2')) { const l = makeLift(); l.scale.setScalar(0.45); at(l, 3.5, 2.0); root.add(l); }
    const tc = makeToolChest(W.toolRed);
    at(tc, 3.2, -1.2);
    root.add(tc);
    colliders.push({ x: 3.2, z: -1.2, hw: 0.6, hd: 0.35 });
    const ty = makeTyreStack(5);
    at(ty, -3.4, -0.2);
    root.add(ty);
    colliders.push({ x: -3.4, z: -0.2, r: 0.45 });
    const bar = makeBarrel(W.barrelRed);
    at(bar, 3.4, 3.4);
    root.add(bar);
    colliders.push({ x: 3.4, z: 3.4, r: 0.35 });
    root.add(disp);
    const po = makePoster(3);
    at(po, -w / 2 + 0.1, 0.4, Math.PI / 2, 2.4);
    root.add(po);
    interactables.push({ id: 'counter', x: 0, z: -d / 2 + 4.2, r: 2.4, onFoot: true, label: 'Browse the catalogue', hint: 'Equipment that changes what the shop can do.', run: () => api.emit({ type: 'act', id: 'shop', place: 'supply' }) });
    return { update: (dt) => clerk.update(dt, 0), spawn: { x: 0, z: d / 2 - 1 } };
  },

  academy(api, root, colliders, interactables, def) {
    const { w, d } = def;
    shell(root, colliders, w, d, { floorA: W.woodLight, floorB: W.wood, floorLine: W.woodDark, wall: W.plaster, base: W.roofGreen });
    tubes(root, w, d);
    // A big board with a diagram: air in, fuel in, power out.
    const board = pixelTexture(48, 24, (g) => {
      g.fillStyle = W.roofGreen;
      g.fillRect(0, 0, 48, 24);
      g.fillStyle = W.white;
      g.fillRect(2, 2, 44, 1);
      g.fillStyle = W.cloth.sky;
      g.fillRect(4, 6, 12, 6); g.fillRect(18, 6, 12, 6); g.fillRect(32, 6, 12, 6);
      g.fillStyle = W.white;
      g.fillRect(16, 8, 2, 2); g.fillRect(30, 8, 2, 2);
      g.fillStyle = W.toolYellow;
      g.fillRect(4, 16, 40, 1); g.fillRect(4, 18, 30, 1);
    });
    const bm = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshToonMaterial({ map: board }));
    bm.position.set(0, 2.6, -d / 2 + 0.07);
    root.add(bm);
    const t = sign('AIR FUEL SPARK', { w: 5, h: 0.5, bg: W.roofGreen, fg: W.white });
    t.position.set(0, 4.15, -d / 2 + 0.1);
    root.add(t);
    // A lectern and the professor.
    root.add(box(1.2, 1.1, 0.7, W.woodDark, { x: 0, y: 0.55, z: -d / 2 + 2.2 }));
    colliders.push({ x: 0, z: -d / 2 + 2.2, hw: 0.7, hd: 0.4 });
    const prof = makePerson({ ...npcLook(hash('okoye')), top: 'labcoat', bottom: 'slacks', glasses: 'nerd', hat: null, hair: 'afro', hairColor: 'grey', skin: 4 }, { mood: 'smile' });
    at(prof.group, 0, -d / 2 + 1.4, 0);
    prof.setPose('point');
    root.add(prof.group);
    // Rows of desks.
    for (let r = 0; r < 3; r += 1) for (const x of [-3, 0, 3]) {
      const desk = box(1.8, 0.1, 0.9, W.woodLight, { x, y: 0.8, z: -0.8 + r * 2.2 });
      root.add(desk);
      root.add(box(0.1, 0.8, 0.8, W.woodDark, { x: x - 0.8, y: 0.4, z: -0.8 + r * 2.2, edge: false }), box(0.1, 0.8, 0.8, W.woodDark, { x: x + 0.8, y: 0.4, z: -0.8 + r * 2.2, edge: false }));
      colliders.push({ x, z: -0.8 + r * 2.2, hw: 0.95, hd: 0.5 });
    }
    const dyno = makeDyno(true);
    dyno.scale.setScalar(0.3);
    at(dyno, w / 2 - 1.5, 2.8, 0);
    root.add(dyno);
    const plant = makePlant(true);
    at(plant, -w / 2 + 1, d / 2 - 1.2);
    root.add(plant);
    interactables.push({ id: 'lectern', x: 0, z: -d / 2 + 3.3, r: 2.6, onFoot: true, label: 'Sign up for a course', hint: 'Each course opens real ECU pages.', run: () => api.emit({ type: 'act', id: 'shop', place: 'academy' }) });
    return { update: (dt) => prof.update(dt, 0), spawn: { x: 0, z: d / 2 - 1 } };
  },

  boutique(api, root, colliders, interactables, def) {
    const { w, d } = def;
    shell(root, colliders, w, d, { floorA: W.cloth.cream, floorB: W.plasterDark, floorLine: W.plasterDark, wall: W.wallPurple, base: W.wallBlack });
    tubes(root, w, d);
    const neon = sign('THREADS', { w: 4.4, h: 1, bg: W.black, fg: W.neonPink, glowing: true });
    neon.position.set(0, 3.5, -d / 2 + 0.1);
    root.add(neon);
    counter(root, colliders, -w / 2 + 3, -d / 2 + 2.2, 3.6, W.wallBlack, W.cloth.white);
    const clerk = makePerson({ ...npcLook(hash('mina'), { formal: true }), top: 'blazer', bottom: 'slacks', hat: null, hair: 'ponytail', hairColor: 'pink', skin: 2 }, { mood: 'smile' });
    at(clerk.group, -w / 2 + 3, -d / 2 + 1.4, 0);
    root.add(clerk.group);
    // Mannequins in the shop's outfits.
    const mans = [];
    OUTFITS.forEach((o, i) => {
      const look = { ...defaultLook(), skin: 0 + (i % 6), hair: 'bald', hairColor: 'grey' };
      for (const id of o.items) { const it = itemById(id); look[it.slot] = id; }
      const m = makePerson(look, { mood: 'neutral' });
      const x = -w / 2 + 2 + i * ((w - 4) / (OUTFITS.length - 1));
      at(m.group, x, 1.7 - d / 2 + 3.5, i % 2 ? 0.25 : -0.25);
      m.group.position.z = -d / 2 + 5.4;
      root.add(m.group);
      root.add(cyl(0.5, 0.5, 0.15, W.wallBlack, { x, y: 0.075, z: -d / 2 + 5.4, seg: 12 }));
      colliders.push({ x, z: -d / 2 + 5.4, r: 0.55 });
      mans.push(m);
    });
    // A mirror on the wall to the right.
    root.add(box(1.8, 2.4, 0.08, W.black, { x: w / 2 - 0.4, y: 1.4, z: 0.4 }).rotateY(-Math.PI / 2));
    const mir = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.2), glow(W.glass, 0.55));
    mir.position.set(w / 2 - 0.34, 1.4, 0.4);
    mir.rotation.y = -Math.PI / 2;
    root.add(mir);
    for (const x of [-2.5, 2.5]) { const rack = new THREE.Group(); rack.add(box(2.4, 0.06, 0.06, W.metal, { y: 1.5 })); for (let i = 0; i < 6; i += 1) rack.add(box(0.28, 0.9, 0.08, [W.cloth.red, W.cloth.teal, W.cloth.yellow, W.cloth.navy, W.cloth.orange, W.cloth.neon][i], { x: -1 + i * 0.4, y: 1.0, edge: false })); at(rack, x, 1.8); root.add(rack); colliders.push({ x, z: 1.8, hw: 1.2, hd: 0.2 }); }
    interactables.push({ id: 'counter', x: -w / 2 + 3, z: -d / 2 + 3.6, r: 2.8, onFoot: true, label: 'Try on clothes', hint: 'Buy a look for the tuner.', run: () => api.emit({ type: 'act', id: 'shop', place: 'boutique' }) });
    return { update: (dt) => { clerk.update(dt, 0); mans.forEach((m) => m.update(dt, 0)); }, spawn: { x: 0, z: d / 2 - 1 } };
  },

  diner(api, root, colliders, interactables, def) {
    const { w, d } = def;
    shell(root, colliders, w, d, { floorA: W.cloth.white, floorB: W.toolRed, floorLine: W.toolRed, wall: W.cloth.cream, base: W.toolRed });
    tubes(root, w, d);
    const neon = sign('POPS DINER', { w: 5, h: 1, bg: W.black, fg: W.neonAmber, glowing: true });
    neon.position.set(0, 3.6, -d / 2 + 0.1);
    root.add(neon);
    // The long counter with stools.
    counter(root, colliders, 0, -d / 2 + 3, 8, W.toolRed, W.cloth.white);
    for (let i = 0; i < 6; i += 1) { const x = -3.3 + i * 1.32; root.add(cyl(0.22, 0.22, 0.1, W.toolRed, { x, y: 0.75, z: -d / 2 + 4.1, seg: 10 }), cyl(0.04, 0.04, 0.7, W.metalLight, { x, y: 0.38, z: -d / 2 + 4.1, edge: false, seg: 6 })); }
    const pops = makePerson({ ...npcLook(hash('pops')), top: 'polo-shop', bottom: 'slacks', hat: 'cap-red', hair: 'short', hairColor: 'white', glasses: 'nerd', skin: 1 }, { mood: 'smile' });
    at(pops.group, 0, -d / 2 + 1.9, 0);
    root.add(pops.group);
    root.add(makeCoffeeMachine().translateX(2.6).translateZ(-d / 2 + 0.9));
    // Booths down the sides.
    for (const [x, ry] of [[-w / 2 + 1.2, Math.PI / 2], [w / 2 - 1.2, -Math.PI / 2]]) for (const z of [-0.5, 2.4]) {
      const c = makeCouch(W.toolRed);
      at(c, x, z, ry);
      root.add(c);
      root.add(box(0.9, 0.08, 1.4, W.woodLight, { x: x + (x < 0 ? 1.1 : -1.1), y: 0.78, z, edge: false }), box(0.1, 0.78, 0.1, W.metalDark, { x: x + (x < 0 ? 1.1 : -1.1), y: 0.39, z, edge: false }));
      colliders.push({ x: x + (x < 0 ? 0.5 : -0.5), z, hw: 1.0, hd: 1.0 });
    }
    // The jukebox.
    const jb = box(0.9, 1.7, 0.6, W.paint.purple, { x: w / 2 - 1.0, y: 0.85, z: -d / 2 + 1.2 });
    root.add(jb, box(0.7, 0.5, 0.05, W.neonCyan, { x: w / 2 - 1.0, y: 1.4, z: -d / 2 + 1.52, mat: glow(W.neonCyan), edge: false }));
    colliders.push({ x: w / 2 - 1.0, z: -d / 2 + 1.2, hw: 0.5, hd: 0.35 });
    interactables.push({ id: 'counter', x: 0, z: -d / 2 + 4.9, r: 2.8, onFoot: true, label: 'Sit at the counter', hint: 'Coffee, a tip, and the day’s goals.', run: () => api.emit({ type: 'act', id: 'shop', place: 'diner' }) });
    return { update: (dt) => pops.update(dt, 0), spawn: { x: 0, z: d / 2 - 1 } };
  },

  dealer(api, root, colliders, interactables, def) {
    const { w, d } = def;
    shell(root, colliders, w, d, { floorA: W.cloth.white, floorB: W.cloth.silver, floorLine: W.cloth.silver, wall: W.wallGreen, base: W.black });
    tubes(root, w, d);
    const s = sign('CARIBOU MOTORS', { w: 6, h: 1, bg: W.black, fg: W.paint.gold, glowing: true });
    s.position.set(0, 3.6, -d / 2 + 0.1);
    root.add(s);
    counter(root, colliders, w / 2 - 3, -d / 2 + 2, 3.6, W.black, W.cloth.white);
    const rita = makePerson({ ...npcLook(hash('rita'), { formal: true }), top: 'blazer', bottom: 'slacks', hat: null, hair: 'bun', hairColor: 'chestnut', skin: 3 }, { mood: 'smile' });
    at(rita.group, w / 2 - 3, -d / 2 + 1.2, 0);
    root.add(rita.group);
    const stock = dealerStock(api.career());
    const spots = [[-5.2, -0.5], [0, -0.5], [5.2, -0.5], [-2.6, 3.0], [2.6, 3.0]];
    const turntables = [];
    stock.slice(0, 5).forEach((car, i) => {
      const [x, z] = spots[i];
      root.add(cyl(2.6, 2.7, 0.2, W.cloth.charcoal, { x, y: 0.1, z, seg: 18 }));
      const c = makeCar({ body: car.body, color: car.color, wheels: car.wheels, engine: car.engine, plate: car.plate });
      c.group.position.set(x, 0.2, z);
      root.add(c.group);
      turntables.push(c);
      colliders.push({ x, z, r: 2.3 });
      interactables.push({ id: `car${i}`, x, z: z + 3.2, r: 2.2, onFoot: true, label: `${car.name} · $${car.price.toLocaleString('en-US')}`, hint: car.pitch, run: () => api.emit({ type: 'act', id: 'shop', place: 'dealer', focus: i }) });
    });
    interactables.push({ id: 'counter', x: w / 2 - 3, z: -d / 2 + 3.4, r: 2.6, onFoot: true, label: 'Talk to Rita', hint: 'All the cars for sale, and what yours is worth.', run: () => api.emit({ type: 'act', id: 'shop', place: 'dealer' }) });
    return { update: (dt, t) => { rita.update(dt, 0); turntables.forEach((c, i) => { c.group.rotation.y = t * 0.35 + i; }); }, spawn: { x: 0, z: d / 2 - 1 } };
  },
};

/** Interior sizes. */
const SIZES = { supply: { w: 12, d: 12 }, academy: { w: 14, d: 12 }, boutique: { w: 14, d: 12 }, diner: { w: 14, d: 12 }, dealer: { w: 18, d: 14 } };

/**
 * A level builder for one of the shops.
 * @param {keyof typeof BUILDERS} id
 */
export function interiorLevel(id) {
  return (api, entry = {}) => {
    const career = api.career();
    const { w, d } = SIZES[id];
    const root = new THREE.Group();
    const colliders = [];
    const interactables = [];
    const inner = BUILDERS[id](api, root, colliders, interactables, { id, w, d });
    interactables.push({ id: 'leave', x: 0, z: d / 2 + 1.0, r: 2.6, onFoot: true, label: 'Leave', hint: 'Back to the street.', run: () => api.emit({ type: 'act', id: 'go', place: 'town', from: id }) });
    let leaving = false;
    void entry;
    return {
      root, colliders, interactables, time: PHASE_TIME[career.phase ?? 0],
      camera: { pitch: 0.8, dist: 17, yaw: 0, fov: 30 },
      focus: (x, z) => ({ x: x * 0.4, z: z * 0.5 }),
      bounds: [{ minX: -w / 2 + 0.6, maxX: w / 2 - 0.6, minZ: -d / 2 + 0.8, maxZ: d / 2 - 0.4 }, { minX: -1.4, maxX: 1.4, minZ: d / 2 - 1, maxZ: d / 2 + 3.2 }],
      spawn: () => ({ x: inner.spawn.x, z: d / 2 - 1.4, yaw: Math.PI }),
      surfaceAt: () => ({ grip: 1, roll: 1, kind: 'road' }),
      noCars: true,
      sync() {},
      update(dt, t) {
        inner.update(dt, t);
        if (api.player.z > d / 2 + 2.4 && !leaving) { leaving = true; api.emit({ type: 'act', id: 'go', place: 'town', from: id }); }
      },
      dispose() {},
    };
  };
}

export const INTERIORS = { supply: interiorLevel('supply'), academy: interiorLevel('academy'), boutique: interiorLevel('boutique'), diner: interiorLevel('diner'), dealer: interiorLevel('dealer') };

export { makeCone, makeCrate, makePlant, makeFloorLamp };
