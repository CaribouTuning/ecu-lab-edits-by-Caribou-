// @vitest-environment jsdom

/**
 * Extension tabs (src/ui/extensions.js): how ECU Lab Pro adds its screens to this app
 * without forking it. A registered tab must behave like a built-in one — nav button,
 * deep link, its screen rendered inside the store — and the free app (nothing
 * registered) must be untouched.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Beaker } from 'lucide-react';
import React from 'react';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import EcuLab from '../../src/ui/EcuLab.jsx';
import { EXTENSION_TABS, registerTab } from '../../src/ui/extensions.js';
import { ROUTES, parseRoute } from '../../src/ui/routing.js';
import { useBuild } from '../../src/ui/state/StoreProvider.jsx';

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
const hadResizeObserver = 'ResizeObserver' in window;
if (!hadResizeObserver) window.ResizeObserver = ResizeObserverStub;
afterAll(() => { if (!hadResizeObserver) delete window.ResizeObserver; });
afterEach(cleanup);
beforeEach(() => { window.location.hash = ''; });

function ProbeScreen({ section }) {
  const build = useBuild();
  return <div data-testid="probe">probe {section} {build ? 'has build' : 'no build'}</div>;
}

describe('extension tabs', () => {
  it('registers nothing in the free app', () => {
    expect(EXTENSION_TABS).toEqual([]);
    expect(Object.keys(ROUTES)).toEqual(['dash', 'build', 'tune', 'live', 'dyno', 'drag']);
  });

  it('refuses to replace a built-in tab', () => {
    expect(() => registerTab({ id: 'tune', label: 'X', icon: Beaker, sections: ['a'], render: () => null })).toThrow(/built-in/);
  });

  it('adds a nav button, a route and a screen that can read the store', () => {
    registerTab({ id: 'lab', label: 'LAB', icon: Beaker, sections: ['main', 'other'], render: ({ section }) => <ProbeScreen section={section} /> });
    expect(parseRoute('#/lab/other')).toEqual({ view: 'app', tab: 'lab', section: 'other' });
    window.location.hash = '#/lab/main';
    render(<EcuLab />);
    expect(screen.getByTestId('probe').textContent).toMatch(/probe main has build/);
    // The nav carries it after the built-in tabs, and leaving and coming back works.
    fireEvent.click(screen.getByRole('button', { name: 'TUNE' }));
    expect(screen.queryByTestId('probe')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'LAB' }));
    expect(screen.getByTestId('probe')).toBeTruthy();
  });
});
