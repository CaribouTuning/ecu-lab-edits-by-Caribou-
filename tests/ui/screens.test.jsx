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
    expect(screen.getByText(/^Run a tuning shop in town/)).toBeTruthy();
    expect(screen.getByText(/^Your laptop and your shop/)).toBeTruthy();
    // The caption describes the button; the button's name stays its one word.
    expect(screen.getByRole('button', { name: 'Career' }).getAttribute('aria-describedby')).toBe('way-career');
  });

  it('shows the stock engine\'s own pull, run by the simulator, not a picture', async () => {
    start();
    const sheet = await screen.findByRole('img', { name: /^Dyno sheet: \d+ wheel horsepower at \d+ rpm/ }, { timeout: 20000 });
    expect(sheet.querySelectorAll('polyline')).toHaveLength(2);
  }, 30000);

  it('shows the build version', () => {
    start();
    expect(screen.getByText('v1.4.0')).toBeTruthy();
  });
});

// TutorialScreen has its own file now: tests/ui/tutorial.test.jsx.
