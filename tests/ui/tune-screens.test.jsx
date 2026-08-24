// @vitest-environment jsdom

/**
 * The four TUNE screens, mounted on their own.
 *
 * `characterisation.test.jsx` and `build-store.test.jsx` already drive all of this
 * through the whole app, and they are the tests that say TUNE still works. What
 * they cannot say is whether a screen is INDEPENDENT of the shell: every one of
 * them renders EcuLab, so a screen that had quietly kept reading a value the shell
 * passes down would look identical from there — the same property
 * `build-screens.test.jsx` and `dash-screens.test.jsx` pin for BUILD and HOME.
 *
 * Every shell-owned prop these screens take (`veAdvice`, `veTruth`, `calAdvice`,
 * `dutyPreview`, `fuel`, `injectorCc`, `needsMafRecal`, `result`) is asserted here
 * with a value the screen's own inputs (default store state) could not have
 * produced — not a value that happens to match what the real computation would
 * give a default build, which would pass just as well if the screen quietly
 * recomputed it instead of trusting the prop.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { AirflowScreen } from '../../src/ui/screens/tune/AirflowScreen.jsx';
import { EcuScreen } from '../../src/ui/screens/tune/EcuScreen.jsx';
import { FuelScreen } from '../../src/ui/screens/tune/FuelScreen.jsx';
import { SparkScreen } from '../../src/ui/screens/tune/SparkScreen.jsx';
import { StoreProvider } from '../../src/ui/state/StoreProvider.jsx';

// jsdom has no ResizeObserver, and EcuScreen's FUEL TRIM panel mounts recharts'
// <ResponsiveContainer> once a result exists, which throws without one. Same stub
// as button-call-sites.test.jsx and characterisation.test.jsx.
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
 * Mounts a screen with a real store and nothing else — no shell, no route, no props
 * beyond the ones a screen is allowed to be given.
 * @param {React.ReactElement} node
 * @returns {ReturnType<typeof render>}
 */
function mount(node) {
  return render(<StoreProvider>{node}</StoreProvider>);
}

// A blank calAdvice — none of the four advisory arrays trip — so SparkScreen and
// FuelScreen tests that are not exercising the advisory itself land on each
// screen's quiet default state instead of tripping over unrelated fixture noise.
const QUIET_CAL_ADVICE = { overAdvanced: [], underAdvanced: [], pastMbt: [], wrongMix: [] };

describe('AirflowScreen', () => {
  it('mounts the shared TuningGrid and SelectionDock with their test ids intact', () => {
    mount(<AirflowScreen veAdvice={null} veTruth={[]} />);
    expect(screen.getByTestId('tuning-grid')).toBeTruthy();
    // The dock is selection-gated — nothing is selected on a fresh store — so it
    // only appears once a cell is clicked, same as inside the full app.
    expect(screen.queryByTestId('selection-dock')).toBeNull();
    const grid = screen.getByTestId('tuning-grid');
    fireEvent.click(within(grid).getAllByRole('button').at(-1));
    expect(screen.getByTestId('selection-dock')).toBeTruthy();
  });

  it('shows the shell-computed veAdvice sync gap, not one it derived itself', () => {
    // Fabricated — not a value `veRecommendations` could produce for the default
    // store's engine, and AirflowScreen never imports that function itself.
    const veAdvice = {
      inSync: false,
      maxAbs: 42.3,
      recs: [{ rpmText: 'FABRICATED 9999 RPM', text: 'fabricated advisory text', cells: ['9999@1 -> 2'] }],
    };
    mount(<AirflowScreen veAdvice={veAdvice} veTruth={[]} />);
    expect(screen.getByText('42% max gap')).toBeTruthy();
    expect(screen.getByText('FABRICATED 9999 RPM')).toBeTruthy();
  });

  it('writes the shell-computed veTruth into the store on ACCEPT RE-LOGGED VALUES, not one it derived itself', () => {
    // 6 rows (LOAD) x 8 cols (RPM), filled with a value no default build's VE table
    // would ever land on uniformly across every cell.
    const veTruth = Array.from({ length: 6 }, () => Array(8).fill(77));
    mount(<AirflowScreen veAdvice={{ inSync: false, maxAbs: 1, recs: [] }} veTruth={veTruth} />);
    fireEvent.click(screen.getByRole('button', { name: 'ACCEPT RE-LOGGED VALUES' }));
    // Every grid cell now reads 77 — proof the dispatched value was this exact
    // prop, not a recomputation off the store's own engineConfig/mods.
    const grid = screen.getByTestId('tuning-grid');
    const cells = within(grid).getAllByRole('button').filter((b) => b.textContent === '77');
    expect(cells).toHaveLength(48);
  });
});

describe('SparkScreen', () => {
  it('mounts the shared TuningGrid with its test id intact', () => {
    mount(<SparkScreen calAdvice={QUIET_CAL_ADVICE} />);
    expect(screen.getByTestId('tuning-grid')).toBeTruthy();
  });

  it('shows the shell-computed knock-limit advisory, not one it derived itself', () => {
    // Fabricated cells: no default build's `calibrationAdvice` would report a cell
    // at 999 kPa (off the LOAD axis entirely) or suggest 22° from 11°.
    const calAdvice = {
      overAdvanced: [{ map: 999, rpm: 9999, current: 11, suggested: 22 }],
      underAdvanced: [], pastMbt: [], wrongMix: [],
    };
    mount(<SparkScreen calAdvice={calAdvice} />);
    expect(screen.getByText('1 CELLS BEYOND THE KNOCK LIMIT')).toBeTruthy();
    expect(screen.getByText(/999 kPa \/ 9999 RPM: 11° → 22°/)).toBeTruthy();
  });

  it('falls through the danger/under-advanced/past-MBT states to the clean-table message when every advisory is empty', () => {
    mount(<SparkScreen calAdvice={QUIET_CAL_ADVICE} />);
    expect(screen.getByText('Spark table sits within the knock limit for this hardware.')).toBeTruthy();
  });
});

describe('FuelScreen', () => {
  it('mounts the shared TuningGrid with its test id intact', () => {
    mount(<FuelScreen calAdvice={QUIET_CAL_ADVICE} />);
    expect(screen.getByTestId('tuning-grid')).toBeTruthy();
  });

  it('shows the shell-computed wrong-mixture advisory, not one it derived itself', () => {
    // Fabricated: a real pull's delivered/target figures for the default build
    // would never land on these exact numbers.
    const calAdvice = {
      overAdvanced: [], underAdvanced: [], pastMbt: [],
      wrongMix: [{ map: 888, rpm: 7777, current: 12.3, suggested: 11.1, delta: -1, delivered: 99, target: 88 }],
    };
    mount(<FuelScreen calAdvice={calAdvice} />);
    expect(screen.getByText('1 HIGH-LOAD CELLS OFF BEST POWER')).toBeTruthy();
    expect(screen.getByText(/888 kPa \/ 7777 RPM: 12\.3:1 → 11\.1:1 \(richen\) · delivered 99, wants 88/)).toBeTruthy();
  });
});

describe('EcuScreen', () => {
  const quietProps = {
    dutyPreview: 10, fuel: { label: 'Q', stoich: 14.7, density: 0.74 }, injectorCc: 315,
    needsMafRecal: false, chartData: [], result: null,
  };

  it('shows the shell-computed duty preview as dangerous only past its own threshold, not a recomputed one', () => {
    // 137 lands well past utilisationColor's own >90 danger band; nothing in
    // EcuScreen computes duty itself, so this can only come from the prop.
    mount(<EcuScreen {...quietProps} dutyPreview={137} />);
    expect(screen.getByText('Undersized for this build — expect forced lean-out')).toBeTruthy();
  });

  it('does not show the duty warning when the shell says duty has headroom', () => {
    mount(<EcuScreen {...quietProps} dutyPreview={10} />);
    expect(screen.queryByText('Undersized for this build — expect forced lean-out')).toBeNull();
  });

  it('shows the shell-computed fuel, not the store octane label it could read itself', () => {
    // EcuScreen reads `octaneIdx` off the store for the Seg control, but the
    // stoich note reads the `fuel` PROP — a fabricated label/stoich the default
    // store's OCTANE_OPTS[octaneIdx] could never produce proves it is not quietly
    // recomputing `OCTANE_OPTS[octaneIdx]` for this line too.
    mount(<EcuScreen {...quietProps} fuel={{ label: 'FABTANE', stoich: 9.9, density: 1 }} />);
    expect(screen.getByText('FABTANE stoich 9.9:1')).toBeTruthy();
  });

  it('shows the shell-computed injectorCc in the scaling-mismatch warning, not INJECTOR_OPTS[injIdx].cc', () => {
    // The default store's fitted injector is 315cc (INJECTOR_OPTS[injIdx=0]) and its
    // ecuInjectorCc default is also 315 — matched, so with the real injectorCc this
    // screen would show the "matches" note instead. A fabricated, wildly different
    // injectorCc forces the mismatch branch and proves the number in it is the prop.
    mount(<EcuScreen {...quietProps} injectorCc={12345} />);
    expect(screen.getByRole('button', { name: 'RESCALE ECU TO 12345cc' })).toBeTruthy();
  });

  it('shows the shell-computed needsMafRecal, not one derived from the store mods it also reads', () => {
    // Default store: no intake, no turbo — the screen's own mods/turboOn would say
    // recal is not needed. Forcing the prop true proves the STATUS line answers to
    // the shell's computation, not to the mods/turboOn this same screen also reads
    // for the explanatory sub-note.
    mount(<EcuScreen {...quietProps} needsMafRecal />);
    expect(screen.getByText('HARDWARE CHANGED')).toBeTruthy();
  });

  it('shows the FUEL TRIM chart only when the shell says a pull result exists', () => {
    mount(<EcuScreen {...quietProps} result={null} />);
    expect(screen.queryByText('FUEL TRIM — LAST PULL')).toBeNull();
    cleanup();
    mount(<EcuScreen {...quietProps} result={{ points: [] }} chartData={[{ rpm: 1500, trimPct: 2 }]} />);
    expect(screen.getByText('FUEL TRIM — LAST PULL')).toBeTruthy();
  });
});
