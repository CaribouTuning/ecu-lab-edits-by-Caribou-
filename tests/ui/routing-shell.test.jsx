// @vitest-environment jsdom

/**
 * The shell's half of routing: what the URL and the rendered screen do to each other.
 *
 * `routing.test.js` covers `parseRoute`/`formatRoute` as pure functions, and
 * `characterisation.test.jsx` covers what the app renders when you click things. The
 * gap between them is everything this file tests, and it is a real gap: the
 * characterisation tests navigate by clicking real controls and never once look at
 * `window.location`, so the entire URL half of this feature could be missing — or
 * wired backwards — and all eight of them would still pass.
 *
 * Four behaviours live only here:
 *   - a deep link works on a COLD load, with no navigation to react to;
 *   - a click writes the URL, not just React state;
 *   - the browser back button walks back through the app;
 *   - "every accordion closed" is a state the URL can hold and restore.
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import EcuLab from '../../src/ui/EcuLab.jsx';
import { ROUTES } from '../../src/ui/routing.js';
import { chrome, enterSandbox, goTo, openJobBoard } from './nav.js';

// Same stub, and the same reason, as characterisation.test.jsx: recharts'
// <ResponsiveContainer> on the DYNO panel needs a ResizeObserver to mount at all.
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

// tests/setup.js already clears the hash before every test; restating it here keeps
// this file honest about the precondition every one of these assertions depends on.
beforeEach(() => {
  window.location.hash = '';
});

/** Renders the app at whatever the current hash says. @returns {void} */
function mount() {
  render(<EcuLab />);
}

/** Renders the app and clicks past the start screen (which lands on BUILD). */
function launch() {
  mount();
  // The start screen offers CAREER, SANDBOX and TUTORIAL rather than a single START.
  // SANDBOX is the free-play entry the old button was.
  enterSandbox();
}



describe('a deep link on a cold load', () => {
  it('renders the linked screen without anyone clicking first', () => {
    // The failure this guards is a hook that only subscribes to `hashchange`: it is
    // correct for every navigation and wrong for the one case that has no navigation
    // to hear about — someone opening the link in a fresh tab. That reads as "deep
    // links were never implemented" rather than as a bug, which is why no amount of
    // clicking-based testing finds it.
    window.location.hash = '#/tune/spark';
    mount();

    expect(screen.queryByRole('button', { name: 'Sandbox' })).toBeNull();
    expect(screen.getByText('Ignition Timing')).toBeTruthy();
  });

  it('lands on the tab when the section is stale, rather than on nothing', () => {
    // #83 re-sections these tabs, so links to today's section names will outlive
    // them. parseRoute drops the unknown section and keeps the tab; this pins that
    // the SHELL then renders that tab rather than a blank frame.
    window.location.hash = '#/build/supercharger';
    mount();

    expect(screen.getByRole('navigation', { name: 'Engine parts' })).toBeTruthy();
  });
});

describe('clicking a tab', () => {
  it('writes the URL, not just React state', () => {
    launch();
    // BUILD opens on its list of sections, all shut, so all four are in view at once.
    expect(window.location.hash).toBe('#/build');

    goTo('TUNE');
    expect(window.location.hash).toBe('#/tune/airflow');

    // Sub-tab strips are part of the address too, one level down.
    fireEvent.click(screen.getByRole('button', { name: 'Spark' }));
    expect(window.location.hash).toBe('#/tune/spark');
    expect(screen.getByText('Ignition Timing')).toBeTruthy();
  });

  it('opens each tab on its first section, the way the old per-tab defaults did', () => {
    // The six useState calls this replaced defaulted to 'live'/'engine'/'ve'/'result'.
    // Those are the heads of the ROUTES lists, and `goTab` reads them from there — so
    // this asserts the defaults did not quietly change hands during the conversion.
    launch();
    for (const [tab, label] of [['tune', 'TUNE'], ['dyno', 'DYNO'], ['physics', 'PHYSICS']]) {
      goTo(label);
      expect(window.location.hash).toBe(`#/${tab}/${ROUTES[tab][0]}`);
    }
    // BUILD is an accordion and opens with every section shut, so the four section
    // headers are a list you can see whole instead of the first one's long contents.
    goTo('BUILD');
    expect(window.location.hash).toBe('#/build');
    // LEARN is the exception, on purpose: the laptop opens it on "How it works", the
    // shelf a newcomer wants, not on the reference list that heads its sidebar.
    goTo('LEARN');
    expect(window.location.hash).toBe('#/learn/how');
  });

  it('routes every TUNE sub-tab to the screen with a matching id, not just a highlighted button', () => {
    // TUNE_VIEWS (the switcher's own id list, in EcuLab.jsx) and the `tuneView === '…'`
    // mount conditions right below it are two separate hand-written lists with nothing
    // that forces them to agree. Get one id wrong and the switcher still lights up —
    // `on = tuneView === v.id` reads the same id it navigates to — while the section
    // below the switcher silently renders nothing, because no mount condition matches
    // the URL. characterisation.test.jsx's TUNE marker only proves a switcher button
    // exists, not that a view rendered, because the switcher itself is part of the TUNE
    // tab body: it would still be there even if every mount condition were wrong. This
    // is the test that actually looks below the switcher for each of the five ids.
    launch();
    goTo('TUNE');
    const views = {
      'Airflow (VE)': 'Volumetric Efficiency',
      Spark: 'Ignition Timing',
      Fuel: 'Air-Fuel Ratio Target',
      Injectors: 'Injectors',
      Sensors: 'Fuel Control & MAF Scaling',
    };
    for (const [tabLabel, ownEyebrow] of Object.entries(views)) {
      fireEvent.click(screen.getByRole('button', { name: tabLabel }));
      // Where the page's heading is the tab's own name, both are on screen.
      expect(screen.getAllByText(ownEyebrow).length).toBeGreaterThan(tabLabel === ownEyebrow ? 1 : 0);
    }
  });

  it('marks the open TUNE page aria-current, and moves it on navigation', () => {
    // The Tune app's sidebar lists the ECU's tables, as a Mac app lists its documents; the
    // open one is the current page.
    launch();
    /** @param {string} name @returns {string[]} labels of the current buttons in that nav */
    const current = (name) => within(screen.getByRole('navigation', { name }))
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-current') === 'page')
      .map((b) => b.textContent);

    goTo('TUNE');
    expect(current('ECU tables')).toEqual(['Airflow (VE)']);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'ECU tables' })).getByRole('button', { name: 'Spark' }));
    expect(current('ECU tables')).toEqual(['Spark']);
    // Absent, not "false", on every other page.
    const others = within(screen.getByRole('navigation', { name: 'ECU tables' }))
      .getAllByRole('button').filter((b) => b.textContent !== 'Spark');
    for (const b of others) expect(b.hasAttribute('aria-current')).toBe(false);
  });
});

describe('the back button', () => {
  it('returns to the previous screen', async () => {
    launch();
    goTo('TUNE');
    expect(screen.getByText('Volumetric Efficiency')).toBeTruthy();

    // Tune was opened from the laptop's desktop, so that is where back goes.
    window.history.back();

    // jsdom dispatches hashchange from a queued task rather than synchronously, so
    // the assertion has to wait for it — as it would in a browser.
    await waitFor(() => expect(window.location.hash).toBe('#/desk'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'TUNE' })).toBeTruthy());
    // And before the laptop, the engine stand it was opened from.
    window.history.back();
    await waitFor(() => expect(window.location.hash).toBe('#/build'));
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Engine parts' })).toBeTruthy());
  });

  it('does not have to step through dead entries for clicks that went nowhere', async () => {
    // Re-clicking the tab you are already on must not push history. If it does, the
    // app still looks right — every screen renders correctly — but the back button
    // needs four presses to do one thing, which reads to a user as a broken control.
    // Push one known start-screen entry first, so "one press back" has a fixed
    // destination regardless of what the previous test in this file left on the stack.
    window.location.hash = '#/';
    launch();
    // From the engine stand up to the laptop, then the taskbar's home button, pressed again
    // and again from the desktop it already shows.
    fireEvent.click(screen.getAllByRole('button', { name: 'Open the laptop' })[0]);
    const home = () => screen.getByRole('button', { name: 'Desktop' });
    fireEvent.click(home());
    fireEvent.click(home());
    fireEvent.click(home());
    expect(window.location.hash).toBe('#/desk');

    // One press, from the desktop back to the engine stand it was opened from.
    window.history.back();
    await waitFor(() => expect(window.location.hash).toBe('#/build'));
  });
});

describe('the engine stand\'s parts', () => {
  it('are each a state the URL holds, and a cold load restores it', () => {
    // The stand's build software shows one part of the engine at a time, chosen from its
    // list, and the part is the second segment of the route. A component that merely
    // remembered the part in React state would pass the first half and fail the second.
    launch();
    const parts = screen.getByRole('navigation', { name: 'Engine parts' });
    fireEvent.click(within(parts).getByRole('button', { name: /Short block/ }));
    expect(window.location.hash).toBe('#/build/block');
    expect(screen.getByRole('region', { name: 'Short block' })).toBeTruthy();

    // Round trip: throw the component away and rebuild it from that URL alone.
    cleanup();
    expect(window.location.hash).toBe('#/build/block');
    mount();
    expect(screen.getByRole('region', { name: 'Short block' })).toBeTruthy();

    // No part named: the stand opens on the engine itself, never on nothing.
    cleanup();
    window.location.hash = '#/build';
    mount();
    expect(screen.getByRole('region', { name: 'Engine' })).toBeTruthy();
  });

  it('keeps CAREER out of SANDBOX: CAREER opens a shop of its own, SANDBOX has no customers', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Career' }));
    expect(window.location.hash).toBe('#/shop');
    // The save loads and you are stood in your shop; the paperwork is on the shop wall.
    await screen.findByRole('button', { name: 'Open the laptop' });
    expect(window.location.hash).toBe('#/bay');
    await openJobBoard();
    // No SANDBOX chrome in the shop, and the way back to the start screen is there.
    expect(screen.queryByRole('navigation', { name: 'Sections' })).toBeNull();
    chrome('Main menu');
    expect(window.location.hash).toBe('#/');

    enterSandbox();
    expect(screen.queryByTestId('shop-money')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Job board' })).toBeNull();
  });
});

describe('the tutorial', () => {
  it('has its own address, and leaving it lands back on BUILD', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Tutorial' }));
    expect(window.location.hash).toBe('#/tutorial');

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(window.location.hash).toBe('#/build/engine');
  });
});
