// @vitest-environment jsdom

/**
 * SANDBOX's first launch has no engine: the engine screens ask for one (prebuilt, or the
 * player's own specs) instead of showing a placeholder engine nobody chose.
 */

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import EcuLab from '../../src/ui/EcuLab.jsx';
import { enterSandbox, goTo, factoryEngine, customEngine } from './nav.js';

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
const hadResizeObserver = 'ResizeObserver' in window;
if (!hadResizeObserver) window.ResizeObserver = ResizeObserverStub;
afterAll(() => { if (!hadResizeObserver) delete window.ResizeObserver; });
afterEach(cleanup);
beforeEach(() => localStorage.clear());

const launchBlank = () => {
  window.location.hash = '';
  const view = render(<EcuLab blankStart />);
  enterSandbox();
  return view;
};

describe('SANDBOX with no engine yet', () => {
  it('says so in the header and offers prebuilt engines and a custom engine on every engine screen', () => {
    launchBlank();
    expect(screen.getByTestId('build-line').textContent).toMatch(/No engine chosen yet/);
    for (const tab of ['TUNE', 'LIVE', 'DYNO', 'BUILD']) {
      goTo(tab);
      expect(screen.getByTestId('engine-start')).toBeTruthy();
      expect(screen.queryByTestId('tuning-grid')).toBeNull();
    }
    expect(factoryEngine('Nissan VQ35DE Rev-Up')).toBeTruthy();
    expect(customEngine()).toBeTruthy();
  });

  it('starts on a prebuilt engine in one click, with that engine named in the header', () => {
    launchBlank();
    goTo('BUILD');
    fireEvent.click(factoryEngine('Nissan VQ35HR'));
    expect(screen.queryByTestId('engine-start')).toBeNull();
    expect(screen.getByTestId('build-line').textContent).toMatch(/^Nissan VQ35HR/);
  });

  it('a custom engine goes straight to its short block, typical figures on it, with no form to fill in first', () => {
    launchBlank();
    goTo('BUILD');
    fireEvent.click(customEngine());
    expect(screen.queryByTestId('engine-start')).toBeNull();
    expect(screen.queryByRole('form', { name: 'Describe your engine' })).toBeNull();
    expect(screen.getByTestId('build-line').textContent).toMatch(/^2\.0L I4/);
    const onPart = within(screen.getByRole('navigation', { name: 'Engine parts' }))
      .getAllByRole('button').find((x) => x.getAttribute('aria-current') === 'true')?.textContent ?? '';
    expect(onPart).toMatch(/Short block/);
    expect(screen.getByRole('slider', { name: /Bore/ })).toBeTruthy();
  });

  it('is undone by one UNDO from BUILD, back to no engine', () => {
    launchBlank();
    goTo('BUILD');
    fireEvent.click(factoryEngine('Nissan VQ35HR'));
    fireEvent.click(screen.getAllByRole('button', { name: /^Undo Preset/ }).at(0));
    expect(screen.getByTestId('engine-start')).toBeTruthy();
  });
});

describe('everything else still starts ready', () => {
  it('a plain <EcuLab /> (tests, tutorial stores) has its default engine', () => {
    window.location.hash = '';
    render(<EcuLab />);
    enterSandbox();
    expect(screen.getByTestId('build-line').textContent).not.toMatch(/No engine chosen/);
  });
});

describe('figures the app assumed for the player\'s own engine', () => {
  it('lists them on BUILD until each is set, and drops each as the player sets it', () => {
    launchBlank();
    goTo('BUILD');
    fireEvent.click(customEngine());
    const note = () => screen.queryByText(/Assumed, not entered/)?.parentElement?.textContent ?? '';
    expect(note()).toMatch(/I4 layout.*86 mm bore.*86 mm stroke.*10\.5:1 compression.*6,800 rpm redline/);
    expect(note()).toMatch(/intake cam duration 210°.*valvetrain DOHC.*4 valves per cylinder.*aluminum block.*aluminum head/i);
    expect(note()).toMatch(/cast pistons, production rods/);
    // Every assumed figure is named in words: no state key reaches the player.
    expect(note()).not.toMatch(/\b[a-z]+[A-Z][a-zA-Z]*\b/);
    fireEvent.change(screen.getByRole('slider', { name: /Bore/ }), { target: { value: '90' } });
    expect(note()).not.toMatch(/mm bore/);
    expect(note()).toMatch(/mm stroke/);
    // The cam is on the stand's Heads and cam part; the note is on its Engine part. Each lobe
    // is its own figure: the intake set, the exhaust lobe is still assumed, until it is set too.
    const parts = () => within(screen.getByRole('navigation', { name: 'Engine parts' }));
    const cams = () => screen.getAllByRole('slider').filter((s) => s.getAttribute('min') === '180');
    fireEvent.click(parts().getByRole('button', { name: /Heads and cam/ }));
    fireEvent.change(cams()[0], { target: { value: '222' } });
    fireEvent.click(parts().getByRole('button', { name: /^Engine/ }));
    expect(note()).not.toMatch(/intake cam duration/);
    expect(note()).toMatch(/exhaust cam duration/);
    fireEvent.click(parts().getByRole('button', { name: /Heads and cam/ }));
    fireEvent.change(cams()[1], { target: { value: '228' } });
    fireEvent.click(parts().getByRole('button', { name: /^Engine/ }));
    expect(note()).not.toMatch(/cam duration/);
    expect(note()).toMatch(/valvetrain DOHC/);
  });
});

describe('an engine put on the BUILD bench', () => {
  const onPart = () => within(screen.getByRole('navigation', { name: 'Engine parts' }))
    .getAllByRole('button').find((b) => b.getAttribute('aria-current') === 'true')?.textContent ?? '';
  const ownEngine = () => fireEvent.click(customEngine());

  it('opens on its short block, a factory engine or the player\'s own', () => {
    launchBlank();
    goTo('BUILD');
    fireEvent.click(factoryEngine('Nissan VQ35HR'));
    expect(onPart()).toMatch(/Short block/);
    cleanup();
    launchBlank();
    goTo('BUILD');
    ownEngine();
    expect(onPart()).toMatch(/Short block/);
  });

  it('on an engine of the player\'s own, says the base map is safe and not tuned, and that boost is theirs to tune', () => {
    launchBlank();
    goTo('BUILD');
    ownEngine();
    const note = screen.getByText(/Safe base map loaded/).parentElement.textContent;
    expect(note).toMatch(/not tuned/);
    expect(note).toMatch(/turbo, supercharger, nitrous/i);
  });

  it('on a factory engine, says the factory tables stay as they are', () => {
    launchBlank();
    goTo('BUILD');
    fireEvent.click(factoryEngine('Nissan VQ35HR'));
    expect(screen.getByText(/leaves the factory VE, spark and fuel tables as they are/)).toBeTruthy();
    expect(screen.queryByText(/Safe base map loaded/)).toBeNull();
  });
});

describe('SANDBOX across a reload', () => {
  it('keeps the engine on the bench and its tables', async () => {
    launchBlank();
    goTo('BUILD');
    fireEvent.click(factoryEngine('Nissan VQ35HR'));
    // The save is debounced; wait it out, then close the app and open it again.
    const settle = async (ms) => { await act(async () => {}); await act(() => new Promise((r) => setTimeout(r, ms))); };
    await settle(900);
    expect(localStorage.getItem('sandbox')).toBeTruthy();
    cleanup();
    launchBlank();
    await settle(50);
    expect(screen.getByTestId('build-line').textContent).toMatch(/^Nissan VQ35HR/);
  });
});
