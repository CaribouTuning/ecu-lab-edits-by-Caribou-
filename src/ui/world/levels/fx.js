/**
 * Small effects: tyre smoke. A pool of soft puffs that rise, swell and fade.
 */

import { world as W } from '../../tokens.js';
import { THREE } from '../gfx.js';

/** @param {THREE.Group} root @param {number} [size] */
export function makeSmoke(root, size = 36) {
  const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  const puffs = [];
  for (let i = 0; i < size; i += 1) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: W.white, transparent: true, opacity: 0, depthWrite: false }));
    m.visible = false;
    root.add(m);
    puffs.push({ m, age: 1, life: 1, vx: 0, vz: 0 });
  }
  let next = 0;
  return {
    /** One puff at a world position. @param {number} x @param {number} z @param {number} [strength] */
    emit(x, z, strength = 1) {
      const p = puffs[next];
      next = (next + 1) % puffs.length;
      p.age = 0;
      p.life = 0.7 + Math.random() * 0.5;
      p.vx = (Math.random() - 0.5) * 1.2;
      p.vz = (Math.random() - 0.5) * 1.2;
      p.m.position.set(x + (Math.random() - 0.5) * 0.6, 0.25, z + (Math.random() - 0.5) * 0.6);
      p.m.scale.setScalar(0.3 + 0.2 * strength);
      p.m.rotation.y = Math.random() * 3;
      p.m.visible = true;
    },
    /** @param {number} dt */
    update(dt) {
      for (const p of puffs) {
        if (p.age >= p.life) { p.m.visible = false; continue; }
        p.age += dt;
        const f = p.age / p.life;
        p.m.position.x += p.vx * dt;
        p.m.position.z += p.vz * dt;
        p.m.position.y += dt * 1.1;
        p.m.scale.multiplyScalar(1 + dt * 1.1);
        /** @type {THREE.MeshBasicMaterial} */ (p.m.material).opacity = 0.55 * (1 - f);
      }
    },
  };
}
