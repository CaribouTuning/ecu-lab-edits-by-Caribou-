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

import {
  DEFAULT_ENGINE_CONFIG, DEFAULT_MODS, ENGINE_PRESETS, OCTANE_OPTS, TURBINE_OPTS,
  applyPreset, computeHardwareVE, turbineWithCount,
} from '../../src/sim/index.js';
import EcuLab, { EcuLabApp } from '../../src/ui/EcuLab.jsx';
import { StoreProvider, useBuild, useTune } from '../../src/ui/state/StoreProvider.jsx';
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
  // In an effect, not in render: a render-phase callback fires on every render and
  // twice under StrictMode.
  React.useEffect(() => { onReady(dispatch); }, [onReady, dispatch]);
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

    // Now put a preset label back on the build. APPLY_PRESET also clears the store's
    // `tune.tablesDirty` (it moved into the store in Task 5, along with the rest of the
    // tune slice) — a fresh factory calibration is not unsaved player work. That is
    // correct behaviour, but it undoes this test's setup: the hand edit above no longer
    // leaves any unsaved work behind once a preset is loaded on top of it. So re-flag
    // `tablesDirty` directly afterwards, via the one action built for exactly this seam:
    // `SET_TUNE_FIELD` deliberately does NOT clear `presetId` (unlike SET_TABLE), so it
    // can put the store back into "preset loaded, unsaved work pending" — the combination
    // this test exists to pin — without going through another hand edit that would just
    // clear the preset label again.
    const seed = ENGINE_PRESETS[0];
    act(() => dispatch({ type: ACTIONS.APPLY_PRESET, preset: applyPreset(seed) }));
    act(() => dispatch({ type: ACTIONS.SET_TUNE_FIELD, field: 'tablesDirty', value: true }));
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


/**
 * ToggleRow renders its switch as an unlabelled button beside the label text, so it
 * has to be reached through the row rather than by name.
 * @param {string} label
 * @returns {HTMLButtonElement}
 */
function toggleFor(label) {
  return screen.getByText(label).parentElement.parentElement.querySelector('button');
}

/**
 * Reports the store's `tune` slice to the test on every change.
 * @param {{onTune: (tune: *) => void}} props
 * @returns {null}
 */
function TuneProbe({ onTune }) {
  const [tune] = useTune();
  React.useEffect(() => { onTune(tune); }, [onTune, tune]);
  return null;
}

describe('choosing a turbine', () => {
  it('drops the twin-turbo count the preset installed', () => {
    // SET_TURBINE resets `turbineCount` to 1 as well as setting `turbineIdx`, because
    // the count belongs to the preset's induction layout, not to the housing you just
    // picked. Route this control through SET_BUILD_FIELD and the count survives: a
    // twin count against a turbine chosen as a single, silently doubling the airflow
    // the sim is handed. Nothing else in the suite covers that.
    launch();
    const picker = presetPicker();
    const twin = ENGINE_PRESETS.find((p) => applyPreset(p).turbineCount > 1);
    expect(twin).toBeTruthy();
    fireEvent.change(picker, { target: { value: twin.id } });

    // The Forced Induction summary is where the count is legible: it reads "Twin
    // <housing> turbine" above 1 and the bare housing name at 1.
    const inductionSummary = () => screen.getByText(/turbine · peak/).textContent;
    expect(inductionSummary()).toMatch(/Twin/);

    fireEvent.click(screen.getByText('Forced Induction'));
    const current = TURBINE_OPTS[applyPreset(twin).turbineIdx].label;
    const other = TURBINE_OPTS.map((o) => o.label).find((l) => l !== current);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${other}`) }));

    expect(inductionSummary()).not.toMatch(/Twin/);
  });
});

describe('resetting the calibration to stock', () => {
  /**
   * Runs the app to a reset and reports the VE table the store received.
   * @param {boolean} withIntake whether to fit the intake first
   * @returns {number[][]}
   */
  function veAfterReset(withIntake) {
    /** @type {*} */
    let tune;
    render(
      <StoreProvider>
        <TuneProbe onTune={(t) => { tune = t; }} />
        <EcuLabApp />
      </StoreProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'START' }));
    // Turbo on in BOTH runs, so the hardware half of the VE calculation is identical
    // and the only difference between them is the mod set.
    fireEvent.click(screen.getByText('Forced Induction'));
    fireEvent.click(toggleFor('Turbo kit'));
    if (withIntake) {
      fireEvent.click(screen.getByText('Bolt-On Parts'));
      fireEvent.click(screen.getByRole('button', { name: /Intake/ }));
    }
    fireEvent.click(screen.getByRole('button', { name: /RESET ALL TO STOCK/ }));
    cleanup();
    return tune.ve;
  }

  it('rebuilds the VE table from STOCK mods, not the ones still bolted on', () => {
    // resetToStock passes computeHardwareVE(engineConfig, DEFAULT_MODS, hwForVe) —
    // DEFAULT_MODS for the mods argument, but the CURRENT hwForVe for hardware.
    // Wiping a calibration is not un-installing the turbo, and it is not un-bolting
    // the intake either: reset means "give me the stock BASELINE for this hardware",
    // so the table must come out the same whether or not parts are fitted.
    //
    // Change that DEFAULT_MODS to `mods` and the player gets a table calibrated for
    // bolt-ons the reset just told them it had discarded. The whole suite passes.
    expect(veAfterReset(true)).toEqual(veAfterReset(false));
  });

  it('can tell the two apart — the mods argument changes the table', () => {
    // Guards the test above. If mods made no difference to computeHardwareVE, the
    // equality assertion would hold no matter which argument the call site passed,
    // and would be proving nothing at all.
    const hw = {
      turboOn: true,
      turbine: turbineWithCount(TURBINE_OPTS[1], 1),
      exhaustDia: 3.0,
      fuel: OCTANE_OPTS[0],
      peakBoostPsi: 8,
    };
    const stock = computeHardwareVE(DEFAULT_ENGINE_CONFIG, DEFAULT_MODS, hw);
    const modded = computeHardwareVE(DEFAULT_ENGINE_CONFIG, { ...DEFAULT_MODS, intake: true }, hw);
    expect(modded).not.toEqual(stock);
  });
});
