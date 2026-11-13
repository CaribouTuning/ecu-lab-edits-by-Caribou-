// @vitest-environment jsdom
/**
 * The Learn app as pages, and CAREER's Messages as a conversation with Pops.
 *
 * Learn: one page at a time, every article on exactly one page, the page turning to the
 * next. Messages: one thread, Pops's messages oldest first with his lessons in it, your
 * replies on the right, and opening it reads everything.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LearnApp } from '../../src/ui/desk/LearnApp.jsx';
import { MessagesApp } from '../../src/ui/desk/MessagesApp.jsx';
import { LEARN_PAGES } from '../../src/ui/screens/dash/learnShelf.jsx';
import { newCareer } from '../../src/ui/career/shop.js';
import { CHAPTERS, sagaOf, unreadCount } from '../../src/ui/career/story.js';

afterEach(cleanup);

describe('the Learn app', () => {
  it('opens on its first page, and lists every page', () => {
    render(<LearnApp shelf={null} onShelf={() => {}} />);
    const tabs = screen.getByRole('navigation', { name: 'Learn pages' });
    expect(within(tabs).getAllByRole('button').map((b) => b.textContent)).toEqual(LEARN_PAGES.map((p) => p.name));
    expect(screen.getByRole('heading', { level: 2, name: 'Start here' })).toBeTruthy();
    expect(screen.getByText(`Page 1 of ${LEARN_PAGES.length}`)).toBeTruthy();
  });

  it('shows each article on its own page and nowhere else', () => {
    const seen = new Map();
    for (const page of LEARN_PAGES) {
      const { unmount } = render(<LearnApp shelf={page.id} onShelf={() => {}} />);
      // The page's articles: its open sections, not the regions inside them.
      const titles = [...document.querySelectorAll('section[data-article]')].map((r) => r.getAttribute('aria-label'));
      expect(titles.length, page.id).toBe(page.articles.length);
      for (const t of titles) {
        expect(seen.has(t), `${t} on ${seen.get(t)} and ${page.id}`).toBe(false);
        seen.set(t, page.id);
      }
      unmount();
    }
    // Every numbered article, and the symbol key.
    expect(seen.size).toBe(43);
  });

  it('turns to the next page, and the last page has no next', () => {
    const onShelf = vi.fn();
    render(<LearnApp shelf="air" onShelf={onShelf} />);
    fireEvent.click(screen.getByRole('button', { name: /Next Fuel/ }));
    expect(onShelf).toHaveBeenCalledWith('fuel');
    cleanup();
    render(<LearnApp shelf={LEARN_PAGES.at(-1).id} onShelf={() => {}} />);
    expect(screen.queryByRole('button', { name: /^Next/ })).toBeNull();
  });
});

describe('Messages, as a conversation with Pops', () => {
  const finishedFirst = () => {
    const c = newCareer(1);
    return { ...c, saga: { ...sagaOf(c), ch: 1 } };
  };

  it('is one thread: Pops’s messages oldest first, his lesson as a card, and your answer on the right', () => {
    const c = finishedFirst();
    render(<MessagesApp career={c} update={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /^Pops/ }));
    const thread = screen.getByRole('region', { name: 'Conversation with Pops' });
    const text = thread.textContent ?? '';
    // The dividers, in order: chapter 1, chapter 2, then today's tip.
    expect(within(thread).getAllByText(/^(Chapter \d+ ·|Today$)/).map((d) => d.textContent?.split(' ·')[0])).toEqual(['Chapter 1', 'Chapter 2', 'Today']);
    expect(within(thread).getAllByText('What Ray taught me').length).toBeGreaterThanOrEqual(2);
    expect(within(thread).getByText(CHAPTERS[0].lesson.title)).toBeTruthy();
    expect(within(thread).getByText('Thanks Pops. On to the next one.')).toBeTruthy();
    // Nothing in it sends you to a course that is not there.
    expect(text).not.toMatch(/Tuning Course/);
  });

  it('reads everything when the thread is opened', () => {
    const c = newCareer(1);
    expect(unreadCount(c)).toBeGreaterThan(0);
    const update = vi.fn();
    render(<MessagesApp career={c} update={update} />);
    fireEvent.click(screen.getByRole('button', { name: /^Pops/ }));
    const next = update.mock.calls.at(-1)?.[0];
    expect(unreadCount(next)).toBe(0);
  });
});
