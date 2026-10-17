/**
 * The drag strip: a quarter-mile of tarmac, a tree, a tower, grandstands and a crowd.
 *
 * A race is a replay of two real runs. The strip's own physics (`simulateDragRun`) solved
 * each car's pass; this level plays the two traces back side by side: the tree counts down,
 * each driver leaves on their reaction time, and the cars follow exactly the distance the
 * simulator gave them. What you watch is what the numbers say.
 */

import { world as W } from '../../tokens.js';
import { npcLook } from '../appearance.js';
import { THREE, box, groundPlane, sign } from '../gfx.js';
import { makeBuilding } from '../models/buildings.js';
import { makePerson } from '../models/person.js';
import { makeBench, makeFence, makeRoundTree, makeStreetLamp, makeTree } from '../models/props.js';

import { hash } from './common.js';
import { makeSmoke } from './fx.js';
import { PHASE_TIME } from './garage.js';

export const QUARTER_M = 402.336;
const LANE = { player: -2.4, rival: 2.4 };

/**
 * A point on a drag-run trace at a time, interpolated, and carried on past the last sample at
 * the speed the car finished at.
 * @param {{t: number, x: number, v: number, rpm: number, gear: number, throttle: number, spinning: boolean, limiter: boolean}[]} trace
 * @param {number} t
 */
export function sampleTrace(trace, t) {
  if (t <= 0) return { ...trace[0], x: 0, v: 0, spinning: false };
  const last = trace[trace.length - 1];
  if (t >= last.t) return { ...last, x: last.x + last.v * (t - last.t) };
  let lo = 0;
  let hi = trace.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (trace[mid].t <= t) lo = mid; else hi = mid;
  }
  const a = trace[lo];
  const b = trace[hi];
  const f = (t - a.t) / Math.max(1e-9, b.t - a.t);
  const lerp = (p, q) => p + (q - p) * f;
  return { x: lerp(a.x, b.x), v: lerp(a.v, b.v), rpm: lerp(a.rpm, b.rpm), gear: a.gear, throttle: lerp(a.throttle, b.throttle), spinning: a.spinning, limiter: a.limiter };
}

/** @param {any} api */
export function buildStrip(api) {
  const career = api.career();
  const phase = career.phase ?? 0;
  const night = phase >= 2;
  const root = new THREE.Group();
  const colliders = [];
  const interactables = [];

  // ---- ground ----
  const grass = groundPlane(700, 160, { base: W.grass, alt: W.grassDark, kind: 'blades', tile: 3 });
  grass.position.set(200, -0.06, 0);
  root.add(grass);
  const strip = groundPlane(QUARTER_M + 160, 13, { base: W.asphalt, alt: W.asphaltDark, kind: 'speckle', tile: 3 });
  strip.position.set(QUARTER_M / 2 + 20, 0.0, 0);
  root.add(strip);
  // The road in from town, running west.
  const road = groundPlane(100, 11, { base: W.asphalt, alt: W.asphaltDark, kind: 'speckle', tile: 3 });
  road.position.set(-110, -0.02, 0);
  root.add(road);
  for (let x = -158; x < -58; x += 6) root.add(box(2.6, 0.01, 0.2, W.roadLine, { x: x + 1.3, y: 0.01, z: 0, edge: false, cast: false }));
  // Lane lines, the start and the finish.
  for (const z of [-6.4, 0, 6.4]) root.add(box(QUARTER_M + 160, 0.012, 0.18, W.roadEdge, { x: QUARTER_M / 2 + 20, y: 0.012, z, edge: false, cast: false }));
  root.add(box(0.5, 0.014, 13, W.white, { x: 0, y: 0.015, z: 0, edge: false, cast: false }));
  for (let i = 0; i < 12; i += 1) for (let j = 0; j < 2; j += 1) root.add(box(0.7, 0.016, 0.7, (i + j) % 2 ? W.black : W.white, { x: QUARTER_M + j * 0.7, y: 0.016, z: -6 + i * 1.09, edge: false, cast: false }));
  // Distance boards every 100 m, and the eighth-mile.
  for (const [x, label] of /** @type {[number, string][]} */ ([[201, '1/8'], [QUARTER_M, '1/4']])) {
    const s = sign(label, { w: 1.6, h: 0.6, bg: W.black, fg: W.hazard });
    s.position.set(x, 1.6, -8.2);
    root.add(s);
    root.add(box(0.12, 1.6, 0.12, W.metalDark, { x, y: 0.8, z: -8.3, edge: false }));
  }
  for (const z of [-8.2, 8.2]) { const f = makeFence(QUARTER_M + 60); f.position.set(QUARTER_M / 2 + 20, 0, z); root.add(f); }
  colliders.push({ x: QUARTER_M / 2 + 20, z: 8.4, hw: (QUARTER_M + 60) / 2, hd: 0.3 });

  // ---- the tree ----
  const tree = new THREE.Group();
  tree.position.set(13, 0, 0);
  tree.rotation.y = -Math.PI / 2;
  tree.add(box(0.6, 3.8, 3.0, W.black, { y: 1.9 }));
  const bulbs = { player: [], rival: [] };
  const cols = { pre: W.cloth.white, stage: W.cloth.white, amber: W.indicator, green: W.screen, red: W.taillight };
  const order = ['pre', 'stage', 'amber', 'amber', 'amber', 'green', 'red'];
  for (const [side, z] of [['player', -0.8], ['rival', 0.8]]) {
    order.forEach((kind, i) => {
      const off = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.34), new THREE.MeshBasicMaterial({ color: W.cloth.charcoal }));
      off.position.set(0.32, 3.4 - i * 0.48, z);
      tree.add(off);
      bulbs[side].push({ mesh: off, color: cols[kind] });
    });
  }
  root.add(tree);
  colliders.push({ x: 13, z: 0, r: 1.3 });
  const setBulb = (side, i, on) => { const b = bulbs[side][i]; b.mesh.material.color.set(on ? b.color : W.cloth.charcoal); };
  const clearTree = () => { for (const s of ['player', 'rival']) bulbs[s].forEach((_, i) => setBulb(s, i, false)); };

  // ---- the tower and the stands ----
  const tower = makeBuilding({ w: 12, d: 7, h: 6, wall: W.plasterDark, trim: W.concreteLight, roof: W.metalDark, doorX: 0, doorW: 2.4, text: 'DRAG STRIP', signColor: W.toolYellow, awning: W.toolRed, winRows: 1, winCols: 3, night });
  tower.position.set(-14, 0, -17);
  root.add(tower);
  colliders.push({ x: -14, z: -17, hw: 6.2, hd: 3.7 });
  const stands = new THREE.Group();
  for (let r = 0; r < 4; r += 1) {
    stands.add(box(46, 0.5, 1.4, W.concrete, { y: 0.25 + r * 0.7, z: -r * 1.4 }));
    stands.add(box(46, 0.12, 1.0, W.woodLight, { y: 0.56 + r * 0.7, z: -r * 1.4 + 0.1, edge: false }));
  }
  stands.position.set(70, 0, -13);
  root.add(stands);
  colliders.push({ x: 70, z: -15, hw: 23, hd: 3.2 });
  const crowd = [];
  for (let i = 0; i < 16; i += 1) {
    const p = makePerson(npcLook(hash(`crowd${i}`)), { mood: 'smile' });
    const r = i % 4;
    p.group.position.set(52 + (i * 5.2) % 36 + (r % 2) * 1.3, 0.56 + r * 0.7, -13 - r * 1.4 + 0.1);
    p.group.rotation.y = 0;
    p.group.scale.setScalar(0.92);
    root.add(p.group);
    crowd.push(p);
  }
  for (let i = 0; i < 40; i += 1) {
    const t = i % 3 === 0 ? makeTree(i) : makeRoundTree(i);
    t.position.set(-40 + i * 12.5, 0, i % 2 ? 22 + (i % 5) * 3 : -32 - (i % 4) * 3);
    root.add(t);
  }
  for (let x = 20; x < QUARTER_M + 60; x += 40) for (const z of [-9.5, 9.5]) { const l = makeStreetLamp(night); l.position.set(x, 0, z); l.rotation.y = z < 0 ? 0 : Math.PI; root.add(l); }
  const b = makeBench();
  b.position.set(-24, 0, -8);
  root.add(b);

  // ---- people on foot ----
  const marshal = makePerson({ ...npcLook(hash('marshal')), top: 'vest-hivis', hat: 'hardhat', hair: 'short' }, { mood: 'smile' });
  marshal.group.position.set(8, 0, 9.4);
  marshal.group.rotation.y = -Math.PI / 2;
  root.add(marshal.group);
  interactables.push({
    id: 'desk', x: -14, z: -12.4, r: 3, onFoot: true,
    label: 'Sign up for a race', hint: 'Choose a rival and one of your cars.',
    run: () => api.emit({ type: 'act', id: 'shop', place: 'strip' }),
  });
  interactables.push({
    id: 'leave', x: -60, z: 0, r: 6, maxSpeed: 12, label: 'Back to town', hint: 'The main street.',
    run: () => api.emit({ type: 'act', id: 'go', place: 'town', from: 'strip' }),
  });

  const smoke = makeSmoke(root);

  // ---- the race ----
  /** @type {any} */ let race = null;
  const lane = (side) => (side === 'player' ? LANE.player : LANE.rival);

  /**
   * @param {{player: {rig: any, run: any, rt: number, setup: any}, rival: {rig: any, run: any, rt: number}, onDone: (r: any) => void}} o
   */
  function startRace(o) {
    if (race) return;
    clearTree();
    for (const side of ['player', 'rival']) {
      const c = o[side].rig;
      c.group.position.set(-2.0, 0, lane(side));
      c.group.rotation.y = Math.PI / 2;
      root.add(c.group);
    }
    race = { ...o, t: 0, green: 3.6, done: false, crossed: {}, finishAt: null, cars: { player: o.player, rival: o.rival }, cheer: 0, last: { player: 0, rival: 0 } };
    api.player.locked = true;
    api.person.group.visible = false;
    api.emit({ type: 'race', on: true });
  }

  const cinematic = () => {
    if (!race) return null;
    const p = sampleTrace(race.player.run.trace, race.t - race.green - race.player.rt);
    const rv = sampleTrace(race.rival.run.trace, race.t - race.green - race.rival.rt);
    const lead = Math.max(p.x, rv.x);
    const early = race.t < race.green + 0.2;
    return { x: early ? 3 : Math.max(3, lead - 6), z: 0, heading: Math.PI / 2, speed: Math.max(p.v, rv.v), mode: 'follow', yaw: -Math.PI / 2 + (early ? 0.5 : 0.25), pitch: 0.3, dist: early ? 15 : 17, fov: 36 };
  };

  function stepRace(dt) {
    race.t += dt;
    const t = race.t;
    // The tree.
    const sides = ['player', 'rival'];
    for (const s of sides) {
      setBulb(s, 0, t > 0.6);
      setBulb(s, 1, t > 1.2);
      setBulb(s, 2, t > 2.0 && t < race.green);
      setBulb(s, 3, t > 2.5 && t < race.green);
      setBulb(s, 4, t > 3.0 && t < race.green);
      setBulb(s, 5, t >= race.green);
    }
    for (const s of sides) {
      const r = race[s];
      const tt = t - race.green - r.rt;
      const sm = sampleTrace(r.run.trace, tt);
      const car = r.rig;
      // The trace's distance is the car's front wheels past the line: the car's middle sits two metres behind them.
      const before = car.group.position.x;
      // Past the finish line the driver lifts and brakes: the car coasts to a stop.
      const k = 0.55;
      const cr = race.crossed[s];
      const xNow = cr ? QUARTER_M + cr.v * ((1 - Math.exp(-k * (t - cr.t))) / k) : sm.x;
      car.group.position.x = (tt < 0 ? 0 : Math.min(xNow, QUARTER_M + 330)) - 2.0;
      car.roll(car.group.position.x - before);
      // The nose lifts on launch, and the body squats.
      const accel = Math.max(0, sm.v - race.last[s]) / Math.max(dt, 1e-3);
      race.last[s] = sm.v;
      car.group.rotation.z = 0;
      car.group.rotation.x = -Math.min(0.06, accel * 0.004) * (sm.v > 0 ? 1 : 0);
      car.update(dt);
      if (sm.spinning && sm.v < 24) smoke.emit(car.group.position.x - 1.8, lane(s), 1);
      if (!race.crossed[s] && sm.x >= QUARTER_M) race.crossed[s] = { t, et: r.run.et, trap: r.run.trapMph, v: sm.v };
      if (s === 'player') {
        const tele = api.tele;
        tele.speedMph = sm.v * 2.23694; tele.speedKph = sm.v * 3.6; tele.rpm = sm.rpm; tele.gear = sm.gear; tele.throttle = sm.throttle;
        tele.limiter = !!sm.limiter; tele.shifting = false; tele.redline = r.setup.redline; tele.tcCut = 0; tele.knock = false; tele.lean = false; tele.brake = 0; tele.reverse = false; tele.manual = true;
        tele.g = accel / 9.81; tele.lat = 0;
        api.raceTele = { setup: r.setup, rpm: sm.rpm, throttle: tt < 0 ? 0.3 : sm.throttle, limiter: !!sm.limiter, gear: sm.gear, t: tt };
      }
    }
    if (t > race.green && t < race.green + 0.25) api.rig.shake = 0.12;
    if (race.crossed.player && race.crossed.rival && race.finishAt == null) race.finishAt = t;
    if (race.finishAt != null) {
      for (const p of crowd) p.setPose('cheer');
      if (t > race.finishAt + 3.0 && !race.done) {
        race.done = true;
        api.emit({ type: 'race', on: false });
        race.onDone({ crossed: race.crossed });
      }
    }
  }

  /** Clear the strip once the time slip has been read. */
  function endRace() {
    if (!race) return;
    for (const s of ['player', 'rival']) root.remove(race[s].rig.group);
    race = null;
    clearTree();
    api.raceTele = null;
    api.player.locked = false;
    api.person.group.visible = true;
    for (const p of crowd) p.setPose('idle');
  }

  const level = {
    root, colliders, interactables, time: night ? PHASE_TIME[phase] : 0.1,
    camera: { pitch: 0.7, dist: 20, yaw: 0, fov: 32 },
    bounds: [{ minX: -164, maxX: QUARTER_M + 60, minZ: -30, maxZ: 30 }],
    spawn: () => ({ x: -56, z: 4, yaw: -Math.PI / 2 }),
    surfaceAt: () => ({ grip: 1, roll: 1, kind: 'road' }),
    noCars: true,
    sync() {},
    cinematic,
    cmd(name, ...args) {
      if (name === 'race') return startRace(args[0]);
      if (name === 'endRace') return endRace();
      if (name === 'hasRace') return !!race;
      return undefined;
    },
    update(dt, t) {
      for (const p of crowd) p.update(dt, 0);
      marshal.update(dt, 0);
      smoke.update(dt);
      if (race) stepRace(Math.min(dt, 0.05));
      void t;
    },
    dispose() {},
  };
  return level;
}

