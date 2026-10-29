/**
 * What a damaged engine gives off, as drawn: smoke, flying debris, the flash of a failure.
 *
 * Each is a small pool of meshes in its owner's own coordinates (the engine's), updated by
 * the owner's frame, so it rocks and turns with the engine and costs nothing when idle.
 * Nothing here decides how damaged anything is; the owner says what to emit, and where.
 */

import { world as W } from '../../tokens.js';
import { THREE } from '../gfx.js';

/**
 * Smoke: soft puffs that rise, swell and thin out. Blow-by from a worn engine, oil burning
 * on a hot manifold, the plume of a failure.
 * @param {number} [max] puffs alive at once
 */
export function makeSmoke(max = 40) {
  const group = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(1, 1);
  /** @type {{m: THREE.Mesh, mat: THREE.MeshBasicMaterial, age: number, life: number, v: THREE.Vector3, r0: number, r1: number, a: number}[]} */
  const puffs = [];
  for (let i = 0; i < max; i += 1) {
    const mat = new THREE.MeshBasicMaterial({ color: W.engine.smoke, transparent: true, opacity: 0, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
    m.visible = false;
    m.scale.setScalar(0.001);
    group.add(m);
    puffs.push({ m, mat, age: 1, life: 1, v: new THREE.Vector3(), r0: 0, r1: 0, a: 0 });
  }
  let next = 0;
  return {
    group,
    /**
     * @param {THREE.Vector3} at where, in the owner's coordinates
     * @param {{color?: string, size?: number, rise?: number, life?: number, opacity?: number, spread?: number}} [o]
     */
    emit(at, o = {}) {
      const p = puffs[next];
      next = (next + 1) % puffs.length;
      const spread = o.spread ?? 0.05;
      p.m.position.set(at.x + (Math.random() - 0.5) * spread, at.y, at.z + (Math.random() - 0.5) * spread);
      p.v.set((Math.random() - 0.5) * 0.08, o.rise ?? 0.35, (Math.random() - 0.5) * 0.08);
      p.r0 = (o.size ?? 0.06) * 0.5;
      p.r1 = (o.size ?? 0.06) * 2.6;
      p.life = (o.life ?? 2.2) * (0.8 + Math.random() * 0.4);
      p.age = 0;
      p.a = o.opacity ?? 0.5;
      p.mat.color.set(o.color ?? W.engine.smoke);
      p.m.visible = true;
    },
    /** @param {number} dt */
    update(dt) {
      for (const p of puffs) {
        if (p.age >= p.life) continue;
        p.age += dt;
        const t = Math.min(1, p.age / p.life);
        p.m.position.addScaledVector(p.v, dt);
        // Warm smoke slows as it rises and spreads.
        p.v.multiplyScalar(1 - 0.5 * dt);
        p.m.scale.setScalar(p.r0 + (p.r1 - p.r0) * Math.sqrt(t));
        p.mat.opacity = p.a * (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85);
        if (t >= 1) p.m.visible = false;
      }
    },
    /** Whether any puff is still in the air. */
    busy() { return puffs.some((p) => p.age < p.life); },
    clear() { for (const p of puffs) { p.age = p.life; p.m.visible = false; } },
  };
}

/**
 * Debris: pieces of the engine thrown out by a failure, falling, bouncing and coming to
 * rest on the floor where they land.
 */
export function makeDebris() {
  const group = new THREE.Group();
  /** @type {{m: THREE.Mesh, v: THREE.Vector3, spin: THREE.Vector3, rest: boolean}[]} */
  const bits = [];
  let floorY = 0;
  return {
    group,
    /**
     * Throws `n` pieces from a point, outward along `dir` and up.
     * @param {THREE.Vector3} at @param {THREE.Vector3} dir @param {number} n
     * @param {THREE.Material[]} mats what the pieces are made of
     * @param {number} floor the floor's height in the owner's coordinates
     */
    burst(at, dir, n, mats, floor) {
      floorY = floor;
      for (let i = 0; i < n; i += 1) {
        const s = 0.025 + Math.random() * 0.05;
        // Broken castings and bits of rod and piston: chunky, irregular, never cubes.
        const g = new THREE.DodecahedronGeometry(s, 0);
        g.scale(1 + Math.random() * 1.4, 0.5 + Math.random() * 0.6, 0.7 + Math.random());
        const m = new THREE.Mesh(g, mats[i % mats.length]);
        m.castShadow = true;
        m.position.copy(at);
        const v = dir.clone().normalize().multiplyScalar(1.2 + Math.random() * 2.2)
          .add(new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random() * 2.2, (Math.random() - 0.5) * 2));
        group.add(m);
        bits.push({ m, v, spin: new THREE.Vector3(Math.random() * 14, Math.random() * 14, Math.random() * 14), rest: false });
      }
    },
    /** @param {number} dt */
    update(dt) {
      for (const b of bits) {
        if (b.rest) continue;
        b.v.y -= 9.8 * dt;
        b.m.position.addScaledVector(b.v, dt);
        b.m.rotation.x += b.spin.x * dt; b.m.rotation.y += b.spin.y * dt; b.m.rotation.z += b.spin.z * dt;
        if (b.m.position.y < floorY + 0.01) {
          b.m.position.y = floorY + 0.01;
          // Steel on concrete: most of the energy goes in the first bounce.
          b.v.y = -b.v.y * 0.25;
          b.v.x *= 0.5; b.v.z *= 0.5;
          b.spin.multiplyScalar(0.4);
          if (Math.abs(b.v.y) < 0.25 && b.v.lengthSq() < 0.1) b.rest = true;
        }
      }
    },
    busy() { return bits.some((b) => !b.rest); },
    clear() {
      for (const b of bits) { b.m.geometry.dispose(); group.remove(b.m); }
      bits.length = 0;
    },
  };
}

/**
 * The flash of an engine letting go: a ball of light that swells and dies in a quarter of
 * a second, and the light it throws on everything round it.
 */
export function makeFlash() {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: W.engine.flash, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), mat);
  ball.visible = false;
  group.add(ball);
  const light = new THREE.PointLight(W.engine.flash, 0, 6, 2);
  group.add(light);
  let t = 1;
  return {
    group,
    /** @param {THREE.Vector3} at */
    fire(at) { ball.position.copy(at); light.position.copy(at); t = 0; ball.visible = true; },
    /** @param {number} dt */
    update(dt) {
      if (t >= 1) return;
      t = Math.min(1, t + dt / 0.35);
      ball.scale.setScalar(0.05 + 0.5 * Math.sqrt(t));
      mat.opacity = (1 - t) ** 1.5;
      light.intensity = 60 * (1 - t) ** 2;
      if (t >= 1) { ball.visible = false; light.intensity = 0; }
    },
    busy() { return t < 1; },
  };
}
