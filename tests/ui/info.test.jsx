// @vitest-environment jsdom

/**
 * Progressive disclosure: a long explanation is folded behind a 16 px info button, never
 * removed. It opens in place on a tap and closes on the next.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Info } from '../../src/ui/primitives/Info.jsx';

afterEach(cleanup);

describe('Info', () => {
  it('keeps the line in sight, and opens and closes its explanation in place', () => {
    render(<Info label="About the faded cells" text="Faded cells are above the boost this engine makes."><span>Faded: past what the engine reaches</span></Info>);
    expect(screen.getByText('Faded: past what the engine reaches')).toBeTruthy();
    const button = screen.getByRole('button', { name: 'About the faded cells' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(/above the boost/)).toBeNull();
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(/above the boost/).id).toBe(button.getAttribute('aria-controls'));
    fireEvent.click(button);
    expect(screen.queryByText(/above the boost/)).toBeNull();
  });
});
