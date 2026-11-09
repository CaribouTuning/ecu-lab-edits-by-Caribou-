// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StartScreen } from '../../src/ui/screens/StartScreen.jsx';

afterEach(cleanup);

describe('StartScreen', () => {
  /** @param {Record<string, () => void>} on */
  const start = (on = {}) => render(
    <StartScreen
      onCareer={on.onCareer ?? (() => {})}
      onStart={on.onStart ?? (() => {})}
      onTutorial={on.onTutorial ?? (() => {})}
      version="v1.4.0"
    />,
  );

  it('opens the job board', () => {
    const onCareer = vi.fn();
    start({ onCareer });
    fireEvent.click(screen.getByRole('button', { name: 'CAREER' }));
    expect(onCareer).toHaveBeenCalledTimes(1);
  });

  it('opens the sandbox', () => {
    const onStart = vi.fn();
    start({ onStart });
    fireEvent.click(screen.getByRole('button', { name: 'SANDBOX' }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('opens the tutorial', () => {
    const onTutorial = vi.fn();
    start({ onTutorial });
    fireEvent.click(screen.getByRole('button', { name: 'TUTORIAL' }));
    expect(onTutorial).toHaveBeenCalledTimes(1);
  });

  it('says what each way in is for, so the first choice is not a guess', () => {
    start();
    expect(screen.getByText('Run a tuning shop: customers, real faults, your reputation')).toBeTruthy();
    expect(screen.getByText('Build and tune anything, no objectives')).toBeTruthy();
  });

  it('shows the build version', () => {
    start();
    expect(screen.getByText('v1.4.0')).toBeTruthy();
  });
});

// TutorialScreen has its own file now: tests/ui/tutorial.test.jsx.

describe('StartScreen keeps main\'s look', () => {
  it('opts out of the shop\'s sketch styles and carries the gauge', () => {
    render(<StartScreen onCareer={() => {}} onStart={() => {}} onTutorial={() => {}} version="v1" dial={<svg data-testid="dial" />} />);
    // data-plain lets the glow show; data-keep-tracking keeps the tracked capitals.
    expect(document.querySelector('[data-plain]')).toBeTruthy();
    expect(screen.getByRole('heading').hasAttribute('data-keep-tracking')).toBe(true);
    for (const name of ['CAREER', 'SANDBOX', 'TUTORIAL']) {
      const b = screen.getByRole('button', { name });
      expect(b.hasAttribute('data-keep-tracking')).toBe(true);
      expect(b.className).not.toMatch(/ink-frame/);
    }
    expect(screen.getByTestId('dial')).toBeTruthy();
  });
});
