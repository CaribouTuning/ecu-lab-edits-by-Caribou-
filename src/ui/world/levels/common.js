/**
 * What every level shares: walls, floors, the way customers' cars are dressed, and the
 * little animation that drives a car along a path.
 */

import { world as W } from '../../tokens.js';
import { THREE, box, floorPlane, toon } from '../gfx.js';
import { engineBayOf, makeCar } from '../models/car.js';

/** A small stable hash of a string, 0..2^32. @param {string} s */
export function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Pick from a list by hash. @template T @param {T[]} xs @param {number} h @param {number} [salt] @returns {T} */
export const pickBy = (xs, h, salt = 0) => xs[(Math.imul(h ^ (salt * 2654435761), 2246822519) >>> 0) % xs.length];

const BODY_BY_NAME = [
  [/gti|golf|hatch|civic|focus|mini/i, 'hatch'],
  [/corvette|z06|c5|ls1|camaro|mustang|challenger|charger|hemi/i, 'muscle'],
  [/silverado|sierra|truck|f-?150|ram|vortec|tacoma/i, 'pickup'],
  [/wagon|touring|estate/i, 'wagon'],
  [/suv|tahoe|yukon|escalade|x5|4runner|blazer/i, 'suv'],
  [/cts|335i|135i|sedan|3\.5 v6 daily|b58|m340|m3|g80/i, 'sedan'],
  [/350z|370z|coupe|track|vq/i, 'coupe'],
];

/** The body a customer's car is drawn with: by what it is called, then the job's own say. @param {{customer: {car: string, body?: string}}} job */
export function bodyFor(job) {
  for (const [re, body] of BODY_BY_NAME) if (re.test(job.customer.car)) return body;
  return job.customer.body ?? 'coupe';
}

/**
 * The spec a customer's car is drawn from: its paint and body from the job, a stable
 * choice of wheels and trim from the job's id, and its engine bay from what is really
 * fitted.
 * @param {{id: string, customer: {car: string, color: string, body?: string}}} job
 * @param {object} build the store's build slice for that car
 */
export function specForJob(job, build) {
  const h = hash(job.id);
  const bay = engineBayOf(build);
  return {
    body: bodyFor(job),
    color: job.customer.color,
    wheels: pickBy(['alloy5', 'mesh', 'steel', 'deep', 'alloy5', 'race'], h, 1),
    wheelColor: pickBy(['chrome', 'black', 'silver', 'black'], h, 2),
    spoiler: bay.turbo || build?.mods?.exhaust ? pickBy(['lip', 'wing', 'none', 'lip'], h, 3) : pickBy(['none', 'none', 'lip'], h, 3),
    scoop: bay.turbo && h % 3 === 0,
    stripes: h % 7 === 0 ? 'white' : null,
    exhaust: build?.mods?.exhaust ? 'big' : pickBy(['single', 'dual'], h, 4),
    lowered: pickBy([0, 0.3, 0.6, 0], h, 5),
    plate: `${job.customer.name?.slice(0, 3).toUpperCase() ?? 'ECU'} ${String(h % 900 + 100)}`,
    engine: bay,
  };
}

/** @param {Parameters<typeof makeCar>[0]} spec */
export const carFor = (spec) => makeCar(spec);

/**
 * Drive a car model along a polyline at a speed. A point may say `rev: true`, meaning the
 * leg that starts there is driven in reverse (the car keeps its nose pointing the way it
 * was going and backs along the path). The car turns to follow, its wheels roll and steer.
 *
 * @param {ReturnType<typeof makeCar>} car
 * @param {{x: number, z: number, rev?: boolean}[]} pts
 * @param {number} speed m/s
 * @param {() => void} [done]
 */
export function pathFollower(car, pts, speed, done) {
  let seg = 0;
  let along = 0;
  const headingOf = (a, b) => (a.rev ? Math.atan2(a.x - b.x, a.z - b.z) : Math.atan2(b.x - a.x, b.z - a.z));
  let heading = headingOf(pts[0], pts[1]);
  car.group.position.set(pts[0].x, 0, pts[0].z);
  car.group.rotation.y = heading;
  return {
    finished: false,
    /** @param {number} dt */
    update(dt) {
      if (this.finished) return;
      let move = speed * dt;
      while (move > 0 && seg < pts.length - 1) {
        const a = pts[seg];
        const b = pts[seg + 1];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const step = Math.min(move, len - along);
        along += step;
        move -= step;
        if (along >= len - 1e-6) { seg += 1; along = 0; }
      }
      if (seg >= pts.length - 1) {
        this.finished = true;
        const end = pts[pts.length - 1];
        car.group.position.set(end.x, car.group.position.y, end.z);
        car.steer(0);
        done?.();
        return;
      }
      const a = pts[seg];
      const b = pts[seg + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const f = along / len;
      car.group.position.set(a.x + (b.x - a.x) * f, car.group.position.y, a.z + (b.z - a.z) * f);
      const want = headingOf(a, b);
      let d = want - heading;
      d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      heading += d * Math.min(1, dt * 5);
      car.group.rotation.y = heading;
      car.steer(Math.max(-0.5, Math.min(0.5, -d * 1.5)) * (a.rev ? -1 : 1));
      car.roll((a.rev ? -speed : speed) * dt);
    },
  };
}

/**
 * Walls: a run of wall along an axis, with colliders. Returns the mesh group and adds its
 * collider to `colliders`.
 */
export function wall(colliders, x, z, w, d, h, color, { collide = true, y = 0 } = {}) {
  const m = box(w, h, d, color, { x, y: y + h / 2, z });
  if (collide) colliders.push({ x, z, hw: w / 2, hd: d / 2 });
  return m;
}

/** A tiled floor of two alternating colours. */
export function tiledFloor(w, d, a, b, tile = 2) {
  const g = new THREE.Group();
  g.add(floorPlane(w, d, a, { y: 0 }));
  const nx = Math.ceil(w / tile);
  const nz = Math.ceil(d / tile);
  for (let i = 0; i < nx; i += 1) for (let j = 0; j < nz; j += 1) {
    if ((i + j) % 2 === 0) continue;
    const t = floorPlane(tile, tile, b, { x: -w / 2 + tile / 2 + i * tile, z: -d / 2 + tile / 2 + j * tile, y: 0.005 });
    g.add(t);
  }
  return g;
}

export { THREE, W, toon };
