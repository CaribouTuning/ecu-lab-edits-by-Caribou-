// @vitest-environment jsdom

/**
 * Button tests.
 *
 * The `block` assertions are the point of this component: the pre-overhaul UI made
 * every action full-width, which is why a primary button spanned a 27-inch monitor.
 * Full-width is now opt-in.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button } from '../../src/ui/primitives/Button.jsx';
import styles from '../../src/ui/primitives/Button.module.css';

afterEach(cleanup);

describe('Button', () => {
  it('renders a real button element with its label', () => {
    render(<Button>RUN DYNO PULL</Button>);
    const el = screen.getByRole('button', { name: 'RUN DYNO PULL' });
    expect(el.tagName).toBe('BUTTON');
  });

  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>RESET</Button>);
    expect(screen.getByRole('button').getAttribute('type')).toBe('button');
  });

  it('is not full-width unless asked', () => {
    render(<Button>RESET</Button>);
    expect(screen.getByRole('button').className).not.toContain(styles.block);
  });

  it('is full-width when block is set', () => {
    render(<Button block>RUN DYNO PULL</Button>);
    expect(screen.getByRole('button').className).toContain(styles.block);
  });

  it('applies the primary variant by default', () => {
    render(<Button>GO</Button>);
    expect(screen.getByRole('button').className).toContain(styles.primary);
  });

  it('applies the variant it is given', () => {
    render(<Button variant="danger">RESET ENGINE</Button>);
    expect(screen.getByRole('button').className).toContain(styles.danger);
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>GO</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick when disabled', () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>GO</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('passes unknown props through to the element', () => {
    render(<Button aria-label="Run a dyno pull">GO</Button>);
    expect(screen.getByLabelText('Run a dyno pull')).toBeTruthy();
  });
});
