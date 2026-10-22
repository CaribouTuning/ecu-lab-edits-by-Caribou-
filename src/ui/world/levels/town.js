/**
 * The town: downtown's main street with the shops along it, and round it a grid of avenues,
 * two winding residential drives, an industrial estate and a ring highway; outside the
 * highway, the drag strip to the north and Caribou Raceway to the south. All of it can be
 * walked and all of it driven. Its plan (roads, venues) is data in townPlan.js.
 *
 * Doors lead into the shops (each a small interior level) and the garage door leads home.
 * Places that are not open yet are shut for a reason the sign says. A few golden spanners
 * are hidden about for anyone who looks.
 */

import { world as W } from '../../tokens.js';
import { THREE, box, cone, cyl, floorPlane, glow, groundMaterial, groundPlane, mergeStatic, sign, toon } from '../gfx.js';
import { makeBuilding, makeGasStation, makePylon } from '../models/buildings.js';
import { makeCar } from '../models/car.js';
import { closedBecause, PLACES, placeById } from '../locations.js';
import { PHASE_TIME } from './garage.js';
import {
  makeBarrel, makeBench, makeBush, makeCone, makeCrate, makeFence, makePlant, makeRoundTree, makeStreetLamp, makeTree, makeTyreStack,
} from '../models/props.js';

import { dealerStock } from '../../career/ownedCars.js';
import { hash, pickBy } from './common.js';
import { loopPath, makeTraffic, makeWalkers } from './crowd.js';
import { npcLook } from '../appearance.js';
import { makePerson } from '../models/person.js';
import { measuredPath } from './roadNet.js';
import { CIRCUIT, DIRT, HIGHWAY, KEEP_CLEAR, LOTS, NET, ROADS, SITES, STRIP, TOWN, siteAt, surfaceAt } from './townPlan.js';
import { makeVenues } from './venue.js';

export { TOWN };

/**
 * A strip of ground along a centre line: one quad per segment, joined with mitred corners,
 * its texture coordinates in world metres so every strip on one material lines up.
 * @param {{x: number, z: number}[]} pts @param {number} w @param {boolean} closed @param {number} tile @param {number} y
 * @param {{pos: number[], uv: number[], idx: number[]}} out
 */
function ribbon(pts, w, closed, tile, y, out) {
  const p = closed ? [...pts, pts[0]] : pts;
  const n = p.length;
  const base = out.pos.length / 3;
  for (let i = 0; i < n; i += 1) {
    const a = p[i === 0 ? (closed ? n - 2 : 0) : i - 1];
    const b = p[i === n - 1 ? (closed ? 1 : n - 1) : i + 1];
    let dx = b.x - a.x;
    let dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    // The corner's own direction change sets how far the edge must reach (the mitre).
    const prev = i > 0 ? p[i - 1] : closed ? p[n - 2] : p[0];
    const next = i < n - 1 ? p[i + 1] : closed ? p[1] : p[n - 1];
    const d1 = Math.atan2(p[i].x - prev.x, p[i].z - prev.z);
    const d2 = Math.atan2(next.x - p[i].x, next.z - p[i].z);
    const turn = Math.abs(((d2 - d1 + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI);
    const mit = Math.min(2, 1 / Math.max(0.3, Math.cos(turn / 2)));
    const lx = dz * (w / 2) * mit;
    const lz = -dx * (w / 2) * mit;
    for (const s of [1, -1]) {
      const x = p[i].x + lx * s;
      const z = p[i].z + lz * s;
      out.pos.push(x, y, z);
      out.uv.push(x / tile, -z / tile);
    }
    if (i < n - 1) {
      const k = base + i * 2;
      out.idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
}

/** @param {{pos: number[], uv: number[], idx: number[]}} g @param {THREE.Material} mat */
function meshOf(g, mat) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
  geo.setIndex(g.idx);
  geo.computeVertexNormals();
  // Ribbons wind either way round depending on the road's direction: draw both faces.
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  return m;
}

/** Points a fixed distance to the left of a line. */
function offsetLine(pts, off, closed) {
  const p = closed ? [...pts, pts[0]] : pts;
  return p.map((q, i) => {
    const a = p[Math.max(0, i - 1)];
    const b = p[Math.min(p.length - 1, i + 1)];
    const h = Math.atan2(b.x - a.x, b.z - a.z);
    return { x: q.x + Math.cos(h) * off, z: q.z - Math.sin(h) * off };
  });
}

/** Distance from a point to a road's centre line, squared. */
function nearRoad(road, x, z) {
  const p = road.closed ? [...road.pts, road.pts[0]] : road.pts;
  let best = Infinity;
  for (let i = 0; i < p.length - 1; i += 1) {
    const ax = p[i].x; const az = p[i].z; const dx = p[i + 1].x - ax; const dz = p[i + 1].z - az;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    best = Math.min(best, (ax + dx * t - x) ** 2 + (az + dz * t - z) ** 2);
  }
  return best;
}

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
  /** Is there already something solid here? */
  const blocked = (x, z, pad = 0.4) => colliders.some((c) => (c.r != null ? Math.hypot(c.x - x, c.z - z) < c.r + pad : Math.abs(c.x - x) < c.hw + pad && Math.abs(c.z - z) < c.hd + pad));
  /** Is this point near any road, lot or venue tarmac? */
  const nearPaving = (x, z, pad) => !!NET.roadAt(x, z) || [[pad, 0], [-pad, 0], [0, pad], [0, -pad], [pad, pad], [-pad, -pad], [pad, -pad], [-pad, pad]].some(([dx, dz]) => NET.roadAt(x + dx, z + dz)) || LOTS.some((l) => x > l.x0 - pad && x < l.x1 + pad && z > l.z0 - pad && z < l.z1 + pad);

  // ---- ground ----
  const cx = (TOWN.minX + TOWN.maxX) / 2;
  const cz = (TOWN.minZ + TOWN.maxZ) / 2;
  const grass = groundPlane(TOWN.maxX - TOWN.minX + 260, TOWN.maxZ - TOWN.minZ + 260, { base: W.grass, alt: W.grassDark, kind: 'blades', tile: 3, flowers: [W.flowerA, W.flowerB, W.white] });
  grass.position.set(cx, -0.06, cz);
  root.add(grass);

  // ---- roads: one mesh of tarmac for the whole town ----
  const tarmac = { pos: [], uv: [], idx: [] };
  for (const r of ROADS) ribbon(r.pts, r.w, !!r.closed, 3, r.kind === 'track' ? -0.01 : r.kind === 'strip' ? -0.012 : -0.02, tarmac);
  const asphaltMat = groundMaterial({ base: W.asphalt, alt: W.asphaltDark, kind: 'speckle' });
  asphaltMat.side = THREE.DoubleSide;
  root.add(meshOf(tarmac, asphaltMat));
  const paveMat = groundMaterial({ base: W.concrete, alt: W.concreteDark, kind: 'speckle' });
  paveMat.side = THREE.DoubleSide;
  const paving = { pos: [], uv: [], idx: [] };
  for (const l of LOTS) ribbon([{ x: l.x0, z: (l.z0 + l.z1) / 2 }, { x: l.x1, z: (l.z0 + l.z1) / 2 }], l.z1 - l.z0, false, 3, -0.005, paving);
  root.add(meshOf(paving, paveMat));
  for (const l of DIRT) {
    const m = groundPlane(l.x1 - l.x0, l.z1 - l.z0, { base: W.dirt, alt: W.dirtDark, kind: 'speckle', tile: 3 });
    m.position.set((l.x0 + l.x1) / 2, 0.0, (l.z0 + l.z1) / 2);
    root.add(m);
  }
  // Markings: dashed centre lines that stop at junctions, solid edges on the highway.
  const lineMat = toon(W.roadLine);
  const edgeMat = toon(W.roadEdge);
  const marks = { pos: [], uv: [], idx: [] };
  const edges = { pos: [], uv: [], idx: [] };
  for (const r of ROADS) {
    if (!r.lines) continue;
    const path = measuredPath(r.pts, !!r.closed);
    const others = ROADS.filter((o) => o !== r && o.kind !== 'lot');
    for (let d = 3; d < path.length - 3; d += 6) {
      const a = path.at(d);
      if (others.some((o) => nearRoad(o, a.x, a.z) < (o.w / 2 + 2) ** 2)) continue;
      const b = path.at(d + 2.6);
      ribbon([a, b], 0.2, false, 1, 0.0, marks);
    }
    if (r.kind === 'highway') for (const side of [-1, 1]) ribbon(offsetLine(r.pts, side * (r.w / 2 - 0.6), true), 0.16, false, 1, 0.0, edges);
  }
  root.add(meshOf(marks, lineMat));
  root.add(meshOf(edges, edgeMat));
  // Pavements along downtown's main street.
  for (const z of [-6.8, 6.8]) {
    const m = groundPlane(130, 2.6, { base: W.concrete, alt: W.concreteLight, line: W.concreteDark, kind: 'tile', tile: 2.5 });
    m.position.set(0, 0.02, z);
    root.add(m);
    root.add(box(130, 0.2, 0.25, W.curb, { x: 0, y: 0.1, z: z < 0 ? z + 1.4 : z - 1.4, edge: false }));
  }

  // ---- downtown: the shops along the main street ----
  /** Place a building on the north side (front toward the street) or the south side. */
  const addBuilding = (spec, x0, depth, side = 'north', zFront = side === 'north' ? -8 : 16) => {
    const b = makeBuilding({ night, ...spec, d: depth });
    const bx = x0 + spec.w / 2;
    const bz = side === 'north' ? zFront - depth / 2 : zFront + depth / 2;
    b.position.set(bx, 0, bz);
    if (side === 'south') b.rotation.y = Math.PI;
    root.add(b);
    colliders.push({ x: bx, z: bz, hw: spec.w / 2 + 0.2, hd: depth / 2 + 0.2 });
    return b;
  };
  /**
   * A place built where its district puts it: its pieces go in a group moved to the site, and its
   * colliders move with it. (See SITES in the town plan.)
   * @param {string} id
   */
  const site = (id) => {
    const o = SITES[id];
    const g = new THREE.Group();
    g.position.set(o.dx, 0, o.dz);
    root.add(g);
    return { add: (/** @type {THREE.Object3D[]} */ ...ob) => { g.add(...ob); }, col: (/** @type {any[]} */ ...cs) => { for (const c of cs) colliders.push({ ...c, x: c.x + o.dx, z: c.z + o.dz }); } };
  };
  addBuilding({ w: 22, h: 7.5, wall: W.brick, trim: W.concreteLight, roof: W.roof, doorX: 0, doorW: 4.4, doorColor: W.metalDark, text: 'YOUR TUNING SHOP', signColor: W.wallBlack, winCols: 3 }, -48, 14);
  addBuilding({ w: 14, h: 6, wall: W.wallBlue, trim: W.concreteLight, roof: W.metalDark, doorX: 0, text: 'GEARHEAD SUPPLY', signColor: W.toolBlue, awning: W.toolRed, shopfront: true }, -20 + SITES.supply.dx, 12, 'north', -8 + SITES.supply.dz);
  addBuilding({ w: 16, h: 7, wall: W.plaster, trim: W.plasterDark, roof: W.roofGreen, roofKind: 'gable', doorX: 0, text: 'TUNING ACADEMY', signColor: W.roofGreen, awning: W.roofGreen, winCols: 4 }, -2 + SITES.academy.dx, 14, 'north', -8 + SITES.academy.dz);
  addBuilding({ w: 12, h: 6, wall: W.wallPurple, trim: W.concreteLight, roof: W.metalDark, doorX: 0, text: 'THREADS', signColor: W.wallPurple, awning: W.neonPink, shopfront: true }, 18, 12);
  addBuilding({ w: 16, h: 5.5, wall: W.wallRed, trim: W.plaster, roof: W.metalDark, doorX: 0, text: 'POPS DINER', signColor: W.toolRed, awning: W.white, shopfront: true }, 34, 12);
  addBuilding({ w: 30, h: 6, wall: W.wallGreen, trim: W.concreteLight, roof: W.metalDark, doorX: 0, doorW: 4, text: 'CARIBOU MOTORS', signColor: W.wallGreen, shopfront: true }, -60 + SITES.dealer.dx, 14, 'south', 16 + SITES.dealer.dz);
  // Downtown's other shops, where the places that moved out to the districts used to stand:
  // somewhere to walk past on Main Street, nothing to go into.
  addBuilding({ w: 14, h: 6, wall: W.plaster, trim: W.plasterDark, roof: W.metalDark, doorX: 0, text: 'BAKERY', signColor: W.wallRed, awning: W.white, shopfront: true }, -20, 12);
  addBuilding({ w: 16, h: 7, wall: W.brick, trim: W.concreteLight, roof: W.roof, roofKind: 'gable', doorX: 0, text: 'RECORDS', signColor: W.wallPurple, awning: W.wallPurple, shopfront: true }, -2, 13);
  addBuilding({ w: 14, h: 6, wall: W.wallBlue, trim: W.concreteLight, roof: W.metalDark, doorX: 0, text: 'BARBER', signColor: W.toolRed, awning: W.white, shopfront: true }, -60, 12, 'south', 16);
  addBuilding({ w: 14, h: 5.5, wall: W.plasterDark, trim: W.plaster, roof: W.roofGreen, doorX: 0, text: 'LAUNDRY', signColor: W.toolBlue, shopfront: true }, -44, 12, 'south', 16);
  addBuilding({ w: 16, h: 6, wall: W.wallGreen, trim: W.concreteLight, roof: W.metalDark, doorX: 0, text: 'BOOKS', signColor: W.wallGreen, awning: W.toolRed, shopfront: true }, -22, 12, 'south', 16);
  addBuilding({ w: 26, h: 8, wall: W.wallRed, trim: W.plaster, roof: W.metalDark, doorX: 0, doorW: 4, text: 'CINEMA', signColor: W.toolYellow, awning: W.toolYellow, shopfront: true }, 3, 14, 'south', 16);
  addBuilding({ w: 14, h: 6, wall: W.plaster, trim: W.plasterDark, roof: W.toolRed, doorX: 0, text: 'PIZZA', signColor: W.toolRed, awning: W.toolRed, shopfront: true }, 38, 12, 'south', 16);
  addBuilding({ w: 12, h: 6, wall: W.wallPurple, trim: W.concreteLight, roof: W.metalDark, doorX: 0, text: 'ARCADE', signColor: W.neonPink, shopfront: true }, 54, 12, 'south', 16);
  const gasSite = site('gas');
  const gas = makeGasStation(16, 12);
  gas.position.set(-14, 0, 14);
  gasSite.add(gas);
  for (const [x, z] of [[-21.4, 8.8], [-6.6, 8.8], [-21.4, 19.2], [-6.6, 19.2]]) gasSite.col({ x, z, r: 0.35 });
  for (const x of [-18, -10]) gasSite.col({ x, z: 14, hw: 0.5, hd: 1.1 });
  const kiosk = makeBuilding({ w: 7, d: 5, h: 3.4, wall: W.plaster, roof: W.toolRed, text: 'SHOP', signColor: W.toolRed, doorX: 0, doorW: 1.6, shopfront: true, night });
  kiosk.position.set(-14, 0, 29);
  kiosk.rotation.y = Math.PI;
  gasSite.add(kiosk);
  gasSite.col({ x: -14, z: 29, hw: 3.7, hd: 2.7 });

  // ---- the scrapyard ----
  const junkSite = site('junk');
  const fenceN = makeFence(28);
  fenceN.position.set(16, 0, 9);
  junkSite.add(fenceN);
  const fenceS = makeFence(28);
  fenceS.position.set(16, 0, 36);
  junkSite.add(fenceS);
  for (const x of [2, 30]) { const f = makeFence(27); f.rotation.y = Math.PI / 2; f.position.set(x, 0, 22.5); junkSite.add(f); }
  junkSite.col({ x: 8, z: 9, hw: 6, hd: 0.3 }, { x: 24.5, z: 9, hw: 5.5, hd: 0.3 }, { x: 16, z: 36, hw: 14, hd: 0.3 }, { x: 2, z: 22.5, hw: 0.3, hd: 13.5 }, { x: 30, z: 22.5, hw: 0.3, hd: 13.5 });
  junkSite.add(box(3.4, 0.2, 0.2, W.hazard, { x: 16, y: 1.3, z: 9, edge: false }));
  /** @type {[number, number, number, string, string][]} */
  const wrecks = [[6, 14, 0.5, 'sedan', 'grey'], [11, 24, 2.4, 'hatch', 'orange'], [20, 15, -0.4, 'coupe', 'blue'], [24, 28, 1.3, 'pickup', 'green'], [8, 31, 0.1, 'wagon', 'pewter'], [26, 18, 3.0, 'muscle', 'red']];
  for (const [x, z, ry, body, color] of wrecks) {
    const c = makeCar({ body, color, wheels: 'steel', engine: { layout: 'V6' } });
    c.group.position.set(x, 0, z);
    c.group.rotation.set(0.04, ry, 0.05);
    c.setHood(true);
    c.update(10);
    junkSite.add(c.group);
    junkSite.col({ x, z, r: 1.9 });
  }
  for (const [x, z] of [[14, 12], [18, 31], [5, 22], [27, 34], [13, 33]]) { const t = makeTyreStack(5); t.position.set(x, 0, z); junkSite.add(t); junkSite.col({ x, z, r: 0.5 }); }
  for (const [x, z, c] of /** @type {[number, number, string][]} */ ([[4, 10.5, W.barrel], [28, 11, W.barrelRed], [28, 33, W.barrel]])) { const b = makeBarrel(c); b.position.set(x, 0, z); junkSite.add(b); junkSite.col({ x, z, r: 0.4 }); }
  for (const [x, z] of [[9, 17], [22, 21], [15, 27]]) { const c = makeCrate(); c.position.set(x, 0, z); junkSite.add(c); junkSite.col({ x, z, r: 0.5 }); }
  const junkSign = sign('SPARKYS SCRAPYARD', { w: 6, h: 0.9, bg: W.wallBase, fg: W.hazard });
  junkSign.position.set(16, 3.4, 9.2);
  junkSite.add(junkSign);

  // ---- the car meet lot ----
  const meetSite = site('meet');
  for (let i = 0; i < 9; i += 1) meetSite.add(box(0.12, 0.012, 4.6, W.roadEdge, { x: 40 + i * 3, y: 0.03, z: 12, edge: false, cast: false }));
  const meetSign = makePylon('CAR MEET', W.neonPink);
  meetSign.position.set(52, 0, 9.6);
  meetSite.add(meetSign);
  meetSite.col({ x: 52, z: 9.6, r: 0.4 });
  if (night) {
    for (let i = 0; i < 7; i += 1) {
      const h = hash(`meetcar${i}`);
      const c = makeCar({ body: pickBy(['coupe', 'muscle', 'hatch', 'supercar', 'sedan', 'roadster'], h, 1), color: pickBy(['red', 'blue', 'candy', 'lime', 'purple', 'sunset', 'midnight', 'white'], h, 2), wheels: pickBy(['mesh', 'race', 'deep'], h, 3), spoiler: pickBy(['wing', 'gt', 'lip'], h, 4), underglow: pickBy(['neonPink', 'neonCyan', 'neonGreen', 'neonAmber'], h, 5), lowered: 0.8, engine: { layout: 'V8', turbo: true } });
      c.group.position.set(40.5 + i * 3.4, 0, 14);
      c.group.rotation.y = Math.PI + pickBy([0, 0.1, -0.1], h, 6);
      meetSite.add(c.group);
      meetSite.col({ x: 40.5 + i * 3.4, z: 14, hw: 1.0, hd: 2.2 });
    }
  }
  for (const [x, z] of [[40, 34], [66, 34], [40, 9], [66, 9]]) { const c = makeCone(); c.position.set(x, 0, z); meetSite.add(c); }
  const PODIUM = { x: 52, z: 26 };
  const podium = new THREE.Group();
  podium.position.set(PODIUM.x, 0, PODIUM.z);
  podium.userData.dynamic = true;
  podium.add(cyl(3.3, 3.5, 0.25, W.cloth.charcoal, { y: 0.125, seg: 20, edge: false }));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.07, 6, 28), glow(W.neonPink));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.27;
  podium.add(ring);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(3.6, 9, 20, 1, true), glow(W.white, night ? 0.08 : 0.03));
  beam.position.y = 4.7;
  beam.material.depthWrite = false;
  podium.add(beam);
  meetSite.add(podium);
  const spectators = [];
  if (night) {
    for (let i = 0; i < 9; i += 1) {
      const a = (i / 9) * Math.PI * 2;
      const p = makePerson(npcLook(hash(`meetfan${i}`)), { mood: 'smile' });
      p.group.position.set(PODIUM.x + Math.cos(a) * 6.2, 0, PODIUM.z + Math.sin(a) * 6.2);
      p.group.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));
      meetSite.add(p.group);
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
  for (const [x, z, ry] of [[-52, -26, 0], [-26, -26, Math.PI], [-44, -39, 0]]) { const b = makeBench(); b.position.set(x, 0, z); b.rotation.y = ry; root.add(b); colliders.push({ x, z, hw: 0.9, hd: 0.35 }); }
  for (const [x, z] of [[-55, -30], [-18, -30], [-30, -26]]) { const p = makePlant(true); p.position.set(x, 0, z); root.add(p); }

  // ---- the industrial estate ----
  /** @type {[number, number, number, number, string][]} */
  const sheds = [[115, 30, 22, 14, W.metal], [145, 30, 18, 14, W.wallBlue], [130, 54, 34, 12, W.plasterDark]];
  for (const [x, z, w, d, c] of sheds) {
    const b = makeBuilding({ w, d, h: 7, wall: c, trim: W.concreteDark, roof: W.metalDark, roofKind: 'sawtooth', doorX: 0, doorW: 5, doorColor: W.metalDark, winRows: 1, night });
    b.position.set(x, 0, z);
    b.rotation.y = Math.PI;
    root.add(b);
    colliders.push({ x, z, hw: w / 2 + 0.2, hd: d / 2 + 0.2 });
  }
  for (const [x, z] of [[104, 18], [106, 20], [158, 44], [156, 46], [110, 46]]) { const b = makeBarrel(W.barrel); b.position.set(x, 0, z); root.add(b); colliders.push({ x, z, r: 0.4 }); }

  // ---- houses along the streets: a town is mostly where people live ----
  const HOUSE_WALLS = [W.plaster, W.wallBlue, W.wallGreen, W.plasterDark, W.wallRed, W.cloth.cream, W.wallPurple];
  const HOUSE_ROOFS = [W.roof, W.roofGreen, W.metalDark, W.toolRed];
  const houses = [];
  const clearOf = (x, z, hw, hd) => !KEEP_CLEAR.some((r) => x + hw > r.x0 && x - hw < r.x1 && z + hd > r.z0 && z - hd < r.z1);
  for (const r of ROADS) {
    if (r.kind !== 'road' || r.w < 8) continue;
    const path = measuredPath(r.pts, false);
    for (let d = 14; d < path.length - 14; d += 22) {
      const a = path.at(d);
      for (const side of [1, -1]) {
        const set = 13;
        const x = a.x + Math.cos(a.heading) * set * side;
        const z = a.z - Math.sin(a.heading) * set * side;
        const h = hash(`house${Math.round(x)}:${Math.round(z)}`);
        const w = 9 + (h % 4);
        const dd = 8 + ((h >> 3) % 3);
        if (!clearOf(x, z, w / 2 + 2, dd / 2 + 2)) continue;
        if (nearPaving(x, z, Math.max(w, dd) / 2 + 1.5)) continue;
        if (blocked(x, z, Math.max(w, dd) / 2 + 2)) continue;
        if (x < TOWN.minX + 10 || x > TOWN.maxX - 10 || z < TOWN.minZ + 10 || z > TOWN.maxZ - 10) continue;
        // Face the road: the front of a building is its +z side.
        const face = Math.atan2(a.x - x, a.z - z);
        const ry = Math.round(face / (Math.PI / 2)) * (Math.PI / 2);
        const b = makeBuilding({ w, d: dd, h: 5.2, wall: pickBy(HOUSE_WALLS, h, 1), trim: W.concreteLight, roof: pickBy(HOUSE_ROOFS, h, 2), roofKind: 'gable', doorX: (h % 3) - 1, doorW: 1.4, winCols: 2, night });
        b.position.set(x, 0, z);
        b.rotation.y = ry;
        root.add(b);
        const turned = Math.abs(Math.sin(ry)) > 0.5;
        colliders.push({ x, z, hw: (turned ? dd : w) / 2 + 0.3, hd: (turned ? w : dd) / 2 + 0.3 });
        houses.push({ x, z });
        // A hedge or a tree in the garden.
        if (h % 3 === 0) { const t = makeRoundTree(h); const gx = x + Math.cos(face + 1.2) * (w / 2 + 2.5); const gz = z - Math.sin(face + 1.2) * (w / 2 + 2.5); if (!nearPaving(gx, gz, 2)) { t.position.set(gx, 0, gz); root.add(t); colliders.push({ x: gx, z: gz, r: 0.55 }); } }
      }
    }
  }

  // ---- the drag strip ----
  {
    const z0 = STRIP.z;
    // Lane lines, the start, the finish and the boards along the way.
    root.add(box(STRIP.endX - STRIP.startX + 30, 0.012, 0.18, W.roadEdge, { x: (STRIP.endX + STRIP.startX - 30) / 2, y: 0.0, z: z0, edge: false, cast: false }));
    for (const dz of [-6.6, 6.6]) root.add(box(STRIP.endX - STRIP.startX + 30, 0.012, 0.18, W.roadEdge, { x: (STRIP.endX + STRIP.startX - 30) / 2, y: 0.0, z: z0 + dz, edge: false, cast: false }));
    root.add(box(0.5, 0.014, 13, W.white, { x: STRIP.startX, y: 0.004, z: z0, edge: false, cast: false }));
    for (let i = 0; i < 12; i += 1) for (let j = 0; j < 2; j += 1) root.add(box(0.7, 0.016, 0.7, (i + j) % 2 ? W.black : W.white, { x: STRIP.finishX + j * 0.7, y: 0.005, z: z0 - 6 + i * 1.09, edge: false, cast: false }));
    // Rubber off the line in both lanes, and the burnout boxes behind it.
    const rubber = new THREE.MeshBasicMaterial({ color: W.black, transparent: true, opacity: 0.32, depthWrite: false });
    for (const lz of [STRIP.lanes.player, STRIP.lanes.rival]) for (const dz of [-0.8, 0.8]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(70, 0.32).rotateX(-Math.PI / 2), rubber);
      m.position.set(STRIP.startX + 35, 0.008, lz + dz);
      root.add(m);
      root.add(box(10, 0.012, 3.4, W.asphaltDark, { x: STRIP.startX - 14, y: 0.0, z: lz, edge: false, cast: false }));
    }
    for (const [x, label] of /** @type {[number, string][]} */ ([[STRIP.startX + 18.3, '60 FT'], [STRIP.startX + 201.2, '1/8'], [STRIP.finishX, '1/4']])) {
      const s = sign(label, { w: 1.8, h: 0.6, bg: W.black, fg: W.hazard });
      s.position.set(x, 1.6, z0 + 8.2);
      s.rotation.y = Math.PI;
      root.add(s);
      root.add(box(0.12, 1.6, 0.12, W.metalDark, { x, y: 0.8, z: z0 + 8.3, edge: false }));
    }
    // Fences either side, open at both ends; a sand trap past the shutdown.
    const fx0 = STRIP.startX - 30;
    const fx1 = STRIP.endX - 14;
    for (const dz of [-8.6, 8.6]) { const f = makeFence(fx1 - fx0); f.position.set((fx0 + fx1) / 2, 0, z0 + dz); root.add(f); colliders.push({ x: (fx0 + fx1) / 2, z: z0 + dz, hw: (fx1 - fx0) / 2, hd: 0.2 }); }
    const sand = groundPlane(18, 16, { base: W.dirt, alt: W.dirtDark, kind: 'speckle', tile: 2 });
    sand.position.set(STRIP.endX + 14, 0.0, z0);
    root.add(sand);
    root.add(box(1.2, 1.2, 16, W.hazard, { x: STRIP.endX + 24, y: 0.6, z: z0 }));
    colliders.push({ x: STRIP.endX + 24, z: z0, hw: 0.6, hd: 8 });
    // The grandstand and the tower.
    const stands = new THREE.Group();
    for (let r = 0; r < 4; r += 1) {
      stands.add(box(120, 0.5, 1.4, W.concrete, { y: 0.25 + r * 0.7, z: r * 1.4 }));
      stands.add(box(120, 0.12, 1.0, W.woodLight, { y: 0.56 + r * 0.7, z: r * 1.4 - 0.1, edge: false }));
    }
    stands.position.set(-60, 0, z0 + 11);
    root.add(stands);
    colliders.push({ x: -60, z: z0 + 13, hw: 60, hd: 3 });
    const tower = makeBuilding({ w: 12, d: 7, h: 6, wall: W.plasterDark, trim: W.concreteLight, roof: W.metalDark, doorX: 0, doorW: 2.4, text: 'MAIN STREET DRAGS', signColor: W.toolYellow, awning: W.toolRed, winRows: 1, winCols: 3, night });
    tower.position.set(-170, 0, z0 - 15);
    root.add(tower);
    colliders.push({ x: -170, z: z0 - 15, hw: 6.2, hd: 3.7 });
    const office = makeBuilding({ w: 6, d: 5, h: 3.4, wall: W.toolYellow, trim: W.black, roof: W.black, doorX: 0, doorW: 1.6, text: 'ENTRIES', signColor: W.black, shopfront: true, night });
    office.position.set(-138, 0, -236);
    office.rotation.y = Math.PI;
    root.add(office);
    colliders.push({ x: -138, z: -236, hw: 3.2, hd: 2.7 });
    const crowd = [];
    for (let i = 0; i < 18; i += 1) {
      const p = makePerson(npcLook(hash(`dragfan${i}`)), { mood: 'smile' });
      const r = i % 4;
      p.group.position.set(-115 + ((i * 13.3) % 110), 0.56 + r * 0.7, z0 + 11 + r * 1.4 - 0.1);
      p.group.rotation.y = Math.PI;
      p.group.scale.setScalar(0.92);
      root.add(p.group);
      crowd.push(p);
    }
    updaters.push((dt) => { for (const p of crowd) p.update(dt, 0); });
    for (let x = STRIP.startX + 20; x < STRIP.endX; x += 40) for (const dz of [-10, 10]) { const l = makeStreetLamp(night); l.position.set(x, 0, z0 + dz); l.rotation.y = dz < 0 ? 0 : Math.PI; root.add(l); colliders.push({ x, z: z0 + dz, r: 0.2 }); }
  }

  // ---- Caribou Raceway ----
  {
    const path = CIRCUIT.path;
    // Kerbs, red and white, wherever the circuit turns.
    for (let d = 0; d < path.length; d += 2) {
      const a = path.at(d - 4);
      const b = path.at(d + 4);
      let dh = b.heading - a.heading;
      dh = ((dh + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      if (Math.abs(dh) / 8 < 1 / 90) continue;
      const p = path.at(d);
      for (const side of [-1, 1]) {
        const off = side * (CIRCUIT.width / 2 + 0.45);
        const k = box(0.9, 0.06, 2.0, Math.floor(d / 2) % 2 ? W.toolRed : W.white, { x: p.x + Math.cos(p.heading) * off, y: 0.03, z: p.z - Math.sin(p.heading) * off, edge: false, cast: false });
        k.rotation.y = p.heading;
        root.add(k);
      }
    }
    // The start line, chequered across the track.
    const s0 = path.at(CIRCUIT.startS);
    for (let i = 0; i < 12; i += 1) for (let j = 0; j < 2; j += 1) {
      const off = -CIRCUIT.width / 2 + 0.55 + i * 1.08;
      const q = box(0.6, 0.012, 1.0, (i + j) % 2 ? W.black : W.white, { x: s0.x + Math.cos(s0.heading) * off + Math.sin(s0.heading) * (j * 0.6), y: 0.004, z: s0.z - Math.sin(s0.heading) * off + Math.cos(s0.heading) * (j * 0.6), edge: false, cast: false });
      q.rotation.y = s0.heading;
      root.add(q);
    }
    // Grid boxes.
    for (const sl of CIRCUIT.grid) {
      const g = path.at(CIRCUIT.startS - sl.back);
      const q = box(2.4, 0.012, 0.15, W.white, { x: g.x + Math.cos(g.heading) * sl.side + Math.sin(g.heading) * 2.2, y: 0.004, z: g.z - Math.sin(g.heading) * sl.side + Math.cos(g.heading) * 2.2, edge: false, cast: false });
      q.rotation.y = g.heading;
      root.add(q);
    }
    // Tyre walls on the outside of the hardest corners.
    for (const [x, z] of [[262, 300], [214, 334], [-274, 290], [-238, 328], [244, 254]]) for (let i = 0; i < 4; i += 1) { const t = makeTyreStack(3); t.position.set(x + i * 0.8, 0, z); root.add(t); colliders.push({ x: x + i * 0.8, z, r: 0.45 }); }
    // The grandstand on the main straight, the pit garages and the race office.
    const stands = new THREE.Group();
    for (let r = 0; r < 4; r += 1) {
      stands.add(box(90, 0.5, 1.4, W.concrete, { y: 0.25 + r * 0.7, z: -r * 1.4 }));
      stands.add(box(90, 0.12, 1.0, W.toolBlue, { y: 0.56 + r * 0.7, z: -r * 1.4 + 0.1, edge: false }));
    }
    stands.position.set(-110, 0, 233);
    root.add(stands);
    colliders.push({ x: -110, z: 231, hw: 45, hd: 3 });
    const pits = makeBuilding({ w: 40, d: 8, h: 4.5, wall: W.plaster, trim: W.toolBlue, roof: W.metalDark, doorX: 0, doorW: 6, text: 'CARIBOU RACEWAY', signColor: W.toolBlue, winRows: 1, winCols: 6, night });
    pits.position.set(60, 0, 228);
    root.add(pits);
    colliders.push({ x: 60, z: 228, hw: 20.2, hd: 4.2 });
    const office = makeBuilding({ w: 6, d: 5, h: 3.4, wall: W.toolBlue, trim: W.white, roof: W.white, doorX: 0, doorW: 1.6, text: 'RACE OFFICE', signColor: W.black, shopfront: true, night });
    office.position.set(-22, 0, 222);
    root.add(office);
    colliders.push({ x: -22, z: 222, hw: 3.2, hd: 2.7 });
    const fans = [];
    for (let i = 0; i < 14; i += 1) {
      const p = makePerson(npcLook(hash(`trackfan${i}`)), { mood: 'smile' });
      const r = i % 4;
      p.group.position.set(-150 + ((i * 11.7) % 80), 0.56 + r * 0.7, 233 - r * 1.4 + 0.1);
      p.group.scale.setScalar(0.92);
      root.add(p.group);
      fans.push(p);
    }
    updaters.push((dt) => { for (const p of fans) p.update(dt, 0); });
  }

  // ---- trees: in the gaps, never on a road ----
  const rand = (() => { let seed = hash(`trees${career.seed ?? 0}`); return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; })();
  let trees = 0;
  for (let i = 0; i < 2600 && trees < 380; i += 1) {
    const x = TOWN.minX + 4 + rand() * (TOWN.maxX - TOWN.minX - 8);
    const z = TOWN.minZ + 4 + rand() * (TOWN.maxZ - TOWN.minZ - 8);
    const park = x > -64 && x < -10 && z > -46 && z < -22;
    if (!park && !clearOf(x, z, 1, 1)) continue;
    if (park && Math.abs(x + 35) < 13 && Math.abs(z + 33) < 8) continue;
    if (nearPaving(x, z, 3.5) || blocked(x, z, 1.6)) continue;
    const t = rand() < 0.5 ? makeTree(trees, false) : makeRoundTree(trees);
    t.position.set(x, 0, z);
    root.add(t);
    colliders.push({ x, z, r: 0.55 });
    if (rand() < 0.4) { const bsh = makeBush(trees); bsh.position.set(x + 1.6, 0, z + rand() * 2 - 1); root.add(bsh); }
    trees += 1;
  }
  // Hills round the edge of the world, so the town does not end at a cliff.
  for (let i = 0; i < 34; i += 1) {
    const a = (i / 34) * Math.PI * 2;
    const rx = 420 + (i % 3) * 20;
    const rz = 400 + (i % 4) * 14;
    const h = 22 + (i % 5) * 7;
    const m = cone(30 + (i % 3) * 6, h, i % 2 ? W.rock : W.grassDark, { x: cx + Math.cos(a) * rx, y: h / 2 - 0.5, z: cz + Math.sin(a) * rz, seg: 9, edge: false });
    m.castShadow = false;
    root.add(m);
  }

  // ---- street lamps along main street ----
  for (let x = -60; x <= 60; x += 15) for (const z of [-5.6, 5.6]) {
    const l = makeStreetLamp(night);
    l.position.set(x, 0, z);
    l.rotation.y = z < 0 ? 0 : Math.PI;
    root.add(l);
    colliders.push({ x, z, r: 0.2 });
    if (night) {
      const pool = new THREE.Mesh(new THREE.CircleGeometry(5.5, 18), glow(W.lampWarm, 0.16));
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(x + (z < 0 ? 0.6 : -0.6), 0.04, z + (z < 0 ? 2 : -2));
      root.add(pool);
    }
  }
  // Road signs at the venues' turn-offs.
  for (const [x, z, text, color] of /** @type {[number, number, string, string][]} */ ([[-144, -205, 'DRAG STRIP', W.toolYellow], [6, 205, 'RACEWAY', W.toolBlue]])) {
    root.add(box(0.2, 3.2, 0.2, W.metalDark, { x, y: 1.6, z }));
    const s = sign(text, { w: 3.2, h: 0.8, bg: color, fg: W.black });
    s.position.set(x, 3.2, z + 0.12);
    root.add(s);
    colliders.push({ x, z, r: 0.2 });
  }

  // ---- doors ----
  for (const p of PLACES) {
    if (['gas', 'meet'].includes(p.id)) continue;
    const venue = p.id === 'strip' || p.id === 'track';
    interactables.push({
      id: `place:${p.id}`, x: p.door.x, z: p.door.z, r: p.id === 'junk' ? 2.2 : 1.9, onFoot: true,
      label: () => { const why = closedBecause(api.career(), p); return why ? `${p.name}: closed` : venue ? `${p.name}: entries` : `Go in: ${p.name}`; },
      hint: () => closedBecause(api.career(), p) ?? p.blurb,
      run: () => {
        const why = closedBecause(api.career(), p);
        if (why) { api.emit({ type: 'toast', text: `${p.name} is closed. ${why}`, tone: 'warn' }); return; }
        if (venue) api.emit({ type: 'act', id: 'raceMenu', series: p.id === 'strip' ? 'drag' : 'track' });
        else api.emit({ type: 'act', id: 'go', place: p.id });
      },
    });
  }
  interactables.push({
    id: 'park', x: -37, z: -4.4, r: 5, carOnly: true, maxSpeed: 7, label: 'Park it at the shop', hint: 'Back on its lift, or on the apron.',
    // Not the moment you pull out: only once you have been somewhere.
    enabled: (a) => (a.drive?.state.odo ?? 0) > 60,
    run: () => api.emit({ type: 'act', id: 'parkCar' }),
  });
  interactables.push({
    id: 'strip:line', x: -236, z: STRIP.z, r: 9, carOnly: true, maxSpeed: 8,
    label: () => (closedBecause(api.career(), placeById('strip')) ? 'Drag strip: closed' : 'Line up at the tree'), hint: 'Race a rival, or make a pass on your own.',
    run: () => api.emit({ type: 'act', id: 'raceMenu', series: 'drag' }),
  });
  interactables.push({
    id: 'track:grid', x: 0, z: 236, r: 9, carOnly: true, maxSpeed: 8,
    label: () => (closedBecause(api.career(), placeById('track')) ? 'Raceway: closed' : 'Out onto the grid'), hint: 'Race a rival, or set a lap time.',
    run: () => api.emit({ type: 'act', id: 'raceMenu', series: 'track' }),
  });
  interactables.push({
    id: 'pump', ...siteAt('gas', -14, 14), r: 7, carOnly: true, maxSpeed: 4, label: 'Fill up', hint: 'Choose your fuel.',
    run: () => api.emit({ type: 'act', id: 'pump' }),
  });
  interactables.push({
    id: 'meet', ...siteAt('meet', 52, 22), r: 11, maxSpeed: 12,
    label: () => { const why = closedBecause(api.career(), placeById('meet')); return why ? 'Car meet: closed' : 'Join the car meet'; },
    hint: () => closedBecause(api.career(), placeById('meet')) ?? 'Show your car and your look.',
    run: () => {
      const why = closedBecause(api.career(), placeById('meet'));
      if (why) { api.emit({ type: 'toast', text: `The meet is not on yet. ${why}`, tone: 'warn' }); return; }
      api.emit({ type: 'act', id: 'meet' });
    },
  });
  interactables.push({ id: 'bench', x: -52, z: -24.6, r: 1.8, onFoot: true, label: 'Sit and look at the pond', hint: 'A moment to breathe.', run: () => api.emit({ type: 'act', id: 'bench' }) });
  // Hints are strings in the prompt: resolve function hints.
  for (const it of interactables) if (typeof it.hint === 'function') { const h = it.hint; Object.defineProperty(it, 'hint', { get: () => h(), enumerable: true }); }

  // ---- golden spanners ----
  const SPANNER_AT = [[-30, -40], [-58, -30], [128, 42], [-205, 128], [205, -150], [-12, 38], [300, -262], [-250, 300], [150, -60], [-120, -150]];
  SPANNER_AT.forEach(([x, z], i) => {
    const g = new THREE.Group();
    const head = cyl(0.3, 0.3, 0.1, W.paint.gold, { y: 0.9, axis: 'z', seg: 8, edge: false });
    const handle = box(0.12, 0.7, 0.07, W.paint.gold, { y: 0.55, edge: false });
    const glowRing = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 6, 14), glow(W.paint.gold, 0.6));
    glowRing.rotation.x = Math.PI / 2;
    glowRing.position.y = 0.15;
    g.add(head, handle, glowRing);
    g.position.set(x, 0, z);
    g.userData = { id: i, x, z, glowRing, dynamic: true };
    root.add(g);
    spanners.push(g);
  });

  // ---- people and traffic ----
  const walkAreas = [{ minX: -64, maxX: 64, minZ: -8.2, maxZ: -5.6 }, { minX: -64, maxX: 64, minZ: 5.6, maxZ: 8.2 }, { minX: -56, maxX: -14, minZ: -42, maxZ: -24 }, { minX: 40 + SITES.meet.dx, maxX: 64 + SITES.meet.dx, minZ: 10 + SITES.meet.dz, maxZ: 34 + SITES.meet.dz }];
  const walkers = makeWalkers(root, walkAreas, night ? 14 : 9, hash(`town${career.day}`), (x, z) => blocked(x, z, 0.4));
  const trafficCols = [];
  const h = HIGHWAY;
  const traffic = [
    makeTraffic(root, loopPath(h.cx, h.cz, h.hw - 3.4, h.hd - 3.4, h.r - 3.4, true), night ? 3 : 5, hash(`hwA${career.day}`), trafficCols),
    makeTraffic(root, loopPath(h.cx, h.cz, h.hw + 3.4, h.hd + 3.4, h.r + 3.4, false), night ? 2 : 4, hash(`hwB${career.day}`), trafficCols),
    makeTraffic(root, loopPath(5, -35, 77.5, 32.5, 9, true), night ? 1 : 3, hash(`dt${career.day}`), trafficCols),
  ];
  colliders.push(...trafficCols);
  updaters.push((dt) => walkers.update(dt), (dt) => { for (const t of traffic) t.update(dt); });

  // The dealer's lot: what is for sale today.
  const forSale = dealerStock(career).slice(0, 4);
  forSale.forEach((s, i) => {
    const c = makeCar({ body: s.body, color: s.color, wheels: s.wheels ?? 'alloy5', engine: s.engine ?? { layout: 'V6' }, plate: s.plate });
    const at = siteAt('dealer', -56 + i * 8.6, 12);
    c.group.position.set(at.x, 0.0, at.z);
    c.group.rotation.y = Math.PI + 0.4 - (i % 2) * 0.8;
    root.add(c.group);
    colliders.push({ x: at.x, z: at.z, hw: 1.1, hd: 2.3 });
  });

  const venues = makeVenues(api, root, colliders);

  // ---- the level ----
  const level = {
    root, colliders, interactables, time: PHASE_TIME[phase],
    camera: { pitch: 0.9, dist: 44, yaw: 0, fov: 22 },
    bounds: [{ minX: TOWN.minX + 1, maxX: TOWN.maxX - 1, minZ: TOWN.minZ + 1, maxZ: TOWN.maxZ - 1 }],
    spawn: (e) => {
      const p = e.from && e.from !== 'drive' ? placeById(e.from) : null;
      if (p) return { x: p.door.x, z: p.door.z + (p.door.z < 0 ? 2.2 : -2.2), yaw: p.door.z < 0 ? 0 : Math.PI };
      return { x: -37, z: -3, yaw: 0 };
    },
    surfaceAt,
    /** What the minimap draws. */
    map: { roads: ROADS, bounds: TOWN, places: PLACES.map((p) => ({ id: p.id, name: p.name, x: p.door.x, z: p.door.z })) },
    sync() { /* nothing in the town depends on the shop's save while you are in it */ },
    cinematic: () => (presenting ? { x: PODIUM.x + SITES.meet.dx, z: PODIUM.z + SITES.meet.dz, heading: 0, speed: 0, mode: 'follow', yaw: presenting.t * 0.45 + 0.4, pitch: 0.36, dist: 12, fov: 34 } : null),
    driveInput: (input) => venues.driveInput(input),
    onDrive: (d, dt) => venues.onDrive(d, dt),
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
      } else if (name === 'racing') return venues.racing;
      else return venues.cmd(name, args[0]);
      return undefined;
    },
    update(dt, t) {
      for (const u of updaters) u(dt);
      venues.update(dt);
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
    dispose() { venues.dispose(); },
  };
  void entry;
  void houses;
  mergeStatic(root);
  return level;
}
