// @vitest-environment jsdom

/**
 * The four BUILD screens, mounted on their own.
 *
 * `characterisation.test.jsx` and `build-store.test.jsx` already drive all of this
 * through the whole app, and they are the tests that say BUILD still works. What
 * they cannot say is whether a screen is INDEPENDENT of the shell: every one of
 * them renders EcuLab, so a screen that had quietly kept reading a value the shell
 * passes down would look identical from there.
 *
 * These mount each screen with nothing but a store around it. A screen that needs
 * the shell to render fails here and only here — the same property
 * `dash-screens.test.jsx` pins for HOME.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_ENGINE_CONFIG, MOD_INFO, deriveEngine } from '../../src/sim/index.js';
import { EngineScreen } from '../../src/ui/screens/build/EngineScreen.jsx';
import { ExhaustScreen } from '../../src/ui/screens/build/ExhaustScreen.jsx';
import { FuelSystemScreen } from '../../src/ui/screens/build/FuelSystemScreen.jsx';
import { InductionScreen } from '../../src/ui/screens/build/InductionScreen.jsx';
import { StoreProvider } from '../../src/ui/state/StoreProvider.jsx';

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

const noop = () => {};
const engineDerived = deriveEngine(DEFAULT_ENGINE_CONFIG);
const veAdvice = { inSync: true, maxAbs: 0 };

describe('EngineScreen', () => {
  it('reads the engine config off the store rather than off a prop', () => {
    mount(
      <EngineScreen active onToggle={noop} engineDerived={engineDerived} activePreset={null} veAdvice={veAdvice} onResetToStock={noop} />,
    );
    // Configuration comes straight from the store's default build, not a prop.
    expect(screen.getByRole('group', { name: 'Configuration' })).toBeTruthy();
    expect(screen.getByText('Custom build — every value below is yours to set. Pick a real engine above to start from a known-good factory configuration instead.')).toBeTruthy();
  });

  it('reports which section it is when its header is clicked', () => {
    const onToggle = vi.fn();
    mount(
      <EngineScreen active={false} onToggle={onToggle} engineDerived={engineDerived} activePreset={null} veAdvice={veAdvice} onResetToStock={noop} />,
    );
    fireEvent.click(screen.getByText('Engine Architecture'));
    expect(onToggle).toHaveBeenCalledWith('engine');
  });

  it('raises the stale-VE callout only when the shell says the tables are out of sync', () => {
    mount(
      <EngineScreen active onToggle={noop} engineDerived={engineDerived} activePreset={null} veAdvice={{ inSync: false, maxAbs: 12 }} onResetToStock={noop} />,
    );
    expect(screen.getByText(/Your VE table is now stale/)).toBeTruthy();
  });
  it('calls the shell-owned reset rather than doing it itself', () => {
    // RESET ALL TO STOCK lives beside the preset picker: both set the WHOLE build to a
    // known state. EngineScreen dispatches nothing of its own for it — the shell owns
    // the reset because it rebuilds the VE table from `hwForVe`, which several other
    // screens and the sim payload also read.
    const onResetToStock = vi.fn();
    mount(
      <EngineScreen
        active onToggle={noop} engineDerived={engineDerived} activePreset={null}
        veAdvice={veAdvice} onResetToStock={onResetToStock}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /RESET ALL TO STOCK/ }));
    expect(onResetToStock).toHaveBeenCalledTimes(1);
  });

});

describe('InductionScreen', () => {
  it('reveals the boost editor off the store once the turbo switch is on', () => {
    const { container } = mount(<InductionScreen active onToggle={noop} />);
    expect(screen.getByText('Not installed')).toBeTruthy();
    // The boost-columns block is always mounted and hidden with CSS (`data-open`),
    // the same hide-not-unmount contract BuildSection uses — so the buttons already
    // exist pre-click. Assert on `data-open` itself, which is what actually flips
    // with `turboOn`, rather than on button presence, which does not.
    const subPanel = container.querySelector('[data-open]');
    expect(subPanel.getAttribute('data-open')).toBe('false');
    fireEvent.click(screen.getByRole('switch', { name: /Turbo kit/ }));
    expect(subPanel.getAttribute('data-open')).toBe('true');
    expect(within(screen.getByTestId('boost-columns')).getAllByRole('button')).toHaveLength(8);
  });

  it('reports which section it is when its header is clicked', () => {
    const onToggle = vi.fn();
    mount(<InductionScreen active={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByText('Induction'));
    expect(onToggle).toHaveBeenCalledWith('induction');
  });

  it('installs the intake bolt-on through the store when its card is clicked', () => {
    // `boltons` dissolved into this screen and ExhaustScreen — this is the induction
    // half's only card. If `installMod` were dropped or mis-wired on the move out of
    // BoltonsScreen, the card would render but the click would never flip
    // `data-installed`, and this would fail.
    mount(<InductionScreen active onToggle={noop} />);
    const install = screen.getAllByRole('button').find((b) => b.textContent.includes('INSTALL') && !/** @type {HTMLButtonElement} */ (b).disabled);
    fireEvent.click(install);
    expect(screen.getByText(MOD_INFO.intake.label).closest('button').getAttribute('data-installed')).toBe('true');
  });
});

describe('FuelSystemScreen', () => {
  it('sets the fuel octane on the build slice', () => {
    mount(<FuelSystemScreen active onToggle={noop} />);
    fireEvent.click(screen.getByRole('button', { name: '100' }));
    expect(screen.getByRole('button', { name: '100' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('does not carry the ECU-side injector scaling across with the hardware', () => {
    // The hardware/calibration split is the whole point: what is FITTED lives here,
    // what the ECU BELIEVES is fitted lives on TUNE > Injectors. If the scaling Seg
    // came along with the PickList, the move flattened the distinction it exists for.
    mount(<FuelSystemScreen active onToggle={noop} />);
    expect(screen.queryByRole('button', { name: /RESCALE ECU/ })).toBeNull();
    expect(screen.queryByText('ECU Injector Scaling')).toBeNull();
  });

  it('sets the physical injector on the build slice', () => {
    // PickList carries no aria-pressed of its own (unlike Seg), so the dispatch
    // landing is checked through the header's `sub` line instead, which reads
    // straight off `INJECTOR_OPTS[injIdx]` — a value only the reducer, not this
    // screen, computes. `getByText` on the full string (not a `/650cc/` regex)
    // avoids also matching the PickList option button, which is still on screen
    // reading "650cc" after the click.
    mount(<FuelSystemScreen active onToggle={noop} />);
    expect(screen.getByText('91 · 315cc (stock)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '650cc' }));
    expect(screen.getByText('91 · 650cc')).toBeTruthy();
  });

  it('reports which section it is when its header is clicked', () => {
    const onToggle = vi.fn();
    mount(<FuelSystemScreen active={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByText('Fuel System'));
    expect(onToggle).toHaveBeenCalledWith('fuel');
  });
});

describe('ExhaustScreen', () => {
  it('shows the shell-computed ideal diameter, not one it derived itself', () => {
    // Fabricated — not something the screen's own inputs (default store state)
    // could ever produce via `idealExhaustDiameter`. If the screen silently
    // re-derived the value instead of trusting the prop, this would fail.
    const ideal = 7.77;
    mount(<ExhaustScreen active onToggle={noop} idealExhaustDia={ideal} />);
    expect(screen.getByText(new RegExp(`~${ideal.toFixed(2)} in`))).toBeTruthy();
  });

  it('reports which section it is when its header is clicked', () => {
    const onToggle = vi.fn();
    mount(<ExhaustScreen active={false} onToggle={onToggle} idealExhaustDia={3} />);
    fireEvent.click(screen.getByText('Exhaust'));
    expect(onToggle).toHaveBeenCalledWith('exhaust');
  });

  it('installs the exhaust and headers bolt-ons through the store when their cards are clicked', () => {
    // The exhaust half of the dissolved BoltonsScreen — both remaining cards land
    // here. Clicking each in turn and reading `data-installed` back off the DOM
    // catches either card losing its `installMod` wiring on the move.
    mount(<ExhaustScreen active onToggle={noop} idealExhaustDia={3} />);
    fireEvent.click(screen.getByText(MOD_INFO.exhaust.label).closest('button'));
    fireEvent.click(screen.getByText(MOD_INFO.headers.label).closest('button'));
    expect(screen.getByText(MOD_INFO.exhaust.label).closest('button').getAttribute('data-installed')).toBe('true');
    expect(screen.getByText(MOD_INFO.headers.label).closest('button').getAttribute('data-installed')).toBe('true');
  });

});

describe('the dissolved Bolt-On Parts section', () => {
  it('leaves no bolt-on without a screen', () => {
    // `boltons` dissolved into Induction and Exhaust. A fourth mod added to MOD_INFO
    // later would otherwise be installable by nothing — this fails the day that
    // happens. It also fails the other way: if a mod were rendered on BOTH screens
    // (e.g. left behind on Induction after also being added to Exhaust), the merged
    // list would contain a duplicate key and the sorted-array equality would no
    // longer match Object.keys(MOD_INFO)'s sorted, deduplicated list.
    mount(<InductionScreen active onToggle={noop} />);
    const onInduction = Object.keys(MOD_INFO).filter((k) => screen.queryByText(MOD_INFO[k].label));
    cleanup();
    mount(<ExhaustScreen active onToggle={noop} idealExhaustDia={2.5} />);
    const onExhaust = Object.keys(MOD_INFO).filter((k) => screen.queryByText(MOD_INFO[k].label));
    expect([...onInduction, ...onExhaust].sort()).toEqual(Object.keys(MOD_INFO).sort());
  });
});
