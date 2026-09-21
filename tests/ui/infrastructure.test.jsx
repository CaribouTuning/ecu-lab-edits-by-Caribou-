// @vitest-environment jsdom

/**
 * Proves the component-test setup itself works before any primitive depends on it:
 * jsdom provides a document, React renders into it, and @testing-library queries it.
 *
 * CSS Module resolution is proven by the Button test in Task 5, which is the first
 * file that actually imports a stylesheet — this task must not depend on a file a
 * later task creates, or it cannot end green.
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

describe('component test infrastructure', () => {
  it('provides a DOM', () => {
    expect(typeof document).toBe('object');
  });

  it('renders React into jsdom', () => {
    render(<button type="button">RUN DYNO PULL</button>);
    expect(screen.getByRole('button', { name: 'RUN DYNO PULL' })).toBeTruthy();
  });
});
