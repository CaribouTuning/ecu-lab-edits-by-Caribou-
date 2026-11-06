// @vitest-environment jsdom

/**
 * SANDBOX's first launch has no engine: the engine screens ask for one (prebuilt, or the
 * player's own specs) instead of showing a placeholder engine nobody chose.
 */

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import EcuLab from '../../src/ui/EcuLab.jsx';
import { enterSandbox, goTo, enterCareer, factoryEngine, customForm } from './nav.js';

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
  it('says so in the header and offers prebuilt engines and the spec form on every engine screen', () => {
    launchBlank();
    expect(screen.getByTestId('build-line').textContent).toMatch(/No engine chosen yet/);
    for (const tab of ['TUNE', 'LIVE', 'DYNO', 'BUILD']) {
      goTo(tab);
      expect(screen.getByTestId('engine-start')).toBeTruthy();
      expect(screen.queryByTestId('tuning-grid')).toBeNull();
    }
    expect(factoryEngine('Nissan VQ35DE Rev-Up')).toBeTruthy();
    expect(customForm()).toBeTruthy();
  });

  it('starts on a prebuilt engine in one click, with that engine named in the header', () => {
    launchBlank();
    goTo('BUILD');
    fireEvent.click(factoryEngine('Nissan VQ35HR'));
    expect(screen.queryByTestId('engine-start')).toBeNull();
    expect(screen.getByTestId('build-line').textContent).toMatch(/^Nissan VQ35HR/);
  });

  it('refuses a spec with missing or out-of-range figures and says which', () => {
    launchBlank();
    goTo('BUILD');
    const form = within(customForm());
    fireEvent.click(form.getByRole('button', { name: 'Create this engine' }));
    expect(form.getAllByRole('alert').length).toBeGreaterThanOrEqual(5);
    expect(screen.getByTestId('engine-start')).toBeTruthy();
    fireEvent.change(form.getByPlaceholderText('Cylinder diameter'), { target: { value: '400' } });
    fireEvent.click(form.getByRole('button', { name: 'Create this engine' }));
    expect(form.getByText(/^Between 75 and 105 mm\. Outside this range/)).toBeTruthy();
  });

  it('builds an engine from the player\'s own figures, showing its displacement first', () => {
    launchBlank();
    goTo('BUILD');
    const form = within(customForm());
    fireEvent.click(form.getByRole('button', { name: /^V8/ }));
    fireEvent.change(form.getByPlaceholderText('Cylinder diameter'), { target: { value: '96' } });
    fireEvent.change(form.getByPlaceholderText('Piston travel'), { target: { value: '92' } });
    fireEvent.change(form.getByPlaceholderText('Static, e.g. 10.5'), { target: { value: '10.1' } });
    fireEvent.change(form.getByPlaceholderText('Rev limit'), { target: { value: '6500' } });
    expect(form.getByTestId('spec-displacement').textContent).toMatch(/5\.33 L/);
    fireEvent.click(form.getByRole('button', { name: 'Create this engine' }));
    expect(screen.queryByTestId('engine-start')).toBeNull();
    expect(screen.getByTestId('build-line').textContent).toMatch(/^5\.3L V8/);
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
    const form = within(customForm());
    fireEvent.click(form.getByRole('button', { name: /^V6/ }));
    fireEvent.change(form.getByPlaceholderText('Cylinder diameter'), { target: { value: '95.5' } });
    fireEvent.change(form.getByPlaceholderText('Piston travel'), { target: { value: '81.4' } });
    fireEvent.change(form.getByPlaceholderText('Static, e.g. 10.5'), { target: { value: '10.3' } });
    fireEvent.change(form.getByPlaceholderText('Rev limit'), { target: { value: '7000' } });
    fireEvent.click(form.getByRole('button', { name: 'Create this engine' }));
    const note = () => screen.queryByText(/Assumed, not entered/)?.parentElement?.textContent ?? '';
    expect(note()).toMatch(/intake cam duration 210°.*valvetrain DOHC.*4 valves per cylinder.*aluminum block.*aluminum head/i);
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

describe('a practice mission with no engine chosen yet', () => {
  const openCourse = () => act(() => { window.location.hash = '#/course'; window.dispatchEvent(new window.HashChangeEvent('hashchange')); });

  it('puts the engine the missions were written around on the bench, from SANDBOX', () => {
    launchBlank();
    openCourse();
    fireEvent.click(screen.getByRole('button', { name: 'Start practice: Find the knock limit' }));
    expect(screen.queryByTestId('engine-start')).toBeNull();
    expect(screen.getByTestId('build-line').textContent).toMatch(/^Nissan VQ35DE Rev-Up/);
    expect(within(screen.getByRole('region', { name: 'Practice mission' })).getByText('0/4')).toBeTruthy();
  });

  it('does the same when started from CAREER, whose SANDBOX car is the one with no engine', async () => {
    window.location.hash = '';
    render(<EcuLab blankStart />);
    await enterCareer();
    openCourse();
    fireEvent.click(screen.getByRole('button', { name: 'Start practice: Your first pull' }));
    expect(screen.queryByTestId('engine-start')).toBeNull();
    expect(screen.getByTestId('build-line').textContent).toMatch(/^Nissan VQ35DE Rev-Up/);
  });
});

describe('the form refuses what the simulator cannot answer for, and says why', () => {
  it('a redline past 11,000 rpm', () => {
    launchBlank();
    goTo('BUILD');
    const form = within(customForm());
    fireEvent.change(form.getByPlaceholderText('Rev limit'), { target: { value: '11500' } });
    fireEvent.click(form.getByRole('button', { name: 'Create this engine' }));
    expect(form.getByText(/Between 4000 and 11000 rpm\. Past 11,000 rpm is racing-engine territory/)).toBeTruthy();
  });
});

describe('an engine put on the BUILD bench', () => {
  const onPart = () => within(screen.getByRole('navigation', { name: 'Engine parts' }))
    .getAllByRole('button').find((b) => b.getAttribute('aria-current') === 'true')?.textContent ?? '';
  const ownEngine = () => {
    const form = within(customForm());
    fireEvent.click(form.getByRole('button', { name: /^V6/ }));
    fireEvent.change(form.getByPlaceholderText('Cylinder diameter'), { target: { value: '95.5' } });
    fireEvent.change(form.getByPlaceholderText('Piston travel'), { target: { value: '81.4' } });
    fireEvent.change(form.getByPlaceholderText('Static, e.g. 10.5'), { target: { value: '10.3' } });
    fireEvent.change(form.getByPlaceholderText('Rev limit'), { target: { value: '7000' } });
    fireEvent.click(form.getByRole('button', { name: 'Create this engine' }));
  };

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
