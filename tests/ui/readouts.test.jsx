// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { Bar } from '../../src/ui/primitives/Bar.jsx';
import { StatTile } from '../../src/ui/primitives/StatTile.jsx';
import tileStyles from '../../src/ui/primitives/StatTile.module.css';

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
});
