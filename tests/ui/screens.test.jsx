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
    fireEvent.click(screen.getByRole('button', { name: /^Career/ }));
    expect(onCareer).toHaveBeenCalledTimes(1);
  });

  it('opens the sandbox', () => {
    const onStart = vi.fn();
    start({ onStart });
    fireEvent.click(screen.getByRole('button', { name: /^Sandbox/ }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('opens the tutorial', () => {
    const onTutorial = vi.fn();
    start({ onTutorial });
    fireEvent.click(screen.getByRole('button', { name: /^Tutorial/ }));
    expect(onTutorial).toHaveBeenCalledTimes(1);
  });

  it('says what each way in is for, so the first choice is not a guess', () => {
    start();
    expect(screen.getByText('Run a tuning shop: customers, real faults, your reputation.')).toBeTruthy();
    expect(screen.getByText('Build any engine and tune it. No objectives.')).toBeTruthy();
  });

  it('shows the build version', () => {
    start();
    expect(screen.getByText(/Version 1\.4\.0/)).toBeTruthy();
  });
});

// TutorialScreen has its own file now: tests/ui/tutorial.test.jsx.

describe('StartScreen keeps main\'s look', () => {
  it('opts out of the shop\'s sketch styles, and reads as a welcome window: the badge, the name, the ways in', () => {
    render(<StartScreen onCareer={() => {}} onStart={() => {}} onTutorial={() => {}} version="v1.2.3" />);
    expect(document.querySelector('[data-plain]')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'ECU Lab' })).toBeTruthy();
    expect(screen.getByText(/Version 1\.2\.3/)).toBeTruthy();
    for (const name of [/^Career/, /^Sandbox/, /^Tutorial/]) {
      const b = screen.getByRole('button', { name });
      expect(b.className).not.toMatch(/ink-frame/);
    }
    // The first way in is the one to take.
    expect(screen.getByRole('button', { name: /^Career/ }).getAttribute('data-primary')).toBe('true');
  });
});
