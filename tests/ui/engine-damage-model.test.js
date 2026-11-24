/**
 * The engine model draws each failure the simulator can produce, by what failed, and
 * throws away what it drew for the last condition.
 */

import { describe, expect, it } from 'vitest';

import { makeEngine } from '../../src/ui/world/models/engine.js';

const NEW = { piston: 100, bearing: 100, valve: 100 };

/** Meshes in the model, counted. @param {any} group */
const meshes = (group) => { let n = 0; group.traverse((o) => { if (o.isMesh) n += 1; }); return n; };

describe('engine damage as drawn', () => {
  it.each(/** @type {('piston'|'bearing'|'valve')[]} */ (['piston', 'bearing', 'valve']))('draws a failed %s, and a rebuilt engine clean again', (part) => {
    const e = makeEngine({ layout: 'V6' });
    const clean = meshes(e.group);
    e.setDamage({ ...NEW, [part]: 0, failed: part }, 0);
    expect(meshes(e.group)).toBeGreaterThan(clean);
    e.setDamage(null, 0);
    expect(meshes(e.group)).toBe(clean);
  });

  it('disposes the materials it made for a drawing when the next one replaces it', () => {
    const e = makeEngine({ layout: 'I4' });
    const made = [];
    e.setDamage({ ...NEW, valve: 0, failed: 'valve' }, 0);
    e.group.traverse((o) => { if (o.isMesh && o.material.userData.own) made.push(o.material); });
    expect(made.length).toBeGreaterThan(0);
    let disposed = 0;
    for (const m of made) m.addEventListener('dispose', () => { disposed += 1; });
    e.setDamage(NEW, 0);
    expect(disposed).toBe(made.length);
  });
});
