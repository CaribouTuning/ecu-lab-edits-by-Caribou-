/**
 * The town's two race venues, alive: the drag strip's tree and the circuit's start lights,
 * the rival's car, the clocks, and the practice timer that runs whenever you drive onto
 * the circuit on your own.
 *
 * The numbers come from race.js (pure, tested); this file puts them on the screen. A race
 * is driven, not replayed: you launch on the tree or off the lights, and your rival drives
 * the same vehicle model on the same tarmac.
 */

import { world as W } from '../../tokens.js';
import { THREE, box, cyl } from '../gfx.js';
import { STEP_S, makeVehicle, stepVehicle } from '../driving.js';
import { aiDrive, dragDrive, makeDragClock, makeLapCounter, speedProfile, tyreMu } from '../race.js';

import { CIRCUIT, STRIP, surfaceAt } from './townPlan.js';

/**
 * @param {any} api the runtime
 * @param {THREE.Group} root
 * @param {any[]} colliders the level's, so a rival's car is something you can hit
 */
export function makeVenues(api, root, colliders) {
  // ---- the tree, between the lanes just past the line ----
  const tree = new THREE.Group();
  tree.userData.dynamic = true;
  tree.position.set(STRIP.treeX, 0, STRIP.z);
  tree.add(box(0.25, 3.2, 0.25, W.metalDark, { y: 1.6 }));
  tree.add(box(0.5, 2.6, 1.6, W.black, { y: 2.9 }));
  /** @type {Record<string, THREE.Mesh[]>} */
  const bulbs = { player: [], rival: [] };
  const kinds = ['pre', 'stage', 'amber', 'amber', 'amber', 'green', 'red'];
  const lit = { pre: W.cloth.white, stage: W.cloth.white, amber: W.indicator, green: W.screen, red: W.taillight };
  const off = new THREE.MeshBasicMaterial({ color: W.cloth.charcoal });
  /** @type {Record<string, THREE.Material>} */
  const onMats = {};
  for (const [k, c] of Object.entries(lit)) onMats[k] = new THREE.MeshBasicMaterial({ color: c });
  for (const [side, z] of /** @type {[string, number][]} */ ([['player', 0.45], ['rival', -0.45]])) {
    kinds.forEach((k, i) => {
      // Both faces: the player's lane sees one side and the camera the other.
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.24, 0.3), off);
      m.position.set(0, 3.95 - i * 0.33, z);
      m.userData.kind = k;
      tree.add(m);
      bulbs[side].push(m);
    });
  }
  root.add(tree);
  colliders.push({ x: STRIP.treeX, z: STRIP.z, r: 0.6 });
  const setTree = (state) => {
    for (const side of ['player', 'rival']) bulbs[side].forEach((m, i) => {
      const k = kinds[i];
      const on = (k === 'pre' && state.pre) || (k === 'stage' && state.stage) || (k === 'amber' && state.amber) || (k === 'green' && state.green?.[side]) || (k === 'red' && state.red?.[side]);
      m.material = on ? onMats[k] : off;
    });
  };
  setTree({});

  // ---- the circuit's start gantry: five reds that go out together ----
  const gantry = new THREE.Group();
  gantry.userData.dynamic = true;
  const g0 = CIRCUIT.path.at(CIRCUIT.startS);
  gantry.position.set(g0.x, 0, g0.z);
  gantry.rotation.y = g0.heading + Math.PI / 2;
  for (const s of [-1, 1]) gantry.add(box(0.4, 6, 0.4, W.metalDark, { x: s * (CIRCUIT.width / 2 + 0.8), y: 3 }));
  gantry.add(box(CIRCUIT.width + 2, 1.0, 0.5, W.black, { y: 6.2 }));
  /** @type {THREE.Mesh[]} */
  const reds = [];
  for (let i = 0; i < 5; i += 1) {
    const m = cyl(0.32, 0.32, 0.12, W.cloth.charcoal, { x: -2.4 + i * 1.2, y: 6.2, seg: 10, axis: 'z', edge: false });
    m.position.z = 0.3;
    m.material = off;
    gantry.add(m);
    reds.push(m);
  }
  root.add(gantry);
  const redOn = new THREE.MeshBasicMaterial({ color: W.taillight });
  const setReds = (n) => reds.forEach((m, i) => { m.material = i < n ? redOn : off; });

  // ---- the race ----
  /** @type {any} */ let race = null;
  /** The practice clock: always running when you drive the circuit on your own. */
  let practice = makeLapCounter(CIRCUIT.path, CIRCUIT.startS);
  let practiceT = 0;
  let hudT = 0;
  /** A rival's car that has finished and is pulling off: removed after a while. */
  /** @type {{rig: any, t: number, st?: any, pt?: any, carry?: number}[]} */
  const leaving = [];

  /** Put a car model where its state says, with roll, pitch and wheels. */
  const syncRig = (rig, st, dist) => {
    rig.group.position.set(st.x, 0, st.z);
    rig.group.rotation.y = st.heading;
    rig.group.rotation.z = Math.max(-0.05, Math.min(0.05, -st.ay * 0.0035));
    rig.group.rotation.x = Math.max(-0.04, Math.min(0.04, -st.ax * 0.003));
    rig.steer(st.steer);
    rig.roll(dist);
    rig.setBrake(st.brake > 0.1 && st.vx > 0.5);
    rig.update(0.016);
  };

  /** A rival car on the grid: a state, a rig, a collider. */
  function rivalCar(o, at) {
    const st = makeVehicle({ x: at.x, z: at.z, heading: at.heading });
    root.add(o.rig.group);
    const hits = [0, 1, 2].map(() => ({ x: at.x, z: at.z, r: o.rig.dims.wid / 2 + 0.05 }));
    colliders.push(...hits);
    const car = { ...o, st, carry: 0, hits, prog: { s: 0, offset: 0 } };
    syncRig(o.rig, st, 0);
    return car;
  }

  const placeHits = (car) => {
    const half = car.rig.dims.len / 2 - car.rig.dims.wid / 2;
    [-half, 0, half].forEach((off2, i) => { car.hits[i].x = car.st.x + Math.sin(car.st.heading) * off2; car.hits[i].z = car.st.z + Math.cos(car.st.heading) * off2; });
  };

  /** Stand the player's car still at a spot. */
  const stagePlayer = (x, z, heading) => {
    const d = api.drive;
    const s = d.state;
    Object.assign(s, makeVehicle({ x, z, heading }));
    d.carry = 0;
    api.rig.snap();
  };

  /**
   * Line up at the tree. `rival` is null for a solo pass.
   * @param {{rival: null|{rig: any, pt: any, rt: number, id: string, name: string}, carId: string}} o
   */
  function startDrag(o) {
    if (race || !api.drive?.inside) return;
    const half = api.drive.rig.dims.len / 2;
    stagePlayer(STRIP.startX - half - 0.05, STRIP.lanes.player, Math.PI / 2);
    const greenAt = 3.2 + Math.random() * 1.4;
    race = {
      kind: 'drag', o, t: 0, greenAt, ended: false,
      pclock: makeDragClock(STRIP.startX, STRIP.finishX, half),
      rival: o.rival ? rivalCar(o.rival, { x: STRIP.startX - o.rival.rig.dims.len / 2 - 0.05, z: STRIP.lanes.rival, heading: Math.PI / 2 }) : null,
    };
    race.pclock.green = greenAt;
    if (race.rival) { race.rclock = makeDragClock(STRIP.startX, STRIP.finishX, o.rival.rig.dims.len / 2); race.rclock.green = greenAt; }
    api.emit({ type: 'race', on: true, kind: 'drag' });
  }

  /**
   * Line up on the grid. `rival` is null for a timed session on your own.
   * @param {{rival: null|{rig: any, pt: any, id: string, name: string, skill: number}, carId: string, laps?: number}} o
   */
  function startCircuit(o) {
    if (race || !api.drive?.inside) return;
    const path = CIRCUIT.path;
    const slot = (sl) => {
      const p = path.at(CIRCUIT.startS - sl.back);
      return { x: p.x + Math.cos(p.heading) * sl.side, z: p.z - Math.sin(p.heading) * sl.side, heading: p.heading, s: CIRCUIT.startS - sl.back };
    };
    const ps = slot(CIRCUIT.grid[0]);
    stagePlayer(ps.x, ps.z, ps.heading);
    const laps = o.laps ?? CIRCUIT.laps;
    race = {
      kind: 'circuit', o, t: 0, outAt: 3.6 + Math.random() * 1.2, laps, ended: false,
      pl: makeLapCounter(path, CIRCUIT.startS), rival: null, top: 0, off: 0,
    };
    race.pl.s = ps.s;
    if (o.rival) {
      const rs = slot(CIRCUIT.grid[1]);
      race.rival = rivalCar(o.rival, rs);
      race.rival.prog.s = rs.s;
      // A little to the side of the line, so the two cars do not drive into each other.
      race.rival.prog.offset = CIRCUIT.grid[1].side * 0.5;
      race.rival.profile = speedProfile(path, tyreMu(o.rival.pt), o.rival.skill);
      race.rl = makeLapCounter(path, CIRCUIT.startS);
      race.rl.s = rs.s;
    }
    api.emit({ type: 'race', on: true, kind: 'circuit' });
  }

  function endRace(result) {
    if (!race || race.ended) return;
    race.ended = true;
    api.emit({ type: 'raceEnd', result: { kind: race.kind, carId: race.o.carId, rivalId: race.o.rival?.id ?? null, ...result } });
    api.emit({ type: 'race', on: false });
    const r = race.rival;
    race = null;
    setReds(0);
    // Leave the tree showing how it ended for a moment.
    setTimeout(() => { if (!race) setTree({}); }, 4000);
    if (r) {
      // The rival pulls off and slows down; their car goes once it is out of the way.
      leaving.push({ rig: r.rig, t: 0, st: r.st, pt: r.pt, carry: 0 });
      colliders.splice(0, colliders.length, ...colliders.filter((k) => !r.hits.includes(k)));
    }
    practice = makeLapCounter(CIRCUIT.path, CIRCUIT.startS);
  }

  /** Step a rival's car by real time. */
  const stepRival = (car, dt, input) => {
    let t = car.carry + Math.min(dt, 0.1);
    const before = { x: car.st.x, z: car.st.z };
    while (t >= STEP_S) { stepVehicle(car.st, car.pt, input(), STEP_S); t -= STEP_S; }
    car.carry = t;
    syncRig(car.rig, car.st, Math.hypot(car.st.x - before.x, car.st.z - before.z) * Math.sign(car.st.vx || 1));
    placeHits(car);
  };

  function updateDrag(dt) {
    const r = race;
    r.t += dt;
    const t = r.t;
    const d = api.drive;
    const green = t >= r.greenAt;
    const foul = r.pclock.foul;
    setTree({
      pre: t > 0.5, stage: t > 1.2, amber: t >= r.greenAt - 0.4 && t < r.greenAt,
      green: { player: green && !foul, rival: green },
      red: { player: foul, rival: false },
    });
    if (d?.inside) r.pclock.update(d.state.x, d.state.vx, t, d.state);
    if (r.rival) {
      const car = r.rival;
      const go = t >= r.greenAt + car.rt && !r.rclock.done;
      stepRival(car, dt, () => (r.rclock.done ? { throttle: 0, brake: 0.5, steer: 0 } : { ...dragDrive(car.st, car.pt, STRIP.lanes.rival, go), tc: true }));
      r.rclock.update(car.st.x, car.st.vx, t, car.st);
    }
    const pDone = r.pclock.done;
    const rDone = !r.rival || r.rclock.done;
    const late = t > r.greenAt + 45;
    if ((pDone && rDone) || late || (pDone && t - (r.pDoneAt ??= t) > 12)) {
      const pc = r.pclock;
      const rc = r.rclock;
      const pTotal = pc.foul ? Infinity : pc.total();
      const rTotal = rc ? rc.total() : Infinity;
      endRace({
        solo: !r.rival, foul: pc.foul, finished: pc.done,
        won: r.rival ? pTotal < rTotal : null,
        margin: r.rival && Number.isFinite(pTotal) && Number.isFinite(rTotal) ? rTotal - pTotal : null,
        player: { rt: pc.rt, et: pc.et, sixtyFootT: pc.sixtyFootT, eighthET: pc.eighthET, trapMph: pc.trapMph, wheelspun: pc.wheelspun, topGearUsed: pc.topGear },
        rival: rc ? { rt: rc.rt, et: rc.et, sixtyFootT: rc.sixtyFootT, eighthET: rc.eighthET, trapMph: rc.trapMph } : null,
      });
    }
  }

  function updateCircuit(dt) {
    const r = race;
    r.t += dt;
    const t = r.t;
    const out = t >= r.outAt;
    setReds(out ? 0 : Math.min(5, Math.floor(t / 0.7)));
    const d = api.drive;
    if (d?.inside) {
      const done = r.pl.update(d.state.x, d.state.z, t, CIRCUIT.width);
      if (done && r.pl.lap === 1) api.emit({ type: 'toast', text: `Lap ${done.time.toFixed(2)} s`, tone: 'ok' });
      r.top = Math.max(r.top, d.state.vx);
      if (r.pl.offNow && out) r.off += dt;
    }
    if (r.rival) {
      const car = r.rival;
      const surf = surfaceAt(car.st.x, car.st.z);
      const finished = r.rl.lap >= r.laps;
      stepRival(car, dt, () => (!out ? { throttle: 0.3, brake: 1, steer: 0, hold: true } : finished ? { ...aiDrive(car.st, car.pt, CIRCUIT.path, car.profile, car.prog, surf.grip), throttle: 0, brake: car.st.vx > 12 ? 0.3 : 0, tc: true, gripScale: surf.grip, rollScale: surf.roll } : { ...aiDrive(car.st, car.pt, CIRCUIT.path, car.profile, car.prog, surf.grip), tc: true, gripScale: surf.grip, rollScale: surf.roll }));
      r.rl.update(car.st.x, car.st.z, t, CIRCUIT.width);
      if (finished && r.rivalDoneAt == null) r.rivalDoneAt = t;
    }
    const pDone = r.pl.lap >= r.laps;
    const gaveUp = r.rivalDoneAt != null && t - r.rivalDoneAt > 40;
    if (pDone || gaveUp || t > 60 * 15) {
      const won = r.rival ? pDone && (r.rivalDoneAt == null || r.rivalDoneAt > t - 1e-6) : null;
      endRace({
        solo: !r.rival, finished: pDone, won,
        laps: r.pl.laps, best: r.pl.best, offTrack: r.off, topMph: r.top * 2.23694,
        rival: r.rival ? { laps: r.rl.laps, best: r.rl.best, finished: r.rivalDoneAt != null } : null,
      });
    }
  }

  /** What the race overlay shows, sent a few times a second. */
  function hud() {
    const r = race;
    if (!r) return null;
    if (r.kind === 'drag') {
      const pc = r.pclock;
      const t = r.t;
      return {
        kind: 'drag', rival: r.o.rival?.name ?? null,
        phase: t < r.greenAt - 0.4 ? 'stage' : t < r.greenAt ? 'amber' : pc.done ? 'done' : 'run',
        foul: pc.foul, rt: pc.rt, et: pc.left != null ? (pc.et ?? t - pc.left) : null,
        rivalEt: r.rclock?.done ? r.rclock.et : null,
      };
    }
    const lead = r.rival ? (r.pl.raced >= r.rl.raced ? 1 : 2) : 1;
    return {
      kind: 'circuit', rival: r.o.rival?.name ?? null,
      phase: r.t < r.outAt ? 'lights' : 'run', lights: Math.min(5, Math.floor(r.t / 0.7)),
      lap: Math.min(r.laps, r.pl.lap + 1), laps: r.laps, pos: lead, of: r.rival ? 2 : 1,
      time: r.pl.lapStart != null ? r.t - r.pl.lapStart : 0, best: Number.isFinite(r.pl.best) ? r.pl.best : null,
      gap: r.rival ? r.rl.raced - r.pl.raced : null,
    };
  }

  return {
    get racing() { return !!race; },
    cmd(name, arg) {
      if (name === 'dragRace') return startDrag(arg);
      if (name === 'circuitRace') return startCircuit(arg);
      if (name === 'retire' && race) return endRace({ solo: !race.rival, finished: false, won: race.rival ? false : null, retired: true, laps: race.pl?.laps ?? [], best: race.pl?.best ?? Infinity, offTrack: race.off ?? 0, topMph: (race.top ?? 0) * 2.23694, player: race.pclock ? {} : undefined });
      return undefined;
    },
    /** While a race is waiting for its start, the brakes are on: the driver's feet do not move the car. */
    driveInput(input) {
      if (!race) return input;
      // Rev it on the line if you like: the car goes when the throttle goes past half.
      if (race.kind === 'drag' && race.pclock.left == null) return input.throttle > 0.5 ? { ...input, throttle: 1 } : { ...input, hold: true };
      if (race.kind === 'circuit' && race.t < race.outAt) return { ...input, hold: true };
      return input;
    },
    update(dt) {
      if (race?.kind === 'drag') updateDrag(dt);
      else if (race?.kind === 'circuit') updateCircuit(dt);
      for (const l of leaving) {
        l.t += dt;
        if (l.st) {
          // Coast to a stop off to the side.
          let tt = (l.carry ?? 0) + Math.min(dt, 0.1);
          while (tt >= STEP_S) { stepVehicle(l.st, l.pt, { throttle: 0, brake: 0.6, steer: 0 }, STEP_S); tt -= STEP_S; }
          l.carry = tt;
          l.rig.group.position.set(l.st.x, 0, l.st.z);
          l.rig.group.rotation.y = l.st.heading;
        }
      }
      for (let i = leaving.length - 1; i >= 0; i -= 1) if (leaving[i].t > 8) { root.remove(leaving[i].rig.group); leaving.splice(i, 1); }
      hudT += dt;
      if (hudT > 0.1) {
        hudT = 0;
        const h = hud();
        if (h) api.emit({ type: 'raceHud', hud: h });
      }
    },
    /** Practice: lap times whenever you drive the circuit and no race is on. @param {any} d @param {number} dt */
    onDrive(d, dt) {
      if (race) return;
      practiceT += dt;
      const on = surfaceAt(d.state.x, d.state.z).kind === 'track';
      if (!on && practice.lapStart == null) return;
      const done = practice.update(d.state.x, d.state.z, practiceT, CIRCUIT.width);
      if (done) api.emit({ type: 'lap', time: done.time, carId: d.id });
    },
    dispose() { race = null; },
  };
}
