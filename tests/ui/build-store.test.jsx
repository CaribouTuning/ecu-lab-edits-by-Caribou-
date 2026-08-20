// @vitest-environment jsdom

/**
 * The two BUILD-slice fields that are cursors, not hardware.
 *
 * Thirteen of the fifteen fields in the build slice are hardware or ECU configuration:
 * a hand edit to any of them means the build is no longer the factory preset it was
 * loaded from, so `SET_BUILD_FIELD` clears `presetId` and the header stops naming that
 * preset. `boostSel` (which RPM column the boost editor has selected) and
 * `presetPrompt` (whether the overwrite-confirmation dialog is open) live in the same
 * slice but are NOT that — they are a cursor and a piece of dialog state. Routing
 * either through `SET_BUILD_FIELD` would make the header stop claiming the factory
 * preset because the player tapped an RPM column or opened a dialog.
 *
 * That is invisible to the characterisation tests, which never touch either control,
 * and it is invisible to the reducer tests, which prove SET_BOOST_SEL/SET_PRESET_PROMPT
 * preserve `presetId` but say nothing about which action EcuLab actually dispatches.
 * These tests close that gap: they drive the real controls and read the real header.
 */

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { ENGINE_PRESETS, applyPreset } from '../../src/sim/index.js';
import EcuLab, { EcuLabApp } from '../../src/ui/EcuLab.jsx';
import { StoreProvider, useBuild } from '../../src/ui/state/StoreProvider.jsx';
import { ACTIONS } from '../../src/ui/state/reducer.js';

afterEach(cleanup);

/**
 * The preset picker is the only select with optgroups.
 * @returns {HTMLSelectElement}
 */
function presetPicker() {
  return /** @type {HTMLSelectElement[]} */ (screen.getAllByRole('combobox'))
    .find((el) => el.querySelector('optgroup'));
}

/**
 * The header line is `${engineName} · ${turbo} · ${octane} oct · ...`, where
 * `engineName` is the loaded preset's name if one is loaded and a derived "3.0L I6"
 * form if not. Its leading segment is therefore exactly the thing `presetId` drives.
 * @returns {string}
 */
function headerEngineName() {
  return screen.getByText(/oct/).textContent.split('·')[0].trim();
}

/** Renders the app and clicks past the start screen. */
function launch() {
  const view = render(<EcuLab />);
  fireEvent.click(screen.getByRole('button', { name: 'START' }));
  return view;
}

/** Loads the first preset the picker offers and returns the header name it produced. */
function loadFirstPreset() {
  const picker = presetPicker();
  const target = [...picker.querySelectorAll('option')]
    .map((o) => o.value)
    .find((v) => v && v !== picker.value);
  fireEvent.change(picker, { target: { value: target } });
  return headerEngineName();
}

describe('moving the boost-curve cursor', () => {
  it('does not stop the header claiming the factory preset', () => {
    launch();
    const preset = loadFirstPreset();
    // Guard the setup rather than trusting it: if loading the preset silently failed,
    // presetId would be null before the click and the assertion below would pass for
    // the wrong reason.
    expect(preset).not.toMatch(/^\d\.\dL /);

    const columns = within(screen.getByTestId('boost-columns')).getAllByRole('button');
    // The selected RPM appears in the editor's readout under the bars. Reading it
    // before and after proves the click actually MOVED the cursor — without that, a
    // click that hit nothing would leave the header intact and the test would pass
    // while proving nothing.
    const selectedRpm = () => screen.getByText(/^\d+ RPM$/).textContent;
    const before = selectedRpm();
    const moved = columns.some((col) => {
      fireEvent.click(col);
      return selectedRpm() !== before;
    });
    expect(moved).toBe(true);

    expect(headerEngineName()).toBe(preset);
  });
});

/**
 * A probe that hands the store's dispatch back to the test, so it can put the build
 * into a state the UI's own guards cannot reach (see below).
 * @param {{onReady: (dispatch: React.Dispatch<*>) => void}} props
 * @returns {null}
 */
function DispatchProbe({ onReady }) {
  const [, dispatch] = useBuild();
  onReady(dispatch);
  return null;
}

describe('opening and dismissing the overwrite prompt', () => {
  it('does not stop the header claiming the factory preset', () => {
    // `presetId` set AND unsaved calibration work pending is unreachable through the
    // UI alone: every path that flags `tablesDirty` also clears `presetId`, so the
    // prompt only ever opens on a build the header already shows as custom. The
    // combination is still worth pinning — it is one guard away from reachable, and
    // it is the state in which routing `presetPrompt` through SET_BUILD_FIELD does
    // visible damage. So mount the app body inside a store this test owns, and seed
    // that half of the state directly.
    /** @type {React.Dispatch<*>} */
    let dispatch;
    render(
      <StoreProvider>
        <DispatchProbe onReady={(d) => { dispatch = d; }} />
        <EcuLabApp />
      </StoreProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'START' }));

    // Hand-edit a calibration table: this is what sets `tablesDirty`, which is what
    // makes choosePreset offer the prompt instead of loading straight away.
    fireEvent.click(screen.getByRole('button', { name: /TUNE/ }));
    const grid = within(screen.getByTestId('tuning-grid'));
    const cells = grid.getAllByRole('button').filter((b) => /^-?\d+(\.\d+)?$/.test(b.textContent));
    fireEvent.click(cells[Math.floor(cells.length / 2)]);
    fireEvent.click(within(screen.getByTestId('selection-dock')).getByRole('button', { name: '+1' }));
    fireEvent.click(screen.getByRole('button', { name: /BUILD/ }));

    // Now put a preset label back on the build without touching `tablesDirty`, which
    // is still EcuLab's own useState until Task 5.
    const seed = ENGINE_PRESETS[0];
    act(() => dispatch({ type: ACTIONS.APPLY_PRESET, preset: applyPreset(seed) }));
    expect(headerEngineName()).toBe(seed.name);

    // Choosing a different preset with work pending opens the prompt rather than
    // loading. The prompt is dialog state, not a hardware edit: the build has not
    // changed, so the header must still name the preset it is running.
    const picker = presetPicker();
    const other = [...picker.querySelectorAll('option')]
      .map((o) => o.value)
      .find((v) => v && v !== seed.id && v !== '__custom__');
    fireEvent.change(picker, { target: { value: other } });
    expect(screen.getByRole('button', { name: /^LOAD / })).toBeTruthy();
    expect(headerEngineName()).toBe(seed.name);

    // Backing out of the prompt is not a hardware edit either.
    fireEvent.click(screen.getByRole('button', { name: 'CANCEL' }));
    expect(screen.queryByRole('button', { name: /^LOAD / })).toBeNull();
    expect(headerEngineName()).toBe(seed.name);
  });
});
