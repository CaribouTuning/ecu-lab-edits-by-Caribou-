// @vitest-environment jsdom

/**
 * TUNE's "Start the tune" card: three ways in, the safe base map loaded as one undoable
 * write, the guide's steps, and the advice choice putting it away.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import * as S from '../../src/sim/index.js';
import { TuneStart } from '../../src/ui/components/TuneStart.jsx';
import { StoreProvider, useTune } from '../../src/ui/state/StoreProvider.jsx';
import { ACTIONS, reducer } from '../../src/ui/state/reducer.js';
import { clearTuneStart } from '../../src/ui/state/tuneStart.js';

afterEach(() => { cleanup(); clearTuneStart(); });

/** A VQ35DE with bolt-ons: a factory engine with its parts changed. */
const builtVq = (s) => {
  const p = reducer(s, { type: ACTIONS.APPLY_PRESET, preset: S.applyPreset(S.presetById('vq35de-revup')) });
  return reducer(p, { type: ACTIONS.SET_BUILD_FIELD, field: 'mods', value: { ...p.build.mods, intake: true, exhaust: true, headers: true } });
};

let seen = null;
function TimingProbe() { const [tune] = useTune(); seen = tune.timing; return null; }

describe('TuneStart', () => {
  it('offers three ways in, and the advice choice puts it away', () => {
    render(<StoreProvider init={builtVq}><TuneStart force onGo={() => {}} /></StoreProvider>);
    expect(screen.getByRole('heading', { name: 'Start the tune' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Load a safe base map/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Build it with the guide/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Tune from the advice/ }));
    expect(screen.queryByTestId('tune-start')).toBeNull();
    // Still there for later, on one line.
    expect(screen.getByTestId('tune-start-again')).toBeTruthy();
  });

  it('loads the safe base map and says how it ran', async () => {
    render(<StoreProvider init={builtVq}><TuneStart force onGo={() => {}} /><TimingProbe /></StoreProvider>);
    const before = seen;
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Load a safe base map/ })); });
    await waitFor(() => expect(screen.getByTestId('tune-start-result')).toBeTruthy(), { timeout: 60_000 });
    expect(screen.getByRole('heading', { name: 'Safe base map loaded' })).toBeTruthy();
    expect(seen).not.toEqual(before);
  }, 90_000);

  it('opens the guide on its steps, each with a way to its page', async () => {
    const went = [];
    render(<StoreProvider init={builtVq}><TuneStart force onGo={(id) => went.push(id)} /></StoreProvider>);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Build it with the guide/ })); });
    await waitFor(() => expect(screen.getByTestId('tune-start-guide')).toBeTruthy(), { timeout: 60_000 });
    expect(screen.getByText('Start the spark safe')).toBeTruthy();
    // The first step opens what still needs doing: the injectors, or (they match) the MAF scaling.
    fireEvent.click(screen.getAllByRole('button', { name: 'Open' })[0]);
    expect(['injectors', 'sensors']).toContain(went[0]);
  }, 90_000);

  it('is not offered for a stock engine', () => {
    const stock = (s) => reducer(s, { type: ACTIONS.APPLY_PRESET, preset: S.applyPreset(S.presetById('vq35de-revup')) });
    render(<StoreProvider init={stock}><TuneStart force onGo={() => {}} /></StoreProvider>);
    expect(screen.queryByTestId('tune-start')).toBeNull();
  });
});
