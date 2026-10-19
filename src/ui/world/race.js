/**
 * Racing in the town: the other drivers, the clocks and who won.
 *
 * Rivals drive the same vehicle model you do (driving.js), pushed by their own engine's
 * measured torque. Their driving is simple and honest:
 *   steering    pure pursuit: aim at a point a little way down the racing line, and turn
 *               the wheel by the arc that reaches it, delta = atan(2 L sin(alpha) / Ld)
 *   speed       a corner can be taken at v = sqrt(mu g R), so the line has a speed limit at
 *               every metre; working back from each corner at the deceleration the tyres
 *               can give says where to brake. A rival's skill is the share of that grip
 *               they dare use.
 * Nobody is given a time and nobody is slowed down to let you win: a rival's lap is what
 * their car and their nerve make of the corners.
 *
 * Plain numbers; no WebGL. The town level draws what this decides.
 */

import { G } from '../../sim/index.js';

import { lockFor, tyreMu, toMph } from './driving.js';

/** How far ahead the AI looks along the line, metres: a base plus some per m/s of speed. */
const LOOK_BASE = 7;
const LOOK_PER_MS = 0.45;
const LOOK_MAX = 28;
/** Fastest anyone plans for, m/s, so a straight does not ask for infinity. */
const V_CAP = 95;
/** Share of the grip a driver plans to brake with: braking while turning shares the tyre. */
const BRAKE_SHARE = 0.8;

/**
 * The speed limit at every few metres of a path: corner speed from the curvature, then
 * braking zones worked back from each corner.
 * @param {ReturnType<import('./levels/roadNet.js').measuredPath>} path
 * @param {number} mu tyre grip
 * @param {number} skill 0..1, the share of the grip used
 * @param {number} [step] metres between samples
 */
export function speedProfile(path, mu, skill, step = 2) {
  const n = Math.max(2, Math.ceil(path.length / step));
  const ds = path.length / n;
  const raw = new Float64Array(n);
  const span = 4;
  for (let i = 0; i < n; i += 1) {
    const a = path.at(i * ds - span);
    const b = path.at(i * ds + span);
    let dh = b.heading - a.heading;
    dh = ((dh + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    const k = Math.abs(dh) / (2 * span);
    raw[i] = Math.min(V_CAP, Math.sqrt((mu * skill * G) / Math.max(k, 1e-5)));
  }
  // The slowest point within a few car lengths: a corner's tightest part decides it.
  const v = new Float64Array(n);
  const reach = Math.ceil(10 / ds);
  for (let i = 0; i < n; i += 1) {
    let m = raw[i];
    for (let j = -reach; j <= reach; j += 1) {
      const q = path.closed ? raw[(i + j + n) % n] : raw[Math.max(0, Math.min(n - 1, i + j))];
      if (q < m) m = q;
    }
    v[i] = m;
  }
  const decel = mu * skill * G * BRAKE_SHARE;
  // Twice round, so a loop's braking zone before the start line is found too.
  for (let pass = 0; pass < (path.closed ? 2 : 1); pass += 1) {
    for (let i = n - 1; i >= 0; i -= 1) {
      const next = path.closed ? v[(i + 1) % n] : v[Math.min(n - 1, i + 1)];
      v[i] = Math.min(v[i], Math.sqrt(next * next + 2 * decel * ds));
    }
  }
  return { v, ds, n, at: (s) => v[((Math.floor(s / ds) % n) + n) % n] };
}

/**
 * What a rival does with the pedals and the wheel this step.
 * @param {import('./driving.js').VehicleState} st
 * @param {import('./driving.js').Powertrain} pt
 * @param {ReturnType<import('./levels/roadNet.js').measuredPath>} path
 * @param {ReturnType<typeof speedProfile>} profile
 * @param {{s: number, offset?: number}} prog where along the line they are (updated), and how far left of it they drive
 * @param {number} [gripScale] of the surface under them
 */
export function aiDrive(st, pt, path, profile, prog, gripScale = 1) {
  const here = path.project(st.x, st.z, prog.s, 40);
  prog.s = here.s;
  const v = Math.max(0, st.vx);
  const ld = Math.min(LOOK_MAX, LOOK_BASE + v * LOOK_PER_MS);
  const t = path.at(prog.s + ld);
  const off = prog.offset ?? 0;
  // Aim a little to the left or right of the line, so two cars do not drive through each other.
  const tx = t.x + Math.cos(t.heading) * off;
  const tz = t.z - Math.sin(t.heading) * off;
  const h = st.heading;
  const dx = tx - st.x;
  const dz = tz - st.z;
  const fwd = dx * Math.sin(h) + dz * Math.cos(h);
  const lat = dx * Math.cos(h) - dz * Math.sin(h);
  const alpha = Math.atan2(lat, fwd);
  const delta = Math.atan((2 * pt.car.wheelbaseM * Math.sin(alpha)) / ld);
  const lock = lockFor(st, pt, gripScale);
  const steer = Math.max(-1, Math.min(1, -delta / Math.max(1e-3, lock)));
  // The speed to be doing, looking a car's length ahead so the braking starts on time.
  const want = profile.at(prog.s + 4 + v * 0.25) * Math.sqrt(gripScale);
  const err = want - v;
  const throttle = err > 0 ? Math.min(1, err / 3 + 0.25) : 0;
  const brake = err < -1 ? Math.min(1, (-err - 1) / 4) : 0;
  return { throttle, brake, steer };
}

/**
 * Counts laps of a closed path from a start line, and keeps the times. A lap only counts
 * if the car went all the way round (past each third of the lap in turn), so cutting
 * across the infield does not.
 * @param {ReturnType<import('./levels/roadNet.js').measuredPath>} path
 * @param {number} startS distance along the path of the start line
 */
export function makeLapCounter(path, startS) {
  const L = path.length;
  const c = {
    s: startS, rel: 0, lap: 0, sectors: 0, lapStart: /** @type {number|null} */ (null), laps: /** @type {number[]} */ ([]), raced: 0, best: Infinity, off: 0,
    /**
     * @param {number} x @param {number} z @param {number} t seconds since the race began
     * @param {number} [width] of the road, to tell when the car is off it
     * @returns {null|{lap: number, time: number}} a lap just finished
     */
    update(x, z, t, width = 13) {
      const p = path.project(x, z, c.s, 50);
      const rel = (((p.s - startS) % L) + L) % L;
      let d = rel - c.rel;
      if (d < -L / 2) d += L;
      if (d > L / 2) d -= L;
      c.s = p.s;
      c.rel = rel;
      c.raced += d;
      c.offNow = p.off > width / 2 + 1.5;
      if (c.sectors === 0 && rel > L / 3 && rel < (2 * L) / 3) c.sectors = 1;
      if (c.sectors === 1 && rel > (2 * L) / 3) c.sectors = 2;
      // Over the line going forwards.
      if (d > 0 && rel < d + 1e-6 && rel < 40) {
        const crossed = c.lapStart != null && c.sectors === 2;
        let done = null;
        if (crossed) {
          const time = t - /** @type {number} */ (c.lapStart);
          c.laps.push(time);
          c.best = Math.min(c.best, time);
          c.lap += 1;
          done = { lap: c.lap, time };
        }
        c.lapStart = t;
        c.sectors = 0;
        return done;
      }
      return null;
    },
    offNow: false,
  };
  return c;
}

/**
 * The quarter-mile clock for one car: reaction from the green, then elapsed time from the
 * moment the car leaves the line to the moment its nose crosses the finish, with the
 * 60-foot, eighth-mile and trap speed on the way.
 * @param {number} startX where the nose sits at the line
 * @param {number} finishX
 * @param {number} halfLen half the car's length: the nose is ahead of the middle
 */
export function makeDragClock(startX, finishX, halfLen) {
  const FT60 = 18.288;
  const EIGHTH = 201.168;
  const c = {
    green: /** @type {number|null} */ (null), left: /** @type {number|null} */ (null), rt: /** @type {number|null} */ (null),
    sixtyFootT: /** @type {number|null} */ (null), eighthET: /** @type {number|null} */ (null), et: /** @type {number|null} */ (null), trapMph: 0,
    foul: false, wheelspun: false, topGear: 1, done: false,
    /** @param {number} centreX @param {number} v @param {number} t @param {{gear?: number, wheelspin?: number}} [st] */
    update(centreX, v, t, st = {}) {
      const nose = centreX + halfLen;
      const moved = nose - startX;
      if (c.left == null && moved > 0.3) {
        c.left = t;
        if (c.green == null || t < c.green) c.foul = true;
        c.rt = c.green == null ? -1 : t - c.green;
      }
      if (c.left == null || c.done) return;
      const et = t - c.left;
      if ((st.wheelspin ?? 0) > 0.25 && moved < 30) c.wheelspun = true;
      c.topGear = Math.max(c.topGear, st.gear ?? 1);
      if (c.sixtyFootT == null && moved >= FT60) c.sixtyFootT = et;
      if (c.eighthET == null && moved >= EIGHTH) c.eighthET = et;
      if (nose >= finishX) { c.et = et; c.trapMph = toMph(v); c.done = true; }
    },
    /** Elapsed time from the green light: what decides the race. */
    total() { return c.et == null || c.rt == null ? Infinity : c.rt + c.et; },
  };
  return c;
}

/**
 * The driving-model inputs for a rival in a drag race: on the brake until their reaction is
 * up, then flat out, holding the lane. Lanes run east (heading pi/2), where a turn to the
 * left points the car north, toward smaller z.
 * @param {import('./driving.js').VehicleState} st @param {import('./driving.js').Powertrain} pt @param {number} laneZ @param {boolean} go
 */
export function dragDrive(st, pt, laneZ, go) {
  if (!go) return { throttle: 0, brake: 1, steer: 0 };
  // Drifted south (z too big) or yawed left of east: steer right is +1, left is -1.
  const drift = st.z - laneZ;
  const yaw = st.heading - Math.PI / 2;
  const want = Math.max(-0.04, Math.min(0.04, -drift * 0.02 - yaw * 0.6));
  const lock = lockFor(st, pt);
  return { throttle: 1, brake: 0, steer: Math.max(-1, Math.min(1, -want / Math.max(1e-3, lock))) };
}

export { tyreMu };
