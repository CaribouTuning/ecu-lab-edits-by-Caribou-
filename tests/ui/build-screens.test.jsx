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

import { DEFAULT_ENGINE_CONFIG, deriveEngine } from '../../src/sim/index.js';
import { BoltonsScreen } from '../../src/ui/screens/build/BoltonsScreen.jsx';
import { EngineScreen } from '../../src/ui/screens/build/EngineScreen.jsx';
import { ExhaustScreen } from '../../src/ui/screens/build/ExhaustScreen.jsx';
import { FuelSystemScreen } from '../../src/ui/screens/build/FuelSystemScreen.jsx';
import { TurboScreen } from '../../src/ui/screens/build/TurboScreen.jsx';
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
      <EngineScreen active onToggle={noop} engineDerived={engineDerived} activePreset={null} veAdvice={veAdvice} />,
    );
    // Configuration comes straight from the store's default build, not a prop.
    expect(screen.getByRole('group', { name: 'Configuration' })).toBeTruthy();
    expect(screen.getByText('Custom build — every value below is yours to set. Pick a real engine above to start from a known-good factory configuration instead.')).toBeTruthy();
  });

  it('reports which section it is when its header is clicked', () => {
    const onToggle = vi.fn();
    mount(
      <EngineScreen active={false} onToggle={onToggle} engineDerived={engineDerived} activePreset={null} veAdvice={veAdvice} />,
    );
    fireEvent.click(screen.getByText('Engine Architecture'));
    expect(onToggle).toHaveBeenCalledWith('engine');
  });

  it('raises the stale-VE callout only when the shell says the tables are out of sync', () => {
    mount(
      <EngineScreen active onToggle={noop} engineDerived={engineDerived} activePreset={null} veAdvice={{ inSync: false, maxAbs: 12 }} />,
    );
    expect(screen.getByText(/Your VE table is now stale/)).toBeTruthy();
  });
});

describe('BoltonsScreen', () => {
  it('installs a part through the store when its card is clicked', () => {
    mount(<BoltonsScreen active onToggle={noop} onResetToStock={noop} />);
    const install = screen.getAllByRole('button').find((b) => b.textContent.includes('INSTALL') && !/** @type {HTMLButtonElement} */ (b).disabled);
    fireEvent.click(install);
    expect(screen.getByText(/1\/4 installed/)).toBeTruthy();
  });

  it('reports which section it is when its header is clicked', () => {
    const onToggle = vi.fn();
    mount(<BoltonsScreen active={false} onToggle={onToggle} onResetToStock={noop} />);
    fireEvent.click(screen.getByText('Bolt-On Parts'));
    expect(onToggle).toHaveBeenCalledWith('boltons');
  });

  it('calls the shell-owned reset rather than doing it itself', () => {
    const onResetToStock = vi.fn();
    mount(<BoltonsScreen active onToggle={noop} onResetToStock={onResetToStock} />);
    fireEvent.click(screen.getByRole('button', { name: /RESET ALL TO STOCK/ }));
    expect(onResetToStock).toHaveBeenCalledTimes(1);
  });
});

describe('TurboScreen', () => {
  it('reveals the boost editor off the store once the turbo switch is on', () => {
    const { container } = mount(<TurboScreen active onToggle={noop} />);
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
    mount(<TurboScreen active={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByText('Forced Induction'));
    expect(onToggle).toHaveBeenCalledWith('turbo');
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
});
