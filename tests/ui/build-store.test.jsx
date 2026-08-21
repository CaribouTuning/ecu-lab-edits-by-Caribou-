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

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_ENGINE_CONFIG, DEFAULT_MODS, ENGINE_PRESETS, OCTANE_OPTS, TURBINE_OPTS,
  applyPreset, computeHardwareVE, turbineWithCount,
} from '../../src/sim/index.js';
import { LOAD, RPM } from '../../src/sim/tables.js';
import EcuLab, { EcuLabApp } from '../../src/ui/EcuLab.jsx';
import { Bar } from '../../src/ui/primitives/Bar.jsx';
import { StoreProvider, useBuild, useTune } from '../../src/ui/state/StoreProvider.jsx';
import { ACTIONS } from '../../src/ui/state/reducer.js';

// jsdom has no ResizeObserver. recharts' <ResponsiveContainer> (used on the DYNO
// results panel) needs one to mount at all, so any test that reaches a rendered
// dyno result throws an uncaught ReferenceError from inside react-dom's commit
// phase without this stub. Same approach as characterisation.test.jsx.
// observe/unobserve/disconnect are no-ops: the tests below never depend on a
// resize callback firing, only on the chart mounting.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
const hadResizeObserver = 'ResizeObserver' in window;
if (!hadResizeObserver) window.ResizeObserver = ResizeObserverStub;
afterAll(() => {
  if (!hadResizeObserver) delete window.ResizeObserver;
});

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

describe('moving the tune-grid cursor', () => {
  it('does not stop the header claiming the factory preset', () => {
    // The twin of the boost-cursor test above: `setSelection` on the TUNE grid
    // dispatches SET_TUNE_FIELD (a cursor move), not SET_TABLE (a calibration edit
    // that clears presetId and flags tablesDirty). Selecting a grid cell must not
    // disown a loaded preset or trip the overwrite-confirmation prompt.
    launch();
    const preset = loadFirstPreset();
    // Guard the setup rather than trusting it: if loading the preset silently failed,
    // presetId would be null before the click and the assertion below would pass for
    // the wrong reason.
    expect(preset).not.toMatch(/^\d\.\dL /);

    fireEvent.click(screen.getByRole('button', { name: /TUNE/ }));
    const grid = within(screen.getByTestId('tuning-grid'));
    // TuningGrid renders, in DOM order: RPM.length column-header buttons (each
    // itself a numeric label, so a text-pattern filter can't tell them apart from
    // data cells), then one row per LOAD entry — a numeric row-header button
    // followed by RPM.length data-cell buttons. Slicing by that known layout is
    // what actually isolates the data cells; text content alone can collide (a VE
    // cell can legitimately read "100", same as a LOAD header).
    const allButtons = grid.getAllByRole('button');
    const dataCells = [];
    let idx = RPM.length;
    for (let row = 0; row < LOAD.length; row += 1) {
      idx += 1; // row-header button
      for (let col = 0; col < RPM.length; col += 1) { dataCells.push(allButtons[idx]); idx += 1; }
    }

    // Selecting a grid cell mounts the SelectionDock, whose readout line names the
    // selected cell's coordinates: "<rpm> RPM · <map> kPa MAP". Reading it after two
    // DIFFERENT cell clicks and confirming it changed proves the clicks actually
    // MOVED the cursor — without that, a click that hit nothing (or landed on the
    // same cell twice) would leave the header intact and the test would pass while
    // proving nothing.
    const cellLabel = () => within(screen.getByTestId('selection-dock'))
      .getByText(/^\d+ RPM · \d+ kPa MAP$/).textContent;

    fireEvent.click(dataCells[0]);
    const first = cellLabel();
    fireEvent.click(dataCells[dataCells.length - 1]);
    const second = cellLabel();
    expect(second).not.toBe(first);

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

describe('accepting a re-logged VE table', () => {
  it('rewrites the VE table on ACCEPT RE-LOGGED VALUES', () => {
    // recalcVE (EcuLab.jsx:663) is the ACCEPT RE-LOGGED VALUES button's dispatch.
    // Stub it out and the button silently does nothing — the player is told their
    // hardware and calibration are out of sync and handed a button that claims to
    // fix it, and nothing happens.
    /** @type {*} */
    let tune;
    render(
      <StoreProvider>
        <TuneProbe onTune={(t) => { tune = t; }} />
        <EcuLabApp />
      </StoreProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'START' }));

    // Drift the hardware away from the stock VE table the store starts with, so
    // veAdvice.inSync goes false and the ACCEPT button actually renders.
    fireEvent.click(screen.getByText('Forced Induction'));
    fireEvent.click(toggleFor('Turbo kit'));
    fireEvent.click(screen.getByText('Bolt-On Parts'));
    fireEvent.click(screen.getByRole('button', { name: /Intake/ }));

    fireEvent.click(screen.getByRole('button', { name: /TUNE/ }));

    // Guard: the button only renders when the advisor actually sees a gap. If the
    // toggles above hadn't moved computeHardwareVE, this query would throw instead
    // of silently finding nothing, and the assertion below could never run for the
    // right reason.
    const acceptBtn = screen.getByRole('button', { name: 'ACCEPT RE-LOGGED VALUES' });
    const veBefore = tune.ve;

    fireEvent.click(acceptBtn);

    expect(tune.ve).not.toEqual(veBefore);
  });
});

describe('applying a fuel-trim histogram', () => {
  it('rewrites the VE table on APPLY CORRECTIONS TO VE', async () => {
    // applyHistogram (EcuLab.jsx:990) is the APPLY CORRECTIONS TO VE button's
    // dispatch. tests/regressions.test.js re-implements the histogram math directly
    // and never touches this button, so it LOOKS like coverage of this path and is
    // not. This drives the real control instead: fit hardware the stock VE table
    // doesn't match, run a dyno pull (the ECU fuels from the stale table while the
    // engine actually breathes the true one, so the pull logs a real mismatch),
    // build a histogram from it, and apply it.
    /** @type {*} */
    let tune;
    render(
      <StoreProvider>
        <TuneProbe onTune={(t) => { tune = t; }} />
        <EcuLabApp />
      </StoreProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'START' }));

    fireEvent.click(screen.getByText('Forced Induction'));
    fireEvent.click(toggleFor('Turbo kit'));
    fireEvent.click(screen.getByText('Bolt-On Parts'));
    fireEvent.click(screen.getByRole('button', { name: /Intake/ }));

    fireEvent.click(screen.getByRole('button', { name: /DYNO/ }));
    fireEvent.click(screen.getByRole('button', { name: 'RUN DYNO PULL' }));
    // The reveal is a setInterval that ends by setting running false, which is what
    // uncovers the CURVES/PULL LOG/DATALOG/SCORE sub-tabs. Real timers + waitFor,
    // same approach as characterisation.test.jsx's dyno-pull test.
    await waitFor(
      () => expect(screen.getByRole('button', { name: 'RUN DYNO PULL' })).toBeTruthy(),
      { timeout: 10000 },
    );

    fireEvent.click(screen.getByRole('button', { name: 'DATALOG' }));
    fireEvent.click(screen.getByRole('button', { name: 'BUILD HISTOGRAM FROM THIS PULL' }));

    // Guard: BUILD HISTOGRAM swaps its own button for an APPLY/DISCARD pair only once
    // `histogram` is actually set. If that click's handler were missing, this query
    // would throw instead of silently finding nothing.
    const applyBtn = screen.getByRole('button', { name: 'APPLY CORRECTIONS TO VE' });
    const veBefore = tune.ve;

    fireEvent.click(applyBtn);

    expect(tune.ve).not.toEqual(veBefore);
  });
});

describe('choosing Custom build from the preset picker', () => {
  it('stops the header claiming the preset', () => {
    // clearPresetId (EcuLab.jsx:600) is CLEAR_PRESET_ID's only call site, reached by
    // choosing "Custom build" from the preset picker. The reducer case is tested;
    // this call site was not — stub the dispatch and choosing "Custom build" leaves
    // the header still naming the preset the player just disowned.
    launch();
    const preset = loadFirstPreset();
    expect(preset).not.toMatch(/^\d\.\dL /);

    fireEvent.change(presetPicker(), { target: { value: '__custom__' } });

    expect(headerEngineName()).toMatch(/^\d\.\dL /);
  });
});

describe('the injector-duty preview call site', () => {
  it('paints the Duty bar as dangerous, not healthy, once duty cycle has no headroom left', () => {
    // TUNE/readouts.test.jsx's describe('Bar') proves the PRIMITIVE inverts colour
    // correctly given higherIsBetter={false} — it renders Bar in isolation. It says
    // nothing about whether EcuLab's own INJECTOR DUTY PREVIEW call site (ECU Fuel
    // System, EcuLab.jsx ~1924) actually PASSES that prop. A reviewer flipped it to
    // higherIsBetter={true} — 95% duty, an injector out of headroom and about to lean
    // the mixture out, painted bright green — and all existing tests, including the
    // Bar unit tests, stayed green. This drives the real app to a build that reaches
    // a genuinely dangerous duty cycle and reads the colour off the rendered bar.
    launch();

    // dutyPreview (EcuLab.jsx:639) is computed at WOT @ 6500 RPM. It scales inversely
    // with ecuInjectorCc (a fresh build already starts at 315cc, the smallest on the
    // menu, so no edit is needed there) and rises with airflow — so fit a turbo and
    // dial the boost target at 6500 RPM to its maximum.
    fireEvent.click(screen.getByRole('button', { name: /BUILD/ }));
    fireEvent.click(screen.getByText('Forced Induction'));
    fireEvent.click(toggleFor('Turbo kit'));

    const columns = within(screen.getByTestId('boost-columns')).getAllByRole('button');
    fireEvent.click(columns[RPM.indexOf(6500)]);
    // Every collapsed BuildSection stays mounted (its content is hidden with
    // max-height, not unmounted — see BuildSection in EcuLab.jsx), so the Engine
    // Architecture section's five sliders are still in the DOM here alongside the
    // boost slider. max=25 is unique to the boost-curve range input.
    const slider = screen.getAllByRole('slider').find((s) => s.getAttribute('max') === '25');
    fireEvent.change(slider, { target: { value: '25' } });

    // The true VE the boosted hardware breathes is not what the ECU's calibration
    // table believes until the player accepts it — RESET ALL TO STOCK rebuilds the VE
    // table from the CURRENT hardware (hwForVe, which reads turboOn and boostCurve),
    // which is what lets dutyPreview's own VE lookup see the boosted cylinder filling
    // instead of the naturally-aspirated baseline it started on.
    fireEvent.click(screen.getByRole('button', { name: /RESET ALL TO STOCK/ }));

    fireEvent.click(screen.getByRole('button', { name: /TUNE/ }));
    fireEvent.click(screen.getByRole('button', { name: 'ECU' }));

    const meter = screen.getByRole('meter', { name: 'Duty' });
    const dutyValue = Number(meter.getAttribute('aria-valuenow'));
    // Guard the setup rather than trusting it: utilisationColor's danger band is
    // strictly above 90. If the boost/injector combination above did not actually
    // push duty past that line, the colour assertion below could pass or fail for
    // the wrong reason.
    expect(dutyValue).toBeGreaterThan(90);

    // Compare against a Bar known to render dangerous, the same way
    // readouts.test.jsx's own describe('Bar') tests do, rather than a hardcoded
    // colour literal: jsdom normalizes an inline `background` to `rgb(...)`, so a
    // hex literal copied out of theme.js would never string-match what the DOM
    // actually holds.
    const dangerRef = render(<Bar label="Reference" value={20} max={100} />);
    const fill = /** @type {HTMLElement} */ (meter.querySelector('[data-fill]'));
    const refFill = /** @type {HTMLElement} */ (dangerRef.container.querySelector('[data-fill]'));
    expect(fill.style.background).toBe(refFill.style.background);
  });
});
