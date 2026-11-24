// @vitest-environment jsdom

/**
 * The Physics page's engine condition: each part's effect is the damage model's own number,
 * and the wear a point costs comes from the same rates the dyno charges.
 */

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { COEFF } from '../../src/sim/index.js';
import { EngineCondition } from '../../src/ui/desk/EngineCondition.jsx';

afterEach(cleanup);

const DERIVED = { cyl: 6, bearingFreeBar: 60, bearingWearMult: 1 };
const CLEAN = { rpm: 4500, knock: false, knockPull: 0, knockUnheard: 0, peakPressure: 60, afr: 12.5, lambda: 0.85 };

describe('EngineCondition', () => {
  it('a new engine leaks nothing past its rings, keeps all its oil pressure and wears nothing on a clean point', () => {
    render(<EngineCondition health={{ piston: 100, bearing: 100, valve: 100 }} point={CLEAN} pointsPerPull={61} derived={DERIVED} />);
    expect(screen.getByRole('region', { name: /Pistons and rings, 100%/ }).textContent).toMatch(/0\.00%/);
    expect(screen.getByRole('region', { name: /Rod and main bearings/ }).textContent).toMatch(/makes 100% of its pressure/);
    expect(screen.getAllByText('no wear')).toHaveLength(3);
  });

  it('worn parts do what the model says: blow-by, lost oil pressure, a dead cylinder', () => {
    render(<EngineCondition health={{ piston: 50, bearing: 0.01, valve: 10 }} point={CLEAN} pointsPerPull={61} derived={DERIVED} />);
    // Half-worn rings leak half the 1% maximum.
    expect(screen.getByRole('region', { name: /Pistons and rings/ }).textContent).toMatch(/0\.50%/);
    // Worn to the limit, the oil system leaks 3.5 times as freely: under a third of the pressure.
    expect(screen.getByRole('region', { name: /Rod and main bearings/ }).textContent).toMatch(/makes 29% of its pressure/);
    expect(screen.getByRole('region', { name: /Exhaust valves/ }).textContent).toMatch(/stopped firing/);
  });

  it('knock at the point costs the pistons what a dyno pull charges for it, and says why', () => {
    const knocking = { ...CLEAN, knock: true, knockPull: 4, knockFalse: 0 };
    render(<EngineCondition health={{ piston: 100, bearing: 100, valve: 100 }} point={knocking} pointsPerPull={61} derived={DERIVED} />);
    const pistons = screen.getByRole('region', { name: /Pistons and rings/ }).textContent;
    expect(pistons).toMatch(new RegExp(`−${(4 * COEFF.WEAR_KNOCK * 61).toFixed(2)}% of its life`));
    expect(pistons).toMatch(/the ECU pulled 4\.0°/);
  });

  it('names the failure when a part has run out of life', () => {
    render(<EngineCondition health={{ piston: 0, bearing: 80, valve: 80 }} point={CLEAN} pointsPerPull={61} derived={DERIVED} />);
    expect(screen.getByText('Holed piston.')).toBeTruthy();
  });
});
