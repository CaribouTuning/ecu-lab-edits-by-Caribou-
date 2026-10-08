// @vitest-environment jsdom

/**
 * LIVE's physics view (src/ui/screens/dash/PhysicsPanel.jsx): it opens and closes from
 * its own button, asks the live engine for the cylinder trace only while open, and shows
 * the simulator's own numbers for the step it is displaying.
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import * as S from '../../src/sim/index.js';
import { PhysicsPanel } from '../../src/ui/screens/dash/PhysicsPanel.jsx';
import { ACTIONS } from '../../src/ui/state/reducer.js';
import { StoreProvider, useSession } from '../../src/ui/state/StoreProvider.jsx';

afterEach(cleanup);

const STOCK = S.DEFAULT_ENGINE_CONFIG;
const cfgFor = (traceCycle) => ({
  ve: S.DEFAULT_VE, veTruth: S.DEFAULT_VE, timing: S.DEFAULT_TIMING, afr: S.DEFAULT_AFR,
  derived: S.deriveEngine(STOCK), fuel: S.OCTANE_OPTS[0], injectorCc: 315, ecuInjectorCc: 315,
  mods: { ...S.DEFAULT_MODS, turboFitted: false }, mafScalar: 1, mafErrorBase: 1, turboOn: false,
  boostCurve: S.DEFAULT_BOOST, octaneBonus: S.OCTANE_OPTS[0].bonus,
  turbine: S.TURBINE_OPTS[1], compressor: S.COMPRESSOR_OPTS[1], traceCycle,
});

function mount() {
  /** @type {any} */
  const ref = {};
  const Capture = () => {
    const [session, dispatch] = useSession();
    ref.session = session;
    ref.dispatch = dispatch;
    return null;
  };
  render(<StoreProvider><Capture /><PhysicsPanel /></StoreProvider>);
  return ref;
}

/** Runs the engine in the store the way EcuLab's 20 Hz loop does. */
function runEngine(ref, seconds, throttle) {
  act(() => {
    ref.dispatch({ type: ACTIONS.SET_SESSION_FIELD, field: 'live', value: { ...ref.session.live, cranking: true } });
  });
  for (let i = 0; i < Math.round(seconds / 0.05); i++) {
    act(() => {
      ref.dispatch({ type: ACTIONS.LIVE_STEP, dt: 0.05, input: { throttle, load: 0 }, cfg: cfgFor(!!ref.session.physicsOpen) });
    });
  }
}

describe('the physics view', () => {
  it('is closed until asked for, and the engine records no trace while it is', () => {
    const ref = mount();
    expect(screen.getByRole('button', { name: 'SHOW THE PHYSICS' })).toBeTruthy();
    runEngine(ref, 3, 30);
    expect(ref.session.live.physics).toBeUndefined();
  });

  it('opens, shows the simulator\'s own working for a running engine, and closes', () => {
    const ref = mount();
    fireEvent.click(screen.getByRole('button', { name: 'SHOW THE PHYSICS' }));
    expect(ref.session.physicsOpen).toBe(true);
    expect(screen.getByText(/Start the engine/)).toBeTruthy();
    runEngine(ref, 3, 50);
    expect(ref.session.live.physics.trace.length).toBeGreaterThan(100);
    // Every section, with this step's numbers from the simulator.
    for (const title of ['1 · Air into each cylinder', '2 · Fuel', '3 · Inside the cylinder', '4 · Knock check', '5 · Work and losses', '6 · The crankshaft']) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    expect(screen.getAllByRole('img').length).toBe(3); // pressure, burned fraction, knock integral
    // The view refreshes four times a second, so it shows a step from the last quarter
    // second rather than the very last one: check the working is there, with numbers.
    expect(document.body.textContent).toMatch(/\d+\.\d{2} ms · \d+ %/);
    expect(document.body.textContent).toMatch(/IMEP = ∮ p dV ÷ Vd\d+\.\d{2} bar/);
    expect(document.body.textContent).toMatch(/Peak \d+\.\d bar at -?\d+\.\d°/);
    fireEvent.click(screen.getByRole('button', { name: 'HIDE' }));
    expect(ref.session.physicsOpen).toBe(false);
    expect(screen.getByRole('button', { name: 'SHOW THE PHYSICS' })).toBeTruthy();
  });

  it('holds one instant still with FREEZE', () => {
    const ref = mount();
    fireEvent.click(screen.getByRole('button', { name: 'SHOW THE PHYSICS' }));
    runEngine(ref, 3, 50);
    fireEvent.click(screen.getByRole('button', { name: 'FREEZE' }));
    const before = document.querySelector('section')?.textContent;
    runEngine(ref, 1, 100);
    expect(document.querySelector('section')?.textContent).toBe(before);
    expect(screen.getByRole('button', { name: 'RESUME' })).toBeTruthy();
  });
});
