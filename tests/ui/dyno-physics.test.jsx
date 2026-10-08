// @vitest-environment jsdom

/**
 * DYNO's physics view (src/ui/screens/dyno/DynoPhysics.jsx): it opens from its own
 * button, shows the working of the pull's peak-power point (or, while the pull runs, the
 * point the chart has just drawn), steps to any other point, and says so when a pull's
 * inputs are not at hand to solve it again.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { DynoPhysics } from '../../src/ui/screens/dyno/DynoPhysics.jsx';
import { StoreProvider, useSession } from '../../src/ui/state/StoreProvider.jsx';

import { makeEngine } from '../ecuHarness.js';

afterEach(cleanup);

const eng = makeEngine({ preset: 'vq35hr' });
const pull = eng.pull(100);
const asked = [];
const tracePoint = (result, rpm) => {
  asked.push(rpm);
  return result === pull ? eng.pull(100, { traceRpm: rpm }).points.find((p) => p.rpm === rpm) : null;
};

function mount(props) {
  /** @type {any} */
  const ref = {};
  const Capture = () => { [ref.session] = useSession(); return null; };
  render(
    <StoreProvider>
      <Capture />
      <DynoPhysics result={pull} running={false} revealCount={pull.points.length} tracePoint={tracePoint} engineDerived={eng.derived} {...props} />
    </StoreProvider>,
  );
  return ref;
}

describe('DYNO\'s physics view', () => {
  it('opens on the peak-power point with the pull\'s own numbers, steps, and closes', () => {
    const ref = mount();
    fireEvent.click(screen.getByRole('button', { name: 'SHOW THE PHYSICS' }));
    expect(ref.session.dynoPhysicsOpen).toBe(true);
    const peak = pull.points.reduce((a, p) => (p.hp > a.hp ? p : a));
    expect(asked.at(-1)).toBe(peak.rpm);
    for (const title of ['1 · Air into each cylinder', '2 · Fuel', '3 · Inside the cylinder', '4 · Knock check', '5 · Work and losses', '6 · On the dyno']) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    expect(screen.getAllByRole('img').length).toBe(3);
    expect(document.body.textContent).toContain(`${peak.hp} whp`);
    expect(document.body.textContent).toContain(`${peak.rpm} rpm · point`);
    fireEvent.click(screen.getByRole('button', { name: 'Previous point' }));
    const before = pull.points[pull.points.indexOf(peak) - 1];
    expect(asked.at(-1)).toBe(before.rpm);
    expect(document.body.textContent).toContain(`${before.hp} whp`);
    fireEvent.change(screen.getByRole('slider', { name: 'Point of the pull' }), { target: { value: '0' } });
    expect(asked.at(-1)).toBe(pull.points[0].rpm);
    fireEvent.click(screen.getByRole('button', { name: 'HIDE' }));
    expect(ref.session.dynoPhysicsOpen).toBe(false);
  });

  it('follows the point the chart has just drawn while the pull runs', () => {
    mount({ running: true, revealCount: 5 });
    fireEvent.click(screen.getByRole('button', { name: 'SHOW THE PHYSICS' }));
    expect(asked.at(-1)).toBe(pull.points[4].rpm);
    expect(document.body.textContent).toContain('following the pull');
  });

  it('says so when the pull on the chart cannot be solved again', () => {
    mount({ result: { ...pull } });
    fireEvent.click(screen.getByRole('button', { name: 'SHOW THE PHYSICS' }));
    expect(screen.getByText(/restored from history/)).toBeTruthy();
  });
});

