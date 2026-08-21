// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Bar } from '../../src/ui/primitives/Bar.jsx';
import { StatTile } from '../../src/ui/primitives/StatTile.jsx';
import tileStyles from '../../src/ui/primitives/StatTile.module.css';
import { tokens } from '../../src/ui/tokens.js';

// This file's queries rely on `screen` being scoped to the current test's render;
// without this, meters from earlier tests accumulate in the DOM and unscoped
// role/name queries start matching more than one element. Matches the pattern
// already used in Button.test.jsx and surfaces.test.jsx.
afterEach(cleanup);

// WCAG relative-luminance contrast ratio between two hex colours. There is no
// contrast helper anywhere in this repo — every contrast finding so far (including
// the two fixed in this PR) was caught by a human reading a diff.
function contrast(hexA, hexB) {
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const [R, G, B] = [r, g, b].map(lin);
    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
  };
  const [l1, l2] = [luminance(hexA), luminance(hexB)];
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

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

  it('gives the alt tone its own class, distinct from the partner it sits beside', () => {
    // `alt` marks the second quantity in a paired readout — torque beside power. If it
    // resolved to the same colour as its partner the pairing would be invisible, which
    // is the whole reason the tone exists.
    const { container } = render(<StatTile label="PEAK TQ" value={300} tone="alt" />);
    expect(container.querySelector(`.${tileStyles.alt}`)).toBeTruthy();
    expect(container.querySelector(`.${tileStyles.acc}`)).toBeNull();
  });

  it('keeps the label readable on the surface it sits on', () => {
    // ~9.5px is small text: WCAG AA wants 4.5:1. This failed at 2.87:1 with --ink3,
    // which is a hierarchy token, not a legibility one.
    expect(Number(contrast(tokens.ink2, tokens.panel2))).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the acc value at the brightness every call site already relied on', () => {
    // Every acc call site passes T.accInk today. --acc alone only clears 5.86:1 —
    // still AA for 24px large text, but a needless dim from the 8.69:1 callers expect,
    // and it spends the interactive accent on something that isn't interactive.
    expect(Number(contrast(tokens.accInk, tokens.panel2))).toBeGreaterThanOrEqual(
      Number(contrast(tokens.acc, tokens.panel2)),
    );
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

  it('reads an ordinary duty cycle as healthy, not as an alarm', () => {
    // 60% injector duty is a comfortably sized injector, not a warning. Mirroring the
    // health bands used to paint everything above 45% red, which is what this pins.
    const { container } = render(<Bar label="Duty" value={60} max={100} higherIsBetter={false} />);
    const healthy = render(<Bar label="Pistons" value={95} max={100} />);
    const dutyFill = /** @type {HTMLElement} */ (container.querySelector('[data-fill]'));
    const healthFill = /** @type {HTMLElement} */ (healthy.container.querySelector('[data-fill]'));
    expect(dutyFill.style.background).toBe(healthFill.style.background);
  });

  it('reads a duty cycle with no headroom left as dangerous', () => {
    const { container } = render(<Bar label="Duty" value={95} max={100} higherIsBetter={false} />);
    const failing = render(<Bar label="Pistons" value={20} max={100} />);
    const dutyFill = /** @type {HTMLElement} */ (container.querySelector('[data-fill]'));
    const failingFill = /** @type {HTMLElement} */ (failing.container.querySelector('[data-fill]'));
    expect(dutyFill.style.background).toBe(failingFill.style.background);
  });
});
