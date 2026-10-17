/**
 * Life in a level: pedestrians who wander between places, and traffic that drives a loop.
 * Both are scenery with a few simple rules; neither takes part in the economy.
 */

import { npcLook } from '../appearance.js';
import { makeCar } from '../models/car.js';
import { makePerson } from '../models/person.js';

import { hash, pathFollower, pickBy } from './common.js';

/** A seedable random in 0..1. @param {number} seed */
function rnd(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Pedestrians that stroll between random points inside rectangles, stopping now and then.
 *
 * @param {THREE.Group} root
 * @param {{minX: number, maxX: number, minZ: number, maxZ: number}[]} areas where they may walk
 * @param {number} count
 * @param {number} seed
 * @param {(x: number, z: number) => boolean} [blocked] a point they must not walk into
 */
export function makeWalkers(root, areas, count, seed, blocked = () => false) {
  const r = rnd(seed);
  const pick = () => {
    for (let i = 0; i < 12; i += 1) {
      const a = areas[Math.floor(r() * areas.length)];
      const x = a.minX + r() * (a.maxX - a.minX);
      const z = a.minZ + r() * (a.maxZ - a.minZ);
      if (!blocked(x, z)) return { x, z };
    }
    return { x: areas[0].minX, z: areas[0].minZ };
  };
  const walkers = [];
  for (let i = 0; i < count; i += 1) {
    const p = makePerson(npcLook(hash(`walker${seed}:${i}`)), { mood: 'smile' });
    const at = pick();
    p.group.position.set(at.x, 0, at.z);
    root.add(p.group);
    walkers.push({ p, target: pick(), wait: r() * 3, speed: 1.1 + r() * 0.7 });
  }
  return {
    walkers,
    /** @param {number} dt */
    update(dt) {
      for (const w of walkers) {
        const pos = w.p.group.position;
        if (w.wait > 0) { w.wait -= dt; w.p.update(dt, 0); continue; }
        const dx = w.target.x - pos.x;
        const dz = w.target.z - pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.4) { w.wait = 1 + r() * 5; w.target = pick(); w.p.update(dt, 0); continue; }
        pos.x += (dx / d) * w.speed * dt;
        pos.z += (dz / d) * w.speed * dt;
        const want = Math.atan2(dx, dz);
        let diff = want - w.p.group.rotation.y;
        diff = ((diff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        w.p.group.rotation.y += diff * Math.min(1, dt * 8);
        w.p.update(dt, w.speed);
      }
    },
  };
}

/** A rounded rectangle path for traffic to drive round, as points. */
export function loopPath(cx, cz, hw, hd, radius, ccw = true, segs = 6) {
  const pts = [];
  const corners = [
    { x: cx + hw - radius, z: cz + hd - radius, a0: 0 },
    { x: cx - hw + radius, z: cz + hd - radius, a0: Math.PI / 2 },
    { x: cx - hw + radius, z: cz - hd + radius, a0: Math.PI },
    { x: cx + hw - radius, z: cz - hd + radius, a0: (3 * Math.PI) / 2 },
  ];
  for (const c of corners) {
    for (let i = 0; i <= segs; i += 1) {
      const a = c.a0 + (i / segs) * (Math.PI / 2);
      pts.push({ x: c.x + Math.cos(a) * radius, z: c.z + Math.sin(a) * radius });
    }
  }
  return ccw ? pts : pts.reverse();
}

/**
 * Cars that drive a closed loop forever. `colliders` get one circle per car, kept on the car.
 *
 * @param {THREE.Group} root
 * @param {{x: number, z: number}[]} pts the loop
 * @param {number} count
 * @param {number} seed
 * @param {any[]} colliders
 */
export function makeTraffic(root, pts, count, seed, colliders) {
  const colors = ['red', 'blue', 'white', 'green', 'silver', 'yellow', 'teal', 'orange', 'black', 'pearl'];
  const bodies = ['sedan', 'hatch', 'wagon', 'suv', 'pickup', 'coupe', 'van'];
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const h = hash(`traffic${seed}:${i}`);
    const car = makeCar({ body: pickBy(bodies, h, 1), color: pickBy(colors, h, 2), wheels: pickBy(['steel', 'alloy5', 'mesh'], h, 3), plate: `TWN ${h % 900 + 100}`, engine: { layout: 'I4' } });
    root.add(car.group);
    const speed = 7 + (h % 5);
    // Start each car a different way round the loop.
    const start = Math.floor((i / count) * pts.length);
    const ordered = [...pts.slice(start), ...pts.slice(0, start), pts[start]];
    const hit = { x: 0, z: 0, r: 1.6 };
    colliders.push(hit);
    const c = { car, speed, ordered, follower: null, hit };
    const restart = () => { c.follower = pathFollower(car, c.ordered, speed, restart); };
    restart();
    cars.push(c);
  }
  return {
    cars,
    /** @param {number} dt */
    update(dt) {
      for (const c of cars) {
        c.follower.update(dt);
        c.car.update(dt);
        c.hit.x = c.car.group.position.x;
        c.hit.z = c.car.group.position.z;
      }
    },
  };
}
