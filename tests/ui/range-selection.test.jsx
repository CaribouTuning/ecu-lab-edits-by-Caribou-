// @vitest-environment jsdom

/**
 * Range selection, bulk ops and keyboard tuning on TUNE's grids (#105).
 *
 * Mounted through the real screens and store, because the property that matters most —
 * every bulk edit is exactly ONE undo step with a label saying what it did — lives in
 * the join between the dock, the reducer and the undo button.
 */

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { AirflowScreen } from '../../src/ui/screens/tune/AirflowScreen.jsx';
import { FuelScreen } from '../../src/ui/screens/tune/FuelScreen.jsx';
import { SparkScreen } from '../../src/ui/screens/tune/SparkScreen.jsx';
import { ACTIONS } from '../../src/ui/state/reducer.js';
import { StoreProvider, useHistory, useTune } from '../../src/ui/state/StoreProvider.jsx';

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
const hadResizeObserver = 'ResizeObserver' in window;
if (!hadResizeObserver) window.ResizeObserver = ResizeObserverStub;
// jsdom 25 has no PointerEvent, and without one `pointerType`, `shiftKey` and `buttons`
// never reach React. MouseEvent carries the last two; this adds the first.
class PointerEventStub extends MouseEvent {
  constructor(type, init = {}) { super(type, init); this.pointerType = init.pointerType ?? ''; }
}
const hadPointerEvent = 'PointerEvent' in window;
if (!hadPointerEvent) window.PointerEvent = PointerEventStub;
afterAll(() => {
  if (!hadResizeObserver) delete window.ResizeObserver;
  if (!hadPointerEvent) delete window.PointerEvent;
});
afterEach(cleanup);

/** Exposes the store so tests can read tables and the undo stack. */
let store;
function Spy() {
  const [tune, dispatch] = useTune();
  const [history] = useHistory();
  store = { tune, dispatch, history };
  return null;
}

const VE_ADVICE = { inSync: true, maxAbs: 0, recs: [], deltas: [] };
function mountAir() {
  return render(<StoreProvider><Spy /><AirflowScreen veAdvice={VE_ADVICE} veTruth={[[0]]} /></StoreProvider>);
}
const select = (value) => act(() => { store.dispatch({ type: ACTIONS.SET_TUNE_FIELD, field: 'selection', value }); });
const dock = () => screen.getByTestId('selection-dock');
const undoLabel = () => store.history.past.at(-1)?.label;

describe('SelectionDock on a range', () => {
  it('titles the range by its axes and cell count', () => {
    mountAir();
    select({ type: 'range', r1: 3, c1: 2, r2: 1, c2: 5 });
    // LOAD = [200,150,100,70,40,20], RPM = [800,...,7500]
    expect(within(dock()).getByText('Range · 2500–5500 RPM × 70–150 kPa · 12 cells')).toBeTruthy();
  });

  it('adds to every cell in one undo step, with a label', () => {
    mountAir();
    const before = store.tune.ve.map((r) => [...r]);
    select({ type: 'range', r1: 0, c1: 0, r2: 1, c2: 1 });
    fireEvent.click(within(dock()).getByRole('button', { name: '+5' }));
    expect(store.tune.ve[1][1]).toBe(Number((before[1][1] + 5).toFixed(2)));
    expect(store.tune.ve[2][2]).toBe(before[2][2]);
    expect(store.history.past).toHaveLength(1);
    expect(undoLabel()).toBe('VE edit · +5 · 4 cells');
  });

  it('scales by percent', () => {
    mountAir();
    const before = store.tune.ve.map((r) => [...r]);
    select({ type: 'row', row: 2 });
    fireEvent.click(within(dock()).getByRole('button', { name: 'SCALE' }));
    fireEvent.click(within(dock()).getByRole('button', { name: '+5%' }));
    expect(store.tune.ve[2][4]).toBe(Number(Math.min(before[2][4] * 1.05, 130).toFixed(2)));
    expect(undoLabel()).toBe('VE edit · scale +5% · 8 cells');
  });

  it('sets a typed value with Enter, and ignores an empty field', () => {
    mountAir();
    select({ type: 'range', r1: 0, c1: 0, r2: 0, c2: 2 });
    fireEvent.click(within(dock()).getByRole('button', { name: 'SET' }));
    const field = within(dock()).getByLabelText('Set value');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(store.history.past).toHaveLength(0);
    fireEvent.change(field, { target: { value: '77' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(store.tune.ve[0].slice(0, 3)).toEqual([77, 77, 77]);
    expect(undoLabel()).toBe('VE edit · set 77 · 3 cells');
  });

  it('interpolates and smooths, one undo step each', () => {
    mountAir();
    select({ type: 'range', r1: 0, c1: 0, r2: 2, c2: 3 });
    fireEvent.click(within(dock()).getByRole('button', { name: 'INTERPOLATE' }));
    fireEvent.click(within(dock()).getByRole('button', { name: 'SMOOTH' }));
    expect(store.history.past.map((e) => e.label)).toEqual([
      'VE edit · interpolate · 12 cells',
      'VE edit · smooth · 12 cells',
    ]);
  });

  it('hides INTERPOLATE and SMOOTH for a single cell', () => {
    mountAir();
    select({ type: 'cell', row: 1, col: 1 });
    expect(within(dock()).queryByRole('button', { name: 'SMOOTH' })).toBeNull();
    expect(within(dock()).queryByRole('button', { name: 'INTERPOLATE' })).toBeNull();
  });

  it('goes back to ADD after the dock closes', () => {
    mountAir();
    select({ type: 'row', row: 2 });
    fireEvent.click(within(dock()).getByRole('button', { name: 'SCALE' }));
    fireEvent.click(within(dock()).getByRole('button', { name: 'DONE' }));
    select({ type: 'row', row: 2 });
    expect(within(dock()).getByRole('button', { name: 'ADD' }).getAttribute('aria-pressed')).toBe('true');
  });
});
