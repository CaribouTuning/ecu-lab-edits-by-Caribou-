// @vitest-environment jsdom

/**
 * The TUNE pages' navigation. The page tabs draw their own open state, so they opt out of
 * the app's global "selected" chip (`data-plain`); the map slots beside them must not,
 * or the running map looks like the idle ones (it did, once, when the opt-out was put on
 * the whole nav).
 */

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import EcuLab from '../../src/ui/EcuLab.jsx';
import { enterSandbox, goTo } from './nav.js';

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
const hadResizeObserver = 'ResizeObserver' in window;
if (!hadResizeObserver) window.ResizeObserver = ResizeObserverStub;
afterEach(cleanup);

describe('the TUNE navigation', () => {
  it('lets the map slots keep the selection style while the page tabs draw their own', () => {
    render(<EcuLab />);
    enterSandbox();
    goTo('TUNE');
    const nav = screen.getByRole('navigation', { name: 'ECU tables' });
    const tabs = nav.querySelector('[data-plain]');
    expect(tabs, 'the page tabs opt out').not.toBeNull();
    const running = screen.getByRole('button', { name: /^Map 1, running/ });
    expect(running.getAttribute('aria-pressed')).toBe('true');
    expect(running.closest('[data-plain]'), 'a map slot is inside an opt-out').toBeNull();
    expect(tabs?.querySelector('[aria-current="page"]'), 'the open page is among the tabs').not.toBeNull();
  });
});
