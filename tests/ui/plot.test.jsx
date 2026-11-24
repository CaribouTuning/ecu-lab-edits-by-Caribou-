// @vitest-environment jsdom

/**
 * Plot.jsx: every trace on the Physics page is read against numbered axes, named
 * quantities with units and a legend. A line with nothing to read it against is the
 * thing a phone player could not understand.
 */

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Plot, crankTicks, niceTicks } from '../../src/ui/desk/Plot.jsx';

afterEach(cleanup);

describe('Plot', () => {
  it('titles the figure, names both axes with their units, numbers them and keys every trace', () => {
    render(
      <Plot title="Intake port pressure" sub="cylinder 1" xLabel="crank angle, ° from overlap TDC" yLabel="pressure, kPa (abs)"
        xDomain={[-200, 200]} yDomain={[80, 120]} xTicks={crankTicks(-200, 200, (d) => (d === 0 ? 'TDC' : ''))} ariaLabel="trace"
        legend={[{ label: 'port pressure', kind: 'line', tone: 'red' }, { label: 'plenum pressure', kind: 'dash', tone: 'blue' }]}>
        {({ x, y }) => <line x1={x(-200)} x2={x(200)} y1={y(100)} y2={y(100)} />}
      </Plot>,
    );
    expect(screen.getByText('Intake port pressure')).toBeTruthy();
    expect(screen.getByText('crank angle, ° from overlap TDC')).toBeTruthy();
    expect(screen.getByText('pressure, kPa (abs)')).toBeTruthy();
    for (const t of ['80', '90', '100', '110', '120', 'TDC', '-90°', '90°']) expect(screen.getByText(t)).toBeTruthy();
    expect(screen.getByText('port pressure')).toBeTruthy();
    expect(screen.getByText('plenum pressure')).toBeTruthy();
  });
});

describe('ticks', () => {
  it('niceTicks steps by 1, 2 or 5 times a power of ten', () => {
    expect(niceTicks(0, 260, 4)).toEqual([0, 100, 200]);
    expect(niceTicks(98.3, 112.4, 4)).toEqual([100, 105, 110]);
  });

  it('crankTicks marks every 90°, naming the dead centres', () => {
    const dead = (d) => (d === 0 ? 'TDC' : Math.abs(d) === 180 ? 'BDC' : '');
    expect(crankTicks(-230, 230, dead).map((t) => t.label)).toEqual(['BDC', '-90°', 'TDC', '90°', 'BDC']);
  });
});
