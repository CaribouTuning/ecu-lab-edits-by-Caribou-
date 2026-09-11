// @vitest-environment jsdom

/**
 * StoreProvider / hook tests.
 *
 * Not pinned by the plan's verbatim test listing (that only specifies
 * reducer.test.js), but the provider and its three hooks are a produced interface
 * later tasks depend on by exact name, so they get their own coverage: each hook must
 * return its own slice, dispatch must route through the real reducer, and using a
 * hook outside the provider must throw instead of silently handing back `undefined`.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { ACTIONS } from '../../../src/ui/state/reducer.js';
import { StoreProvider, useBuild, useSession, useTune } from '../../../src/ui/state/StoreProvider.jsx';

afterEach(cleanup);

function BuildProbe() {
  const [build, dispatch] = useBuild();
  return (
    <div>
      <span data-testid="turboOn">{String(build.turboOn)}</span>
      <button onClick={() => dispatch({ type: ACTIONS.SET_BUILD_FIELD, field: 'turboOn', value: true })}>
        flip
      </button>
    </div>
  );
}

function TuneProbe() {
  const [tune] = useTune();
  return <span data-testid="tablesDirty">{String(tune.tablesDirty)}</span>;
}

function SessionProbe() {
  const [session] = useSession();
  return <span data-testid="pullCount">{session.pullCount}</span>;
}

describe('useBuild / useTune / useSession outside a provider', () => {
  it('throws a clear error rather than returning undefined', () => {
    // Rendered with no <StoreProvider> ancestor. A silent `undefined` here would
    // surface as a confusing crash three components away instead of at the source.
    const Bare = () => { useBuild(); return null; };
    // React logs the thrown error to the console during a failed render; that noise
    // is expected and not something this test needs to assert on.
    const spy = () => {};
    const originalError = console.error;
    console.error = spy;
    try {
      expect(() => render(<Bare />)).toThrow(/StoreProvider/);
    } finally {
      console.error = originalError;
    }
  });
});

describe('StoreProvider', () => {
  it('gives each hook its own slice of one shared store', () => {
    render(
      <StoreProvider>
        <BuildProbe />
        <TuneProbe />
        <SessionProbe />
      </StoreProvider>,
    );
    expect(screen.getByTestId('turboOn').textContent).toBe('false');
    expect(screen.getByTestId('tablesDirty').textContent).toBe('false');
    expect(screen.getByTestId('pullCount').textContent).toBe('0');
  });

  it('dispatch from useBuild goes through the real reducer and re-renders the slice', () => {
    render(
      <StoreProvider>
        <BuildProbe />
      </StoreProvider>,
    );
    expect(screen.getByTestId('turboOn').textContent).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'flip' }));
    expect(screen.getByTestId('turboOn').textContent).toBe('true');
  });

  it('gives two mounted providers independent state', () => {
    // Regression guard against a module-scoped store: each <StoreProvider> must own
    // its own useReducer instance.
    const { unmount } = render(
      <StoreProvider>
        <BuildProbe />
      </StoreProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'flip' }));
    expect(screen.getByTestId('turboOn').textContent).toBe('true');
    unmount();

    render(
      <StoreProvider>
        <BuildProbe />
      </StoreProvider>,
    );
    expect(screen.getByTestId('turboOn').textContent).toBe('false');
  });
});
