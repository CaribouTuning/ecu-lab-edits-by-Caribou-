/**
 * Every car has its own cabin: each dealer model and the starter car is matched by name to
 * a cabin of its own, every cabin's palette is in the tokens, and an unknown car still gets
 * one by its body.
 */

import { describe, expect, it } from 'vitest';

import { MODELS, STARTER } from '../src/ui/career/ownedCars.js';
import { world as W } from '../src/ui/tokens.js';
import { CABINS, cabinFor } from '../src/ui/world/models/cabins.js';

describe('car cabins', () => {
  it('gives every dealer model and the starter car a cabin of its own', () => {
    const named = [...MODELS.map((m) => ({ name: `${m.years[0]} ${m.name}`, body: m.body })), { name: STARTER.name, body: STARTER.body }];
    const ids = named.map((c) => cabinFor(c.name, c.body).id);
    expect(new Set(ids).size).toBe(named.length);
  });

  it('knows the revised coupe by its year, and a customer car by what it is called', () => {
    expect(cabinFor('2006 Nissan 350Z', 'coupe').id).toBe('z33');
    expect(cabinFor('2008 Nissan 350Z', 'coupe').id).toBe('z33hr');
    expect(cabinFor('3.5 V6 project car', 'coupe').id).toBe('coupe99');
    expect(cabinFor('2008 Something Else', 'sedan').id).toBe('economy');
  });

  it('falls back to the body, and every cabin has its colours', () => {
    for (const body of ['hatch', 'sedan', 'wagon', 'van', 'kei', 'coupe', 'roadster', 'muscle', 'supercar', 'suv', 'pickup']) expect(cabinFor('', body)).toBeTruthy();
    for (const c of Object.values(CABINS)) expect(W.interiors[c.palette], c.id).toBeTruthy();
  });
});
