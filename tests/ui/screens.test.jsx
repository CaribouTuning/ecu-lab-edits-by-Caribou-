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
    fireEvent.click(screen.getByRole('button', { name: 'Career' }));
    expect(onCareer).toHaveBeenCalledTimes(1);
  });

  it('opens the sandbox', () => {
    const onStart = vi.fn();
    start({ onStart });
    fireEvent.click(screen.getByRole('button', { name: 'Sandbox' }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('opens the tutorial', () => {
    const onTutorial = vi.fn();
    start({ onTutorial });
    fireEvent.click(screen.getByRole('button', { name: 'Tutorial' }));
    expect(onTutorial).toHaveBeenCalledTimes(1);
  });

  it('says what each way in is for, so the first choice is not a guess', () => {
    start();
    // Each button's description is what it does, read out after its name.
    expect(screen.getByRole('button', { name: 'Career' }).getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Career', description: /Run a tuning shop/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sandbox', description: /every tool and no customers/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tutorial', description: /a dyno pull/ })).toBeTruthy();
  });

  it('marks the career as the way to start', () => {
    start();
    expect(screen.getByText('Start here')).toBeTruthy();
    expect(screen.getByText('Open the shop')).toBeTruthy();
  });

  it('shows the build version', () => {
    start();
    expect(screen.getByText('v1.4.0')).toBeTruthy();
  });
});

// TutorialScreen has its own file now: tests/ui/tutorial.test.jsx.
