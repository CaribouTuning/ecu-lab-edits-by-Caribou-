/**
 * The town: a main street with the shops along it, a ring road to drive round, a park,
 * a scrapyard, a petrol station, the car-meet car park and the road out to the drag
 * strip. You can walk all of it and drive all of it.
 *
 * Doors lead into the shops (each a small interior level), the strip gate leads to the
 * strip, and the garage door leads home. Places that are not open yet are shut for a
 * reason the sign says. A few golden spanners are hidden about for anyone who looks.
 */

import { world as W } from '../../tokens.js';
import { THREE, box, cone, cyl, floorPlane, glow, groundPlane, sign } from '../gfx.js';
import { makeBuilding, makeGasStation, makePylon } from '../models/buildings.js';
import { makeCar } from '../models/car.js';
import { closedBecause, PLACES, placeById } from '../locations.js';
import { PHASE_TIME } from './garage.js';
import {
  makeBarrel, makeBench, makeCone, makeCrate, makeFence, makePlant, makeRoundTree, makeStreetLamp, makeTree, makeTyreStack,
} from '../models/props.js';

import { dealerStock } from '../../career/ownedCars.js';
import { hash, pickBy } from './common.js';
import { loopPath, makeTraffic, makeWalkers } from './crowd.js';
import { npcLook } from '../appearance.js';
import { makePerson } from '../models/person.js';

export const TOWN = { minX: -86, maxX: 86, minZ: -56, maxZ: 58 };

/** Roads, as rectangles. The strip road runs east off the main street. */
const ROADS = [
  { x0: -86, x1: 86, z0: -5.5, z1: 5.5 },
  { x0: -5, x1: 5, z0: -53, z1: 53 },
  { x0: -77, x1: 77, z0: -53, z1: -43 },
  { x0: -77, x1: 77, z0: 43, z1: 53 },
  { x0: -77, x1: -67, z0: -53, z1: 53 },
  { x0: 67, x1: 77, z0: -53, z1: 53 },
];
const WALKWAYS = [
  { minX: -64, maxX: 64, minZ: -8, maxZ: -5.5 },
  { minX: -64, maxX: 64, minZ: 5.5, maxZ: 8 },
];
/** Places paved or tarmacked that are not roads: lots and aprons. */
const LOTS = [
  { x0: -64, x1: -28, z0: 8, z1: 16, kind: 'road' },
  { x0: -22, x1: -6, z0: 8, z1: 20, kind: 'road' },
  { x0: 38, x1: 66, z0: 8, z1: 36, kind: 'road' },
  { x0: -49, x1: -25, z0: -14, z1: -8, kind: 'road' },
];
const DIRT = [{ x0: 2, x1: 30, z0: 9, z1: 36 }];

const inRect = (x, z, r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

/**
 * @param {any} api
 * @param {{from?: string, car?: {x: number, z: number, heading?: number}}} [entry]
 */
export function buildTown(api, entry = {}) {
  const career = api.career();
  const phase = career.phase ?? 0;
  const night = phase >= 2;
  const root = new THREE.Group();
  const colliders = [];
  const interactables = [];
  const updaters = [];
  const found = new Set(career.found ?? []);
  const spanners = [];

  // ---- ground ----
  const grass = groundPlane(260, 220, { base: W.grass, alt: W.grassDark, kind: 'blades', tile: 3 });
  grass.position.set(0, -0.06, 0);
  root.add(grass);
  const addRoad = (r) => {
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const m = groundPlane(w, d, { base: W.asphalt, alt: W.asphaltDark, kind: 'speckle', tile: 3 });
    m.position.set((r.x0 + r.x1) / 2, -0.02, (r.z0 + r.z1) / 2);
    root.add(m);
  };
  ROADS.forEach(addRoad);
  // Centre lines and kerbs.
  for (let x = -84; x < 84; x += 6) root.add(box(2.6, 0.01, 0.2, W.roadLine, { x: x + 1.3, y: 0, z: 0, edge: false, cast: false }));
  for (let z = -52; z < 52; z += 6) if (Math.abs(z) > 6) root.add(box(0.2, 0.01, 2.6, W.roadLine, { x: 0, y: 0, z: z + 1.3, edge: false, cast: false }));
  for (const [x0, x1, z] of [[-77, 77, -48], [-77, 77, 48]]) for (let x = x0; x < x1; x += 6) root.add(box(2.6, 0.01, 0.2, W.roadLine, { x: x + 1.3, y: 0, z, edge: false, cast: false }));
  for (const x of [-72, 72]) for (let z = -52; z < 52; z += 6) root.add(box(0.2, 0.01, 2.6, W.roadLine, { x, y: 0, z: z + 1.3, edge: false, cast: false }));
  for (const r of WALKWAYS) {
    const m = groundPlane(r.maxX - r.minX, r.maxZ - r.minZ, { base: W.concrete, alt: W.concreteLight, line: W.concreteDark, kind: 'tile', tile: 2.5 });
    m.position.set((r.minX + r.maxX) / 2, 0.02, (r.minZ + r.maxZ) / 2);
    root.add(m);
    root.add(box(r.maxX - r.minX, 0.2, 0.25, W.curb, { x: (r.minX + r.maxX) / 2, y: 0.1, z: r.minZ < 0 ? r.maxZ + 0.1 : r.minZ - 0.1, edge: false }));
  }
  for (const l of LOTS) {
    const m = groundPlane(l.x1 - l.x0, l.z1 - l.z0, { base: W.concrete, alt: W.concreteDark, kind: 'speckle', tile: 3 });
    m.position.set((l.x0 + l.x1) / 2, 0.01, (l.z0 + l.z1) / 2);
    root.add(m);
  }
  for (const l of DIRT) {
    const m = groundPlane(l.x1 - l.x0, l.z1 - l.z0, { base: W.dirt, alt: W.dirtDark, kind: 'speckle', tile: 3 });
    m.position.set((l.x0 + l.x1) / 2, 0.01, (l.z0 + l.z1) / 2);
    root.add(m);
  }
  // The meet car park's painted bays.
  for (let i = 0; i < 9; i += 1) root.add(box(0.12, 0.012, 4.6, W.roadEdge, { x: 40 + i * 3, y: 0.03, z: 12, edge: false, cast: false }));

  // ---- the shops along the main street ----
  /** Place a building on the north side (front toward the street) or the south side. */
  const addBuilding = (spec, x0, depth, side = 'north', zFront = side === 'north' ? -8 : 16) => {
    const b = makeBuilding({ night, ...spec, d: depth });
    const cx = x0 + spec.w / 2;
    const cz = side === 'north' ? zFront - depth / 2 : zFront + depth / 2;
    b.position.set(cx, 0, cz);
    if (side === 'south') b.rotation.y = Math.PI;
    root.add(b);
    colliders.push({ x: cx, z: cz, hw: spec.w / 2 + 0.2, hd: depth / 2 + 0.2 });
    return b;
  };
  const place = (id) => placeById(id);
  const sign4 = (id, text) => { const p = place(id); const closed = closedBecause(career, p); return closed ? `${text}` : text; };
  addBuilding({ w: 22, h: 7.5, wall: W.brick, trim: W.concreteLight, roof: W.roof, doorX: 0, doorW: 4.4, doorColor: W.metalDark, text: 'YOUR TUNING SHOP', signColor: W.wallBlack, winCols: 3 }, -48, 14);
  addBuilding({ w: 14, h: 6, wall: W.wallBlue, trim: W.concreteLight, roof: W.metalDark, doorX: -0.5 + 0, text: sign4('supply', 'GEARHEAD SUPPLY'), signColor: W.toolBlue, awning: W.toolRed, shopfront: true }, -20, 12);
  addBuilding({ w: 16, h: 7, wall: W.plaster, trim: W.plasterDark, roof: W.roofGreen, roofKind: 'gable', doorX: 0, text: 'TUNING ACADEMY', signColor: W.roofGreen, awning: W.roofGreen, winCols: 4 }, -2, 14);
  addBuilding({ w: 12, h: 6, wall: W.wallPurple, trim: W.concreteLight, roof: W.metalDark, doorX: 0, text: 'THREADS', signColor: W.wallPurple, awning: W.neonPink, shopfront: true }, 18, 12);
  addBuilding({ w: 16, h: 5.5, wall: W.wallRed, trim: W.plaster, roof: W.metalDark, doorX: 0, text: 'POPS DINER', signColor: W.toolRed, awning: W.white, shopfront: true }, 34, 12);
  // South side: the dealership, a long glass showroom.
  addBuilding({ w: 30, h: 6, wall: W.wallGreen, trim: W.concreteLight, roof: W.metalDark, doorX: 0, doorW: 4, text: 'CARIBOU MOTORS', signColor: W.wallGreen, shopfront: true }, -60, 14, 'south', 16);
  // Petrol station.
  const gas = makeGasStation(16, 12);
  gas.position.set(-14, 0, 14);
  root.add(gas);
  for (const [x, z] of [[-21.4, 8.8], [-6.6, 8.8], [-21.4, 19.2], [-6.6, 19.2]]) colliders.push({ x, z, r: 0.35 });
  for (const x of [-18, -10]) colliders.push({ x, z: 14, hw: 0.5, hd: 1.1 });
  const kiosk = makeBuilding({ w: 7, d: 5, h: 3.4, wall: W.plaster, roof: W.toolRed, text: 'SHOP', signColor: W.toolRed, doorX: 0, doorW: 1.6, shopfront: true, night });
  kiosk.position.set(-14, 0, 29);
  kiosk.rotation.y = Math.PI;
  root.add(kiosk);
  colliders.push({ x: -14, z: 29, hw: 3.7, hd: 2.7 });

  // ---- the scrapyard ----
  const yard = new THREE.Group();
  const fenceN = makeFence(28);
  fenceN.position.set(16, 0, 9);
  root.add(fenceN);
  const fenceS = makeFence(28);
  fenceS.position.set(16, 0, 36);
  root.add(fenceS);
  for (const x of [2, 30]) { const f = makeFence(27); f.rotation.y = Math.PI / 2; f.position.set(x, 0, 22.5); root.add(f); }
  colliders.push({ x: 8, z: 9, hw: 6, hd: 0.3 }, { x: 24.5, z: 9, hw: 5.5, hd: 0.3 }, { x: 16, z: 36, hw: 14, hd: 0.3 }, { x: 2, z: 22.5, hw: 0.3, hd: 13.5 }, { x: 30, z: 22.5, hw: 0.3, hd: 13.5 });
  root.add(box(3.4, 0.2, 0.2, W.hazard, { x: 16, y: 1.3, z: 9, edge: false }));
  root.add(yard);
  /** @type {[number, number, number, string, string][]} */
  const wrecks = [[6, 14, 0.5, 'sedan', 'grey'], [11, 24, 2.4, 'hatch', 'orange'], [20, 15, -0.4, 'coupe', 'blue'], [24, 28, 1.3, 'pickup', 'green'], [8, 31, 0.1, 'wagon', 'pewter'], [26, 18, 3.0, 'muscle', 'red']];
  for (const [x, z, ry, body, color] of wrecks) {
    const c = makeCar({ body, color, wheels: 'steel', engine: { layout: 'V6' } });
    c.group.position.set(x, 0, z);
    c.group.rotation.set(0.04, ry, 0.05);
    c.setHood(true);
    c.update(10);
    root.add(c.group);
    colliders.push({ x, z, r: 1.9 });
  }
  for (const [x, z] of [[14, 12], [18, 31], [5, 22], [27, 34], [13, 33]]) { const t = makeTyreStack(5); t.position.set(x, 0, z); root.add(t); colliders.push({ x, z, r: 0.5 }); }
  for (const [x, z, c] of /** @type {[number, number, string][]} */ ([[4, 10.5, W.barrel], [28, 11, W.barrelRed], [28, 33, W.barrel]])) { const b = makeBarrel(c); b.position.set(x, 0, z); root.add(b); colliders.push({ x, z, r: 0.4 }); }
  for (const [x, z] of [[9, 17], [22, 21], [15, 27]]) { const c = makeCrate(); c.position.set(x, 0, z); root.add(c); colliders.push({ x, z, r: 0.5 }); }
  const junkSign = sign('SPARKYS SCRAPYARD', { w: 6, h: 0.9, bg: W.wallBase, fg: W.hazard });
  junkSign.position.set(16, 3.4, 9.2);
  root.add(junkSign);

  // ---- the car meet lot ----
  const meetSign = makePylon('CAR MEET', W.neonPink);
  meetSign.position.set(52, 0, 9.6);
  root.add(meetSign);
  colliders.push({ x: 52, z: 9.6, r: 0.4 });
  if (night) {
    for (let i = 0; i < 7; i += 1) {
      const h = hash(`meetcar${i}`);
      const c = makeCar({ body: pickBy(['coupe', 'muscle', 'hatch', 'supercar', 'sedan', 'roadster'], h, 1), color: pickBy(['red', 'blue', 'candy', 'lime', 'purple', 'sunset', 'midnight', 'white'], h, 2), wheels: pickBy(['mesh', 'race', 'deep'], h, 3), spoiler: pickBy(['wing', 'gt', 'lip'], h, 4), underglow: pickBy(['neonPink', 'neonCyan', 'neonGreen', 'neonAmber'], h, 5), lowered: 0.8, engine: { layout: 'V8', turbo: true } });
      c.group.position.set(40.5 + i * 3.4, 0, 14);
      c.group.rotation.y = Math.PI + pickBy([0, 0.1, -0.1], h, 6);
      root.add(c.group);
      colliders.push({ x: 40.5 + i * 3.4, z: 14, hw: 1.0, hd: 2.2 });
    }
  }
  for (const [x, z] of [[40, 34], [66, 34], [40, 9], [66, 9]]) { const c = makeCone(); c.position.set(x, 0, z); root.add(c); }
  // The show spot: a turntable under a spotlight, where a car is presented to the judges.
  const PODIUM = { x: 52, z: 26 };
  const podium = new THREE.Group();
  podium.position.set(PODIUM.x, 0, PODIUM.z);
  podium.add(cyl(3.3, 3.5, 0.25, W.cloth.charcoal, { y: 0.125, seg: 20, edge: false }));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.07, 6, 28), glow(W.neonPink));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.27;
  podium.add(ring);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(3.6, 9, 20, 1, true), glow(W.white, night ? 0.08 : 0.03));
  beam.position.y = 4.7;
  beam.material.depthWrite = false;
  podium.add(beam);
  root.add(podium);
  const spectators = [];
  if (night) {
    for (let i = 0; i < 9; i += 1) {
      const a = (i / 9) * Math.PI * 2;
      const p = makePerson(npcLook(hash(`meetfan${i}`)), { mood: 'smile' });
      p.group.position.set(PODIUM.x + Math.cos(a) * 6.2, 0, PODIUM.z + Math.sin(a) * 6.2);
      p.group.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));
      root.add(p.group);
      spectators.push(p);
    }
  }
  /** @type {null|{rig: any, t: number}} */
  let presenting = null;

  // ---- the park ----
  const pond = floorPlane(22, 12, W.water, { x: -35, z: -33, y: 0.0 });
  pond.material = new THREE.MeshToonMaterial({ color: W.water, transparent: true, opacity: 0.88 });
  root.add(pond);
  colliders.push({ x: -35, z: -33, hw: 10.5, hd: 5.5 });
  const rngSeed = hash(`trees${career.seed ?? 0}`);
  const treeRect = [
    { x0: -64, x1: -10, z0: -44, z1: -22 }, { x0: -86, x1: -78, z0: -56, z1: 56 }, { x0: 78, x1: 86, z0: -56, z1: -8 }, { x0: 78, x1: 86, z0: 8, z1: 56 },
    { x0: -64, x1: 64, z0: 54, z1: 58 }, { x0: -64, x1: 64, z0: -56, z1: -54 }, { x0: 8, x1: 62, z0: -42, z1: -14 },
  ];
  const clear = (x, z) => ROADS.some((r) => x > r.x0 - 3 && x < r.x1 + 3 && z > r.z0 - 3 && z < r.z1 + 3)
    || (x > -22 && x < 52 && z > -22 && z < -8) || (x > -50 && x < -24 && z > -22 && z < -8) || (x > 36 && x < 66 && z > 8 && z < 36) || (x > -24 && x < 32 && z > 8 && z < 36)
    || (x > -64 && x < -28 && z > 8 && z < 30) || (x > -46 && x < -24 && z > -35 && z < -28) || (x > -48 && x < -22 && z > -39 && z < -28);
  let seed = rngSeed;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  let trees = 0;
  for (const r of treeRect) {
    const n = Math.round(((r.x1 - r.x0) * (r.z1 - r.z0)) / 55);
    for (let i = 0; i < n && trees < 170; i += 1) {
      const x = r.x0 + rand() * (r.x1 - r.x0);
      const z = r.z0 + rand() * (r.z1 - r.z0);
      if (clear(x, z)) continue;
      const t = rand() < 0.5 ? makeTree(trees, false) : makeRoundTree(trees);
      t.position.set(x, 0, z);
      root.add(t);
      colliders.push({ x, z, r: 0.55 });
      trees += 1;
    }
  }
  for (const [x, z, ry] of [[-52, -26, 0], [-26, -26, Math.PI], [-44, -39, 0]]) { const b = makeBench(); b.position.set(x, 0, z); b.rotation.y = ry; root.add(b); colliders.push({ x, z, hw: 0.9, hd: 0.35 }); }
  for (const [x, z] of [[-55, -30], [-18, -30], [-30, -26]]) { const p = makePlant(true); p.position.set(x, 0, z); root.add(p); }
  // Hills round the edge of the world, so the town does not end at a cliff.
  for (let i = 0; i < 26; i += 1) {
    const a = (i / 26) * Math.PI * 2;
    const rx = 120 + (i % 3) * 12;
    const rz = 96 + (i % 4) * 8;
    const h = 10 + (i % 5) * 4;
    const m = cone(14 + (i % 3) * 3, h, i % 2 ? W.rock : W.grassDark, { x: Math.cos(a) * rx, y: h / 2 - 0.5, z: Math.sin(a) * rz, seg: 5, edge: false });
    m.castShadow = false;
    root.add(m);
  }

  // ---- street furniture ----
  const lamps = [];
  for (let x = -60; x <= 60; x += 15) for (const z of [-5.2, 5.2]) {
    const l = makeStreetLamp(night);
    l.position.set(x, 0, z);
    l.rotation.y = z < 0 ? 0 : Math.PI;
    root.add(l);
    colliders.push({ x, z, r: 0.2 });
    lamps.push(l);
    if (night) {
      const pool = new THREE.Mesh(new THREE.CircleGeometry(5.5, 18), glow(W.lampWarm, 0.16));
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(x + (z < 0 ? 0.6 : -0.6), 0.04, z + (z < 0 ? 2 : -2));
      root.add(pool);
    }
  }
  // The gateway to the drag strip across the road at the east end.
  const gateL = box(0.7, 7, 0.7, W.metalDark, { x: 80, y: 3.5, z: -8 });
  const gateR = box(0.7, 7, 0.7, W.metalDark, { x: 80, y: 3.5, z: 8 });
  root.add(gateL, gateR);
  root.add(box(1.0, 1.6, 17, W.toolYellow, { x: 80, y: 7, z: 0 }));
  const gs = sign('DRAG STRIP', { w: 6, h: 1.2, bg: W.toolYellow, fg: W.black });
  gs.position.set(78.99, 7, 0);
  gs.rotation.y = -Math.PI / 2;
  root.add(gs);
  const gs2 = sign('DRAG STRIP', { w: 6, h: 1.2, bg: W.toolYellow, fg: W.black });
  gs2.position.set(81.01, 7, 0);
  gs2.rotation.y = Math.PI / 2;
  root.add(gs2);
  colliders.push({ x: 80, z: -8, r: 0.5 }, { x: 80, z: 8, r: 0.5 });

  // ---- doors ----
  for (const p of PLACES) {
    if (['gas', 'meet', 'strip', 'junk'].includes(p.id) && p.id !== 'junk') continue;
    interactables.push({
      id: `place:${p.id}`, x: p.door.x, z: p.door.z, r: p.id === 'junk' ? 2.2 : 1.9, onFoot: true,
      label: () => { const why = closedBecause(api.career(), p); return why ? `${p.name}: closed` : `Go in: ${p.name}`; },
      hint: () => closedBecause(api.career(), p) ?? p.blurb,
      run: () => {
        const why = closedBecause(api.career(), p);
        if (why) { api.emit({ type: 'toast', text: `${p.name} is closed. ${why}`, tone: 'warn' }); return; }
        api.emit({ type: 'act', id: 'go', place: p.id });
      },
    });
  }
  // Hints are strings in the prompt: resolve function hints.
  for (const it of interactables) if (typeof it.hint === 'function') { const h = it.hint; Object.defineProperty(it, 'hint', { get: () => h(), enumerable: true }); }
  // Park the car you are driving in the shop.
  interactables.push({
    id: 'park', x: -37, z: -4.4, r: 5, carOnly: true, maxSpeed: 7, label: 'Park it in the shop', hint: 'Back it onto its lift.',
    run: () => api.emit({ type: 'act', id: 'parkCar' }),
  });
  // The strip gate, on foot or in a car.
  interactables.push({
    id: 'strip', x: 77, z: 0, r: 5, maxSpeed: 12,
    label: () => { const why = closedBecause(api.career(), placeById('strip')); return why ? 'Drag strip: closed' : 'Go to the drag strip'; },
    hint: () => closedBecause(api.career(), placeById('strip')) ?? 'Race your own cars.',
    run: () => {
      const why = closedBecause(api.career(), placeById('strip'));
      if (why) { api.emit({ type: 'toast', text: `The strip is closed. ${why}`, tone: 'warn' }); return; }
      api.emit({ type: 'act', id: 'go', place: 'strip' });
    },
  });
  // The fuel pumps.
  interactables.push({
    id: 'pump', x: -14, z: 14, r: 7, carOnly: true, maxSpeed: 4, label: 'Fill up', hint: 'Choose your fuel.',
    run: () => api.emit({ type: 'act', id: 'pump' }),
  });
  // The meet.
  interactables.push({
    id: 'meet', x: 52, z: 22, r: 11, maxSpeed: 12,
    label: () => { const why = closedBecause(api.career(), placeById('meet')); return why ? 'Car meet: closed' : 'Join the car meet'; },
    hint: () => closedBecause(api.career(), placeById('meet')) ?? 'Show your car and your look.',
    run: () => {
      const why = closedBecause(api.career(), placeById('meet'));
      if (why) { api.emit({ type: 'toast', text: `The meet is not on yet. ${why}`, tone: 'warn' }); return; }
      api.emit({ type: 'act', id: 'meet' });
    },
  });
  // Benches.
  interactables.push({ id: 'bench', x: -52, z: -24.6, r: 1.8, onFoot: true, label: 'Sit and look at the pond', hint: 'A moment to breathe.', run: () => api.emit({ type: 'act', id: 'bench' }) });
  for (const it of interactables) if (typeof it.hint === 'function') { const h = it.hint; Object.defineProperty(it, 'hint', { get: () => h(), enumerable: true }); }

  // ---- golden spanners ----
  const SPANNER_AT = [[-30, -38], [-58, -30], [50, -30], [-72, 30], [70, 40], [-12, 38], [30, -20], [12, -50], [60, 24], [-4, 46]];
  SPANNER_AT.forEach(([x, z], i) => {
    const g = new THREE.Group();
    const head = cyl(0.3, 0.3, 0.1, W.paint.gold, { y: 0.9, axis: 'z', seg: 8, edge: false });
    const handle = box(0.12, 0.7, 0.07, W.paint.gold, { y: 0.55, edge: false });
    const glowRing = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 6, 14), glow(W.paint.gold, 0.6));
    glowRing.rotation.x = Math.PI / 2;
    glowRing.position.y = 0.15;
    g.add(head, handle, glowRing);
    g.position.set(x, 0, z);
    g.userData = { id: i, x, z, glowRing };
    root.add(g);
    spanners.push(g);
  });

  // ---- people and traffic ----
  const walkAreas = [...WALKWAYS, { minX: -56, maxX: -14, minZ: -40, maxZ: -26 }, { minX: 40, maxX: 64, minZ: 10, maxZ: 34 }];
  const walkers = makeWalkers(root, walkAreas, night ? 14 : 9, hash(`town${career.day}`), (x, z) => colliders.some((c) => (c.r != null ? Math.hypot(c.x - x, c.z - z) < c.r + 0.4 : Math.abs(c.x - x) < c.hw + 0.4 && Math.abs(c.z - z) < c.hd + 0.4)));
  const trafficCols = [];
  const traffic = makeTraffic(root, loopPath(0, 0, 72, 48, 12, true), night ? 2 : 4, hash(`traffic${career.day}`), trafficCols);
  colliders.push(...trafficCols);
  updaters.push((dt) => walkers.update(dt), (dt) => traffic.update(dt));

  // The dealer's lot: cars on show. They are drawn by the dealership panel's list, so the
  // lot shows what is for sale today.
  const forSale = dealerStock(career).slice(0, 4);
  forSale.forEach((s, i) => {
    const c = makeCar({ body: s.body, color: s.color, wheels: s.wheels ?? 'alloy5', engine: s.engine ?? { layout: 'V6' }, plate: s.plate });
    c.group.position.set(-56 + i * 8.6, 0.0, 12);
    c.group.rotation.y = Math.PI + 0.4 - (i % 2) * 0.8;
    root.add(c.group);
    colliders.push({ x: -56 + i * 8.6, z: 12, hw: 1.1, hd: 2.3 });
  });

  // ---- the level ----
  const surfaceAt = (x, z) => {
    for (const r of ROADS) if (inRect(x, z, r)) return { grip: 1, roll: 1, kind: 'road' };
    for (const l of LOTS) if (inRect(x, z, l)) return { grip: 1, roll: 1, kind: 'road' };
    for (const r of WALKWAYS) if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return { grip: 0.95, roll: 1.1, kind: 'road' };
    for (const l of DIRT) if (inRect(x, z, l)) return { grip: 0.72, roll: 2.4, kind: 'dirt' };
    return { grip: 0.55, roll: 3.6, kind: 'grass' };
  };
  const level = {
    root, colliders, interactables, time: PHASE_TIME[phase],
    camera: { pitch: 0.95, dist: 30, yaw: 0, fov: 30 },
    bounds: [{ minX: TOWN.minX + 1, maxX: TOWN.maxX - 1, minZ: TOWN.minZ + 1, maxZ: TOWN.maxZ - 1 }],
    spawn: (e) => {
      const p = e.from && e.from !== 'drive' ? placeById(e.from) : null;
      if (p) return { x: p.door.x, z: p.door.z + (p.door.z < 0 ? 2.2 : -2.2), yaw: p.door.z < 0 ? 0 : Math.PI };
      return { x: -37, z: -3, yaw: 0 };
    },
    surfaceAt,
    sync() { /* nothing in the town depends on the shop's save while you are in it */ },
    cinematic: () => (presenting ? { x: PODIUM.x, z: PODIUM.z, heading: 0, speed: 0, mode: 'follow', yaw: presenting.t * 0.45 + 0.4, pitch: 0.36, dist: 12, fov: 34 } : null),
    cmd(name, ...args) {
      if (name === 'present') {
        const rig = args[0];
        root.add(rig.group);
        rig.group.position.set(PODIUM.x, 0.25, PODIUM.z);
        presenting = { rig, t: 0 };
        api.player.locked = true;
        api.person.group.visible = false;
        for (const p of spectators) p.setPose('cheer');
      } else if (name === 'endPresent' && presenting) {
        root.remove(presenting.rig.group);
        presenting = null;
        api.player.locked = false;
        api.person.group.visible = true;
        for (const p of spectators) p.setPose('idle');
      }
      return undefined;
    },
    update(dt, t) {
      for (const u of updaters) u(dt);
      for (const p of spectators) p.update(dt, 0);
      if (presenting) { presenting.t += dt; presenting.rig.group.rotation.y = presenting.t * 0.45; presenting.rig.update(dt); }
      ring.rotation.z = t * 0.5;
      const px = api.drive?.inside ? api.drive.state.x : api.player.x;
      const pz = api.drive?.inside ? api.drive.state.z : api.player.z;
      for (const s of spanners) {
        const u = s.userData;
        if (found.has(u.id)) { s.visible = false; continue; }
        s.rotation.y = t * 2 + u.id;
        s.position.y = 0.2 + Math.sin(t * 2.5 + u.id) * 0.1;
        if (Math.hypot(u.x - px, u.z - pz) < 1.8) {
          found.add(u.id);
          s.visible = false;
          api.emit({ type: 'act', id: 'found', n: u.id, count: found.size });
        }
      }
    },
    noCars: false,
    dispose() {},
  };
  void entry;
  void lamps;
  return level;
}
