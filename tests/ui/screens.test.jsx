// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StartScreen } from '../../src/ui/screens/StartScreen.jsx';
import { TutorialScreen } from '../../src/ui/screens/TutorialScreen.jsx';

afterEach(cleanup);

const STEPS = [
  { title: 'This is an air pump', body: 'Everything starts with airflow.' },
  { title: 'Design it on BUILD', body: 'None of it is cosmetic.' },
];

describe('StartScreen', () => {
  it('starts the app', () => {
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} onTutorial={() => {}} version="v1.4.0" />);
    fireEvent.click(screen.getByRole('button', { name: 'START' }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('opens the tutorial', () => {
    const onTutorial = vi.fn();
    render(<StartScreen onStart={() => {}} onTutorial={onTutorial} version="v1.4.0" />);
    fireEvent.click(screen.getByRole('button', { name: 'TUTORIAL' }));
    expect(onTutorial).toHaveBeenCalledTimes(1);
  });

  it('shows the build version', () => {
    render(<StartScreen onStart={() => {}} onTutorial={() => {}} version="v1.4.0" />);
    expect(screen.getByText('v1.4.0')).toBeTruthy();
  });
});

describe('TutorialScreen', () => {
  it('opens on the first step', () => {
    render(<TutorialScreen steps={STEPS} onDone={() => {}} />);
    expect(screen.getByText('This is an air pump')).toBeTruthy();
  });

  it('advances to the next step', () => {
    render(<TutorialScreen steps={STEPS} onDone={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'NEXT' }));
    expect(screen.getByText('Design it on BUILD')).toBeTruthy();
  });

  it('offers no BACK on the first step', () => {
    render(<TutorialScreen steps={STEPS} onDone={() => {}} />);
    expect(screen.queryByRole('button', { name: 'BACK' })).toBeNull();
  });

  it('goes back', () => {
    render(<TutorialScreen steps={STEPS} onDone={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'NEXT' }));
    fireEvent.click(screen.getByRole('button', { name: 'BACK' }));
    expect(screen.getByText('This is an air pump')).toBeTruthy();
  });

  it('finishes from the last step', () => {
    const onDone = vi.fn();
    render(<TutorialScreen steps={STEPS} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'NEXT' }));
    fireEvent.click(screen.getByRole('button', { name: 'START TUNING' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('skips out at any point', () => {
    const onDone = vi.fn();
    render(<TutorialScreen steps={STEPS} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'SKIP' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('reports progress through the steps', () => {
    render(<TutorialScreen steps={STEPS} onDone={() => {}} />);
    expect(screen.getByText('TUTORIAL · 1/2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'NEXT' }));
    expect(screen.getByText('TUTORIAL · 2/2')).toBeTruthy();
  });
});
