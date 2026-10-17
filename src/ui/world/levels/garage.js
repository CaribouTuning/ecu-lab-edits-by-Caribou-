/**
 * The garage: the shop you run, in three dimensions.
 *
 * What is in it is what the career says you own. Each lift you have bought stands in its
 * bay, a customer's car rides on it, the dyno rollers sit in the floor once you have the
 * dyno, the neon sign, the lounge and the third bay arrive with their purchases. Walk
 * to something and press E: the job board, the laptop, the dyno, a car on a lift, the
 * locker, the bell that closes the day, the door to town.
 *
 * Cars arrive by backing in off the street and leave nose-first; their customers get out,
 * say what is wrong, and come back for the car with the mood your work earned.
 */

import { world as W } from '../../tokens.js';
import { npcLook } from '../appearance.js';
import { THREE, box, cyl, floorPlane, glow, groundPlane, sign } from '../gfx.js';
import { makePerson } from '../models/person.js';
import {
  makeArcade, makeBarrel, makeBuildSite, makeCalendar, makeCoffeeMachine, makeCone, makeCouch, makeCrate, makeDesk, makeDog,
  makeDyno, makeFloorLamp, makeJobBoard, makeLift, makeLocker, makeNeon, makePlant, makePoster, makeRollupDoor, makeShelf, makeToolChest,
  makeTrophyShelf, makeTyreStack, makeWorkbench,
} from '../models/props.js';

import { hash, pathFollower, specForJob } from './common.js';
import { jobById } from '../../career/jobs.js';
import { capacity } from '../../career/shop.js';
import { carFor } from './common.js';

export const ROOM = { minX: -11, maxX: 11, minZ: -7.5, maxZ: 7.5 };
/** Where each customer car stands: centre, nose toward the camera. */
export const BAYS = [{ x: -7.4, z: -2.9 }, { x: -2.3, z: -2.9 }, { x: 2.8, z: -2.9 }];
/** The dyno stands in its own bay on the right. */
export const DYNO_AT = { x: 8.3, z: -2.4 };
/** Door in the front wall. */
export const DOOR = { x: 0, half: 3 };
const LIFT_UP = 1.05;

/** What the day's light looks like for a phase of the day. */
export const PHASE_TIME = [0, 0.7, 1.5, 2.6];

/** @param {THREE.Object3D} o @param {number} x @param {number} z @param {number} [ry] @param {number} [y] */
function at(o, x, z, ry = 0, y = 0) {
  o.position.set(x, y, z);
  o.rotation.y = ry;
  return o;
}

/**
 * @param {any} api the runtime
 * @param {{from?: string}} [entry]
 */
export function buildGarage(api, entry = {}) {
  const career = api.career();
  const owned = new Set(career.owned);
  const root = new THREE.Group();
  const colliders = [];
  const interactables = [];
  const animators = [];
  const lights = [];
  const cars = new Map();
  const npcs = new Map();

  // ---- shell ----
  root.add(floorPlane(40, 24, W.concreteDark, { x: 0, z: 0, y: -0.02 }));
  const floor = groundPlane(ROOM.maxX - ROOM.minX, ROOM.maxZ - ROOM.minZ, { base: W.floorEpoxy, alt: W.floorEpoxyAlt, line: W.wallBase, kind: 'tile', tile: 2 });
  floor.position.y = 0.001;
  root.add(floor);
  // Painted floor: a walkway down the middle and an outline round each bay.
  root.add(box(0.8, 0.01, 11, W.floorStripe, { x: 0, y: 0.012, z: 1.5, edge: false, receive: true, cast: false }));
  for (const b of BAYS) for (const s of [-1, 1]) {
    root.add(box(0.1, 0.012, 5.8, W.floorStripe, { x: b.x + s * 1.65, y: 0.012, z: b.z, edge: false, cast: false }));
  }
  const wallH = 5.2;
  const addWall = (x, z, w, d, h, color, collide = true) => { const m = box(w, h, d, color, { x, y: h / 2, z }); root.add(m); if (collide) colliders.push({ x, z, hw: w / 2, hd: d / 2 }); return m; };
  addWall(0, ROOM.minZ - 0.2, 22.8, 0.4, wallH, W.wallShop);
  addWall(ROOM.minX - 0.2, 0, 0.4, 15.4, wallH, W.wallShop);
  addWall(ROOM.maxX + 0.2, 0, 0.4, 15.4, wallH, W.wallShop);
  // The lower skirting in a darker colour.
  root.add(box(22, 1.2, 0.1, W.wallBase, { x: 0, y: 0.6, z: ROOM.minZ + 0.05, edge: false }));
  root.add(box(0.1, 1.2, 15, W.wallBase, { x: ROOM.minX + 0.05, y: 0.6, z: 0, edge: false }));
  root.add(box(0.1, 1.2, 15, W.wallBase, { x: ROOM.maxX - 0.05, y: 0.6, z: 0, edge: false }));
  // Front wall, low, with the door gap.
  const fw = (ROOM.maxX - DOOR.half) ;
  addWall(-(DOOR.half + fw / 2), ROOM.maxZ + 0.2, fw, 0.4, 1.3, W.wallShopDark);
  addWall(DOOR.half + fw / 2, ROOM.maxZ + 0.2, fw, 0.4, 1.3, W.wallShopDark);
  const door = makeRollupDoor(DOOR.half * 2);
  at(door, DOOR.x, ROOM.maxZ + 0.2);
  root.add(door);
  // Back-wall windows.
  for (const x of [-8, -4, 4, 8]) {
    root.add(box(2.2, 1.2, 0.08, W.glassDark, { x, y: 3.3, z: ROOM.minZ + 0.09, edge: false }));
    root.add(box(2.0, 1.0, 0.05, W.glass, { x, y: 3.3, z: ROOM.minZ + 0.13, edge: false }));
    root.add(box(0.06, 1.0, 0.06, W.metalDark, { x, y: 3.3, z: ROOM.minZ + 0.16, edge: false }));
  }
  // Outside: apron, kerb and the road with its markings.
  const apron = groundPlane(40, 7, { base: W.concrete, alt: W.concreteLight, kind: 'speckle', tile: 2 });
  apron.position.set(0, -0.01, 11.5);
  root.add(apron);
  const road = groundPlane(60, 10, { base: W.asphalt, alt: W.asphaltDark, kind: 'speckle', tile: 2 });
  road.position.set(0, -0.015, 20.5);
  root.add(road);
  root.add(box(60, 0.18, 0.4, W.curb, { x: 0, y: 0.09, z: 15.1, edge: false }));
  for (let i = -5; i <= 5; i += 1) root.add(box(2.2, 0.012, 0.18, W.roadLine, { x: i * 5, y: -0.005, z: 20.5, edge: false, cast: false }));
  // Neighbours either side: plain shop fronts, so the street feels like a street.
  for (const [x, c] of [[-21, W.brick], [21, W.plasterDark]]) {
    root.add(box(18, 6, 12, c, { x, y: 3, z: -1 }));
    colliders.push({ x, z: -1, hw: 9, hd: 6 });
  }

  // ---- bays and lifts ----
  const bayCount = capacity(career);
  const lifts = [];
  BAYS.forEach((b, i) => {
    if (i < bayCount) {
      const l = makeLift();
      at(l, b.x, b.z);
      root.add(l);
      lifts.push(l);
      for (const s of [-1, 1]) colliders.push({ x: b.x + s * 2.15, z: b.z, hw: 0.2, hd: 0.2 });
    } else {
      const site = makeBuildSite(4.4, 6);
      at(site, b.x, b.z);
      root.add(site);
      lifts.push(null);
      const hint = sign(i === 1 ? 'SECOND LIFT: COMING SOON' : 'ROOM TO GROW', { w: 3.4, h: 0.5, bg: W.black, fg: W.hazard });
      at(hint, b.x, b.z - 2.4 + 0.0);
      hint.position.y = 2.4;
      hint.position.z = ROOM.minZ + 0.2;
      hint.position.x = b.x;
      root.add(hint);
    }
  });

  // ---- the dyno ----
  const dynoOwned = owned.has('dyno');
  const dyno = makeDyno(dynoOwned);
  at(dyno, DYNO_AT.x, DYNO_AT.z);
  root.add(dyno);
  if (dynoOwned) {
    colliders.push({ x: DYNO_AT.x - 2.05, z: DYNO_AT.z + 1.6, hw: 0.25, hd: 0.25 });
    animators.push((dt) => {
      const fanSpeed = hasCarOn('dyno') ? 14 : 2;
      dyno.userData.fan.rotation.z += dt * fanSpeed;
      for (const r of dyno.userData.rollers) r.rotation.x += dt * (hasCarOn('dyno') ? 18 : 0);
    });
  }
  const hasCarOn = () => false;

  // ---- the desk, board, locker, bell ----
  const desk = makeDesk({ lit: true });
  at(desk, -6.6, 4.1, Math.PI);
  root.add(desk);
  colliders.push({ x: -6.6, z: 4.1, hw: 1.75, hd: 0.55 });
  const board = makeJobBoard(career.lifts.length + 3);
  at(board, ROOM.minX + 0.1, 0.4, Math.PI / 2);
  root.add(board);
  const calendar = makeCalendar(career.day);
  at(calendar, ROOM.minX + 0.08, -3.4, Math.PI / 2);
  root.add(calendar);
  const locker = makeLocker();
  at(locker, ROOM.maxX - 0.35, 3.4, -Math.PI / 2);
  root.add(locker);
  colliders.push({ x: ROOM.maxX - 0.35, z: 3.4, hw: 0.4, hd: 0.8 });

  // The closing bell: a pedestal by the door.
  const bell = new THREE.Group();
  bell.add(box(0.5, 0.9, 0.5, W.woodDark, { y: 0.45 }));
  bell.add(cyl(0.2, 0.2, 0.1, W.paint.gold, { y: 1.0, seg: 10 }));
  bell.add(cyl(0.05, 0.05, 0.1, W.paint.gold, { y: 1.1, seg: 6, edge: false }));
  const bellSign = sign('CLOSE UP', { w: 1.0, h: 0.3, bg: W.toolRed, fg: W.white });
  bellSign.position.set(0, 1.5, 0);
  bell.add(bellSign);
  at(bell, 5.4, 6.0);
  root.add(bell);
  colliders.push({ x: 5.4, z: 6.0, hw: 0.3, hd: 0.3 });

  // ---- decoration and clutter ----
  const neon = makeNeon(owned.has('sign') ? 'TUNING' : 'tuning shop', owned.has('sign') ? W.neonPink : W.cloth.silver, 5);
  at(neon, 0, ROOM.minZ + 0.25, 0, 4.1);
  root.add(neon);
  const posters = [-9.8, -6.3, 0.1, 5.2];
  posters.forEach((x, i) => { const p = makePoster(i + career.day); at(p, x, ROOM.minZ + 0.07, 0, 3.7); if (i === 2) p.position.y = 2.5; root.add(p); });
  const shelf = makeShelf(career.seed);
  at(shelf, -9.3, ROOM.minZ + 0.6, 0);
  root.add(shelf);
  colliders.push({ x: -9.3, z: ROOM.minZ + 0.6, hw: 1.6, hd: 0.35 });
  const chest = makeToolChest(W.toolRed);
  at(chest, -5.0, ROOM.minZ + 0.6, 0);
  root.add(chest);
  colliders.push({ x: -5.0, z: ROOM.minZ + 0.6, hw: 0.6, hd: 0.35 });
  const chest2 = makeToolChest(W.toolBlue);
  at(chest2, 1.3, ROOM.minZ + 0.6, 0);
  root.add(chest2);
  colliders.push({ x: 1.3, z: ROOM.minZ + 0.6, hw: 0.6, hd: 0.35 });
  const bench = makeWorkbench();
  at(bench, 6.0, ROOM.minZ + 0.7, 0);
  root.add(bench);
  colliders.push({ x: 6.0, z: ROOM.minZ + 0.7, hw: 1.25, hd: 0.5 });
  for (const [x, z, n] of [[10.1, -6.1, 5], [9.3, -6.4, 3]]) { const t = makeTyreStack(n); at(t, x, z); root.add(t); colliders.push({ x, z, r: 0.4 }); }
  for (const [x, z, c] of [[-10.3, -5.8, W.barrel], [-10.3, -5.0, W.barrelRed]]) { const b = makeBarrel(c); at(b, x, z); root.add(b); colliders.push({ x, z, r: 0.35 }); }
  const crate = makeCrate();
  at(crate, -10.0, 6.0);
  root.add(crate);
  colliders.push({ x: -10.0, z: 6.0, r: 0.5 });
  const cone = makeCone();
  at(cone, 2.4, 6.4);
  root.add(cone);
  const trophyCount = career.milestones.length;
  if (trophyCount > 0 || owned.has('lounge')) {
    const ts = makeTrophyShelf(trophyCount);
    at(ts, -1.8, ROOM.minZ + 0.2, 0, 0);
    ts.position.y = 0.3;
    root.add(ts);
  }

  // The lounge: couch, coffee, a plant, the arcade cabinet.
  if (owned.has('lounge')) {
    const couch = makeCouch(W.cloth.purple);
    at(couch, 8.0, 5.6, Math.PI);
    root.add(couch);
    colliders.push({ x: 8.0, z: 5.6, hw: 1.1, hd: 0.5 });
    const coffee = makeCoffeeMachine();
    at(coffee, 10.4, 4.9, -Math.PI / 2);
    root.add(coffee);
    colliders.push({ x: 10.4, z: 4.9, hw: 0.3, hd: 0.55 });
    const plant = makePlant(true);
    at(plant, 10.3, 1.4);
    root.add(plant);
    const arcade = makeArcade();
    at(arcade, 6.2, 6.5, Math.PI);
    arcade.rotation.y = Math.PI;
    root.add(arcade);
    colliders.push({ x: 6.2, z: 6.5, hw: 0.5, hd: 0.45 });
    const lamp = makeFloorLamp();
    at(lamp, 10.2, 2.6);
    root.add(lamp);
    interactables.push({
      id: 'coffee', x: 9.7, z: 4.9, r: 2.0, label: 'Have a coffee', hint: 'A tip from Pops.',
      run: () => api.emit({ type: 'act', id: 'coffee' }),
    });
    interactables.push({
      id: 'arcade', x: 6.2, z: 5.7, r: 1.8, label: 'Play the arcade', hint: 'Rev-limiter reaction game.',
      run: () => api.emit({ type: 'act', id: 'arcade' }),
    });
  }
  // The shop dog.
  const dog = makeDog(W.paint.copper);
  at(dog, 2, 4);
  root.add(dog);
  const dogState = { x: 2, z: 4, tx: 2, tz: 4, wait: 1, speed: 0 };
  interactables.push({
    id: 'dog', x: 0, z: 0, r: 1.4, label: 'Pet Torque', hint: 'Good boy.',
    run: () => { api.emit({ type: 'act', id: 'dog' }); api.say('dog', 'Woof!', new THREE.Vector3(dogState.x, 1.0, dogState.z), 2, 'bark'); },
  });
  const dogInteract = interactables[interactables.length - 1];

  // ---- lighting: tube lights on the back wall, and real lights that come on at dusk ----
  for (const x of [-7.4, -2.3, 2.8, 8]) {
    root.add(box(2.4, 0.12, 0.12, W.neonCyan, { x, y: 4.45, z: ROOM.minZ + 0.2, mat: glow(W.white), edge: false, cast: false }));
  }
  for (const [x, z] of [[-7.4, -3], [-2.3, -3], [2.8, -3], [-6, 3], [2, 3], [8, -2]]) {
    const pl = new THREE.PointLight(W.lampWarm, 0, 14, 1.6);
    pl.position.set(x, 4.2, z);
    root.add(pl);
    lights.push(pl);
  }

  // ---- interactables ----
  interactables.push({
    id: 'board', x: ROOM.minX + 1.6, z: 0.4, r: 2.4, label: 'Customers', hint: 'See who is waiting.',
    run: () => api.emit({ type: 'act', id: 'board' }),
  });
  interactables.push({
    id: 'desk', x: -6.6, z: 2.8, r: 2.0,
    label: (a) => (a.career().working ? 'Open the laptop' : 'Laptop (no car on the bay)'),
    hint: 'Work on the customer car.',
    run: () => api.emit({ type: 'act', id: 'desk' }),
  });
  interactables.push({
    id: 'locker', x: ROOM.maxX - 1.8, z: 3.4, r: 2.0, label: 'Change clothes', hint: 'Your locker and mirror.',
    run: () => api.emit({ type: 'act', id: 'locker' }),
  });
  interactables.push({
    id: 'bell', x: 5.4, z: 5.0, r: 1.8, label: (a) => `Close up for the day ${a.career().day}`, hint: 'Pay the running costs and open tomorrow.',
    run: () => api.emit({ type: 'act', id: 'bell' }),
  });
  interactables.push({
    id: 'door', x: 0, z: ROOM.maxZ + 1.0, r: 2.4, label: 'Head into town', hint: 'Walk or drive.',
    onFoot: true, run: () => api.emit({ type: 'act', id: 'door' }),
  });
  interactables.push({
    id: 'trophies', x: -1.8, z: ROOM.minZ + 1.6, r: 2.0, label: 'Look at the trophies', hint: `${career.milestones.length} milestones so far.`,
    enabled: () => career.milestones.length > 0, run: () => api.emit({ type: 'act', id: 'trophies' }),
  });
  if (dynoOwned) {
    interactables.push({
      id: 'dyno', x: DYNO_AT.x, z: DYNO_AT.z + 2.9, r: 2.4, label: (a) => (a.career().working ? 'Use the dyno' : 'Dyno (no car on the bay)'), hint: 'Put the car on the rollers and pull.',
      run: () => api.emit({ type: 'act', id: 'dyno' }),
    });
  }
  // Each bay has three things to do with the car on its lift.
  BAYS.forEach((b, i) => {
    interactables.push({
      id: `bay${i}:tune`, x: b.x, z: b.z + 2.9, r: 2.0, onFoot: true,
      enabled: () => !!api.career().lifts[i] && !api.away?.has(api.career().lifts[i].jobId),
      label: () => { const l = api.career().lifts[i]; return l ? `Tune ${jobById(l.jobId)?.customer.name ?? 'this'}'s car` : ''; },
      hint: 'Put it on the bay and open the laptop.',
      run: () => api.emit({ type: 'act', id: 'tune', bay: i }),
    });
    interactables.push({
      id: `bay${i}:look`, x: b.x - 1.2, z: b.z + 2.9, r: 1.3, onFoot: true,
      enabled: () => !!api.career().lifts[i],
      label: () => { const e = carAt(i); return e?.rig.hoodOpen() ? 'Close the bonnet' : 'Look under the bonnet'; },
      hint: 'What is actually fitted?',
      run: () => { const e = carAt(i); if (!e) return; const open = !e.rig.hoodOpen(); e.rig.setHood(open); api.emit({ type: 'act', id: 'inspect', bay: i, open }); },
    });
    interactables.push({
      id: `bay${i}:drive`, x: b.x + 1.2, z: b.z + 2.9, r: 1.3, onFoot: true,
      enabled: () => !!api.career().lifts[i] && carAt(i) && !carAt(i).anim,
      label: 'Take it for a road test', hint: 'Drive it round town.',
      run: () => api.emit({ type: 'act', id: 'drive', bay: i }),
    });
  });

  // ---- customer cars ----
  const carAt = (i) => [...cars.values()].find((c) => c.bay === i && !c.leaving);

  function makeEntry(lift, bay) {
    const job = jobById(lift.jobId);
    const rig = carFor(specForJob(job, lift.car.build));
    const b = BAYS[bay];
    rig.group.position.set(b.x, 0, b.z);
    rig.group.rotation.y = 0;
    root.add(rig.group);
    const e = { id: lift.jobId, job, rig, bay, lift: 0, anim: null, leaving: false, customer: null };
    cars.set(lift.jobId, e);
    // The car's own collider, so the walker does not stand in it. Circle-set along its length.
    e.colliders = [-1.4, 0, 1.4].map((dz) => ({ x: b.x, z: b.z + dz, r: 1.0 }));
    colliders.push(...e.colliders);
    return e;
  }

  /** The customer walks out of the shop. @param {any} e */
  function customerLeaves(e) {
    const p = e.customer;
    if (!p) return;
    e.customer = null;
    const from = { x: p.group.position.x, z: p.group.position.z };
    npcs.set(`${e.id}:walkout`, { p, path: [from, { x: 0, z: 6 }, { x: 0, z: 13 }], t: 0, i: 0, remove: true });
  }

  /** Car backs in off the street; the customer gets out and speaks. @param {string} jobId @param {{says?: string}} [opts] */
  function arrive(jobId, opts = {}) {
    const lift = api.career().lifts.find((l) => l.jobId === jobId);
    if (!lift) return;
    let e = cars.get(jobId);
    if (e && e.anim) return;
    const bay = api.career().lifts.indexOf(lift);
    if (!e) e = makeEntry(lift, bay);
    const b = BAYS[bay];
    const start = { x: -2, z: 19.5 };
    const path = [
      { x: -28, z: 19.5 }, { x: start.x, z: 19.5 },
      { x: start.x, z: 19.5, rev: true }, { x: b.x * 0.3, z: 12.5, rev: true }, { x: b.x, z: 6.2, rev: true }, { x: b.x, z: b.z, rev: true },
    ];
    // The first leg is driven forward; the rest is reversed into the bay.
    path[1].rev = false;
    const follower = pathFollower(e.rig, path, 7.5, () => {
      e.anim = null;
      // The customer gets out on the driver's side.
      const cust = makePerson(npcLook(hash(jobId), {}), { mood: 'worry' });
      cust.group.position.set(b.x + 1.6, 0, b.z + 2.5);
      cust.group.rotation.y = Math.PI * 0.7;
      cust.setPose('think');
      root.add(cust.group);
      e.customer = cust;
      api.say(`say:${jobId}`, opts.says ?? jobById(jobId).says, new THREE.Vector3(b.x + 1.6, 2.2, b.z + 2.5), 6.5, 'say');
      setTimeout(() => customerLeaves(e), 6800);
    });
    e.anim = follower;
    e.rig.group.position.set(path[0].x, 0, path[0].z);
  }

  /** Make the model of a car for a lift entry, parked, with no animation. */
  function sync(c) {
    const lifts2 = c.lifts;
    // Add cars that appeared without being driven in (a loaded save).
    lifts2.forEach((l, i) => {
      const e = cars.get(l.jobId);
      if (!e && api.away?.has(l.jobId)) { /* out on a road test */ }
      else if (!e && api.arrivals?.has(l.jobId)) { api.arrivals.delete(l.jobId); arrive(l.jobId); }
      else if (!e) makeEntry(l, i);
      else if (e.bay !== i && !e.anim) {
        e.bay = i;
        e.rig.group.position.set(BAYS[i].x, 0, BAYS[i].z);
      }
    });
    // Cars that are gone leave.
    for (const e of cars.values()) {
      if (!e.leaving && !lifts2.some((l) => l.jobId === e.id)) leave(e, c);
    }
    // The working car rides up.
    for (const e of cars.values()) {
      e.liftTarget = !e.leaving && c.working === e.id ? LIFT_UP : 0;
      // A different build means different hardware: redraw the engine bay.
      const l = lifts2.find((x) => x.jobId === e.id);
      if (l && !e.anim) {
        const sig = JSON.stringify(specForJob(e.job, l.car.build).engine);
        if (sig !== e.sig) {
          if (e.sig) redraw(e, l);
          e.sig = sig;
        }
      }
    }
  }

  function redraw(e, l) {
    const open = e.rig.hoodOpen();
    const pos = e.rig.group.position.clone();
    const ry = e.rig.group.rotation.y;
    root.remove(e.rig.group);
    e.rig = carFor(specForJob(e.job, l.car.build));
    e.rig.group.position.copy(pos);
    e.rig.group.rotation.y = ry;
    e.rig.setHood(open);
    root.add(e.rig.group);
  }

  /** The finished car leaves: its customer comes in for it first. @param {any} e @param {any} c */
  function leave(e, c) {
    e.leaving = true;
    colliders.splice(0, colliders.length, ...colliders.filter((k) => !e.colliders?.includes(k)));
    const last = c.last && c.last.jobId === e.id ? c.last : null;
    const verdict = last?.verdict ?? 'pass';
    const happy = verdict === 'pass' || verdict === 'partial';
    const b = BAYS[e.bay];
    const cust = makePerson(npcLook(hash(e.id), {}), { mood: happy ? 'smile' : 'worry' });
    cust.group.position.set(0, 0, 13);
    root.add(cust.group);
    const dest = { x: b.x + 1.8, z: b.z + 2.6 };
    npcs.set(`${e.id}:in`, {
      p: cust, path: [{ x: 0, z: 13 }, { x: 0, z: 7 }, { x: dest.x, z: 6 }, dest], t: 0, i: 0,
      done: () => {
        cust.setPose(happy ? 'cheer' : 'think');
        api.say(`react:${e.id}`, last?.line ?? 'Thanks!', new THREE.Vector3(dest.x, 2.2, dest.z), 3.2, happy ? 'say' : 'grumble');
        setTimeout(() => {
          cust.group.visible = false;
          const out = [{ x: b.x, z: b.z }, { x: b.x, z: b.z + 5 }, { x: b.x * 0.4, z: 12 }, { x: 4, z: 19.5 }, { x: 30, z: 19.5 }];
          e.liftTarget = 0;
          e.anim = pathFollower(e.rig, out, 6.5, () => {
            root.remove(e.rig.group);
            root.remove(cust.group);
            cars.delete(e.id);
          });
          e.anim.holdY = true;
        }, 1800);
      },
    });
    // Drives into the bay carries its own y: bring a raised car down before it goes.
    void c;
  }

  // ---- animation ----
  function update(dt, t) {
    const night = api.stage.night;
    const phase = api.career().phase ?? 0;
    for (const l of lights) l.intensity += ((night || phase >= 2 ? 22 : 4) - l.intensity) * Math.min(1, dt * 2);
    for (const e of cars.values()) {
      if (e.anim) e.anim.update(dt);
      e.rig.update(dt);
      const target = e.liftTarget ?? 0;
      e.lift = (e.lift ?? 0) + (target - (e.lift ?? 0)) * Math.min(1, dt * 2.2);
      if (!e.anim || e.anim.holdY) e.rig.group.position.y = e.lift;
      const lf = lifts[e.bay];
      if (lf && !e.leaving) lf.userData.setHeight(e.lift);
      if (e.leaving) { const lf2 = lifts[e.bay]; lf2?.userData.setHeight(e.lift); }
    }
    for (const [k, n] of npcs) {
      const { p, path } = n;
      if (n.i >= path.length - 1) {
        p.update(dt, 0);
        if (n.remove) { root.remove(p.group); npcs.delete(k); } else { n.done?.(); n.done = null; if (!n.stay) npcs.delete(k); }
        if (!n.remove && !n.stay) npcs.set(`${k}:idle`, { p, path: [path[path.length - 1], path[path.length - 1]], i: 1, stay: true });
        continue;
      }
      const a = path[n.i];
      const b = path[n.i + 1];
      const pos = p.group.position;
      const dx = b.x - pos.x;
      const dz = b.z - pos.z;
      const d = Math.hypot(dx, dz);
      const step = 2.4 * dt;
      if (d <= step) { pos.x = b.x; pos.z = b.z; n.i += 1; } else { pos.x += (dx / d) * step; pos.z += (dz / d) * step; }
      p.group.rotation.y = Math.atan2(dx, dz);
      p.update(dt, 2.4);
      void a;
    }
    for (const e of cars.values()) if (e.customer) e.customer.update(dt, 0);
    // Screens flicker; the neon hums.
    const flick = 0.85 + 0.15 * Math.sin(t * 7);
    if (desk.userData.screens) for (const s of desk.userData.screens) s.scale.y = flick;
    // The dog wanders.
    dogState.wait -= dt;
    if (dogState.wait <= 0 && Math.hypot(dogState.tx - dogState.x, dogState.tz - dogState.z) < 0.2) {
      dogState.tx = -11 + Math.random() * 22;
      dogState.tz = 3 + Math.random() * 5;
      dogState.wait = 2 + Math.random() * 4;
    }
    const ddx = dogState.tx - dogState.x;
    const ddz = dogState.tz - dogState.z;
    const dd = Math.hypot(ddx, ddz);
    const ds = dd > 0.2 ? Math.min(dd, 1.7 * dt) : 0;
    if (ds > 0) { dogState.x += (ddx / dd) * ds; dogState.z += (ddz / dd) * ds; dog.rotation.y = Math.atan2(ddx, ddz); }
    dog.position.set(dogState.x, 0, dogState.z);
    dog.userData.update(dt, ds > 0 ? 1.7 : 0);
    dogInteract.x = dogState.x;
    dogInteract.z = dogState.z;
    for (const a of animators) a(dt);
    // Walking out of the door into town.
    if (api.player.z > ROOM.maxZ + 3.2 && !api.drive?.inside && !level.leaving) { level.leaving = true; api.emit({ type: 'act', id: 'door' }); }
    if (api.player.z < ROOM.maxZ + 2.5) level.leaving = false;
  }

  const level = {
    root, colliders, interactables, time: PHASE_TIME[career.phase ?? 0],
    camera: { pitch: 0.74, dist: 25, yaw: 0, fov: 28 },
    focus: (x, z) => ({ x: Math.max(-5, Math.min(5, x * 0.7)), z: Math.max(-1, Math.min(2, z * 0.3)) }),
    bounds: [
      { minX: ROOM.minX + 0.5, maxX: ROOM.maxX - 0.5, minZ: ROOM.minZ + 0.7, maxZ: ROOM.maxZ - 0.5 },
      { minX: DOOR.x - DOOR.half + 0.6, maxX: DOOR.x + DOOR.half - 0.6, minZ: ROOM.maxZ - 1, maxZ: ROOM.maxZ + 5 },
    ],
    spawn: (e) => (e.from === 'town' ? { x: 0, z: ROOM.maxZ - 1.6, yaw: Math.PI } : { x: -2, z: 5.0, yaw: Math.PI }),
    update,
    sync,
    leaving: false,
    cmd(name, ...args) {
      if (name === 'arrive') return arrive(args[0], args[1]);
      if (name === 'bay') return carAt(args[0]);
      if (name === 'carAt') return carAt(args[0]);
      return undefined;
    },
    carEntry: carAt,
    noCars: true,
    /** The pose and place for the tuner at the desk and so on. */
    spots: { desk: { x: -9.2, z: 3.9 } },
    dispose() { for (const e of cars.values()) e.anim = null; },
  };
  // Cars already on the lifts when the shop opens.
  sync(career);
  for (const e of cars.values()) { const l = e.lift; e.lift = e.liftTarget ?? 0; void l; }
  // A first-time visit starts with the tuner at the door; a car that came with us stays outside.
  void entry;
  return level;
}
