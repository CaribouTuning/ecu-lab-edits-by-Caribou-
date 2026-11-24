// @vitest-environment jsdom
/**
 * The career's structure in the shop: the story's open chapter and its goal on Today and
 * Customers, how far the shop is towards it, and the walk-ins that practise it first.
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { ShopPanel } from '../../src/ui/career/ShopPanels.jsx';
import { board, newCareer } from '../../src/ui/career/shop.js';
import { CHAPTERS, chapterFocus, goalProgress, sagaOf } from '../../src/ui/career/story.js';

afterEach(cleanup);

const noop = () => {};
const panel = (career, tab) => render(
  <ShopPanel tab={tab} career={career} update={noop} onWork={noop} setTab={noop} takeJob={noop}
    setLesson={noop} confirmReset={false} setConfirmReset={noop} unseen={false} />,
);

describe('the story in the shop', () => {
  it('shows the open chapter, its goal and the progress towards it, on Today and on Customers', () => {
    const c = newCareer(1);
    for (const tab of ['today', 'customers']) {
      panel(c, tab);
      const goal = screen.getByRole('region', { name: 'Your goal' });
      expect(within(goal).getByText(`Chapter 1 of ${CHAPTERS.length} · ${CHAPTERS[0].title}`)).toBeTruthy();
      expect(within(goal).getByText(CHAPTERS[0].goal)).toBeTruthy();
      expect(within(goal).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
      cleanup();
    }
  });

  it('counts jobs done well and reputation towards the goals that are counts, and nothing for a course', () => {
    const c = newCareer(1);
    const at = (ch, extra = {}) => ({ ...c, ...extra, saga: { ...sagaOf(c), ch } });
    const pass = { verdict: 'pass' };
    expect(goalProgress(at(1, { history: [pass, pass] }))).toEqual({ have: 2, need: 3, unit: 'jobs done well' });
    const local = CHAPTERS.findIndex((ch) => ch.id === 'local');
    expect(goalProgress(at(local, { rep: 12 }))).toEqual({ have: 12, need: 20, unit: 'reputation' });
    const spark = CHAPTERS.findIndex((ch) => ch.id === 'spark');
    expect(goalProgress(at(spark))).toBeNull();
  });

  it('lists first, and marks, the walk-ins that practise the open chapter', () => {
    const c = newCareer(1);
    const focus = chapterFocus(c);
    panel(c, 'customers');
    const cards = [...document.querySelectorAll('section[aria-label]')].filter((el) => el.getAttribute('aria-label') !== 'Your goal');
    const marked = cards.map((el) => (el.textContent ?? '').includes('practises this chapter'));
    // Every marked card comes before every unmarked one.
    expect(marked.indexOf(false) === -1 || marked.lastIndexOf(true) < marked.indexOf(false)).toBe(true);
    const practising = board(c).filter((j) => j.template && focus.includes(j.template)).length;
    expect(marked.filter(Boolean)).toHaveLength(practising);
  });
});
