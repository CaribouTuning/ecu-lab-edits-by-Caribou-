// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Bar } from '../../src/ui/primitives/Bar.jsx';
import { StatTile } from '../../src/ui/primitives/StatTile.jsx';
import tileStyles from '../../src/ui/primitives/StatTile.module.css';

// This file's queries rely on `screen` being scoped to the current test's render;
// without this, meters from earlier tests accumulate in the DOM and unscoped
// role/name queries start matching more than one element. Matches the pattern
// already used in Button.test.jsx and surfaces.test.jsx.
afterEach(cleanup);

describe('StatTile', () => {
  it('renders label, value and unit', () => {
    render(<StatTile label="PEAK HP" value={412} unit="whp" />);
    expect(screen.getByText('PEAK HP')).toBeTruthy();
    expect(screen.getByText('412')).toBeTruthy();
    expect(screen.getByText('whp')).toBeTruthy();
  });

  it('omits the unit element entirely when no unit is given', () => {
    const { container } = render(<StatTile label="PULLS" value={7} />);
    expect(container.querySelector(`.${tileStyles.unit}`)).toBeNull();
  });

  it('applies the tone it is given', () => {
    const { container } = render(<StatTile label="KNOCK" value="0.4" tone="warn" />);
    expect(container.querySelector(`.${tileStyles.warn}`)).toBeTruthy();
  });
});

describe('Bar', () => {
  it('exposes itself as a meter with its current value', () => {
    render(<Bar label="Pistons" value={86} />);
    const meter = screen.getByRole('meter');
    expect(meter.getAttribute('aria-valuenow')).toBe('86');
    expect(meter.getAttribute('aria-valuemin')).toBe('0');
    expect(meter.getAttribute('aria-valuemax')).toBe('100');
  });

  it('names the meter after its label', () => {
    render(<Bar label="Bearings" value={71} />);
    expect(screen.getByRole('meter', { name: 'Bearings' })).toBeTruthy();
  });

  it('scales the fill to the percentage of max', () => {
    const { container } = render(<Bar label="Duty" value={40} max={80} />);
    const fill = /** @type {HTMLElement} */ (container.querySelector('[data-fill]'));
    expect(fill.style.width).toBe('50%');
  });

  it('clamps a value above max instead of overflowing the track', () => {
    const { container } = render(<Bar label="Duty" value={150} max={100} />);
    const fill = /** @type {HTMLElement} */ (container.querySelector('[data-fill]'));
    expect(fill.style.width).toBe('100%');
  });

  it('clamps a negative value to zero', () => {
    const { container } = render(<Bar label="Duty" value={-20} max={100} />);
    const fill = /** @type {HTMLElement} */ (container.querySelector('[data-fill]'));
    expect(fill.style.width).toBe('0%');
  });

  it('never announces a value outside its own declared range', () => {
    // A meter whose aria-valuenow exceeds aria-valuemax is invalid ARIA, and it
    // means the announced reading disagrees with the bar a sighted user sees.
    render(<Bar label="Duty" value={150} max={100} />);
    const meter = screen.getByRole('meter');
    expect(meter.getAttribute('aria-valuenow')).toBe('100');
  });

  it('never announces a value below zero', () => {
    render(<Bar label="Duty" value={-20} max={100} />);
    expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('0');
  });

  it('reads a high value as healthy by default', () => {
    render(<Bar label="Pistons" value={95} max={100} />);
    expect(screen.getByRole('meter')).toBeTruthy();
    expect(screen.getByText('95%')).toBeTruthy();
  });

  it('inverts the scale when a high value is the dangerous end', () => {
    // 95% injector duty is a build about to lean out, not a healthy one. Without
    // higherIsBetter={false} this renders green at exactly the wrong moment.
    const { container } = render(<Bar label="Duty" value={95} max={100} higherIsBetter={false} />);
    const healthy = render(<Bar label="Pistons" value={95} max={100} />);
    const dutyFill = /** @type {HTMLElement} */ (container.querySelector('[data-fill]'));
    const healthFill = /** @type {HTMLElement} */ (healthy.container.querySelector('[data-fill]'));
    expect(dutyFill.style.background).not.toBe(healthFill.style.background);
  });
});
