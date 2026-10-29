/**
 * The career's story (src/ui/career/story.js): a line of chapters Pops sends by email,
 * each closed by a goal the game already has. What matters: it moves on only when a goal
 * is really met, it never moves on twice for one change, it ends, and every lesson says
 * where it comes from.
 */

import { describe, expect, it } from 'vitest';

import { newCareer } from '../src/ui/career/shop.js';
import { CHAPTERS, advanceSaga, isMaster, messagesFor, openChapter, readMessage, sagaOf, unreadCount } from '../src/ui/career/story.js';
import { CHAPTERS as COURSE } from '../src/ui/tutorial/lessons.jsx';

/** @returns {any[]} */
const pass = (n) => Array.from({ length: n }, (_, i) => ({ jobId: `j${i}`, verdict: 'pass', paid: 100, repChange: 1, boosted: false, peakHp: 200 }));
/** A save built by hand for a test. @param {object} o @returns {any} */
const save = (o) => ({ ...newCareer(1), ...o });

describe('the story', () => {
  it('opens on the first chapter, with an email and the day’s tip unread', () => {
    const c = newCareer(1);
    expect(openChapter(c)?.id).toBe('keys');
    const msgs = messagesFor(c);
    expect(msgs.some((m) => m.id === 'mail:keys' && m.kind === 'email')).toBe(true);
    expect(msgs.some((m) => m.id.startsWith('tip:'))).toBe(true);
    expect(unreadCount(c)).toBe(2);
  });

  it('does not move until a goal is met, and returns the same save when nothing changes', () => {
    const c = newCareer(1);
    expect(advanceSaga(c)).toBe(c);
  });

  it('closes a met chapter, pays its reward, opens the next, and sends a text', () => {
    const c = save({ history: pass(1) });
    const next = advanceSaga(c);
    expect(sagaOf(next).ch).toBe(1);
    expect(next.money).toBe(c.money + CHAPTERS[0].reward);
    expect(messagesFor(next).some((m) => m.id === 'text:keys')).toBe(true);
    expect(advanceSaga(next)).toBe(next);
  });

  it('runs to the end and makes you a master tuner', () => {
    const c = save({
      history: [...pass(10), { ...pass(1)[0], jobId: 'built', built: true }], trained: ['spark', 'knock', 'boost'], rep: 300,
    });
    const done = advanceSaga(c);
    expect(isMaster(done)).toBe(true);
    expect(openChapter(done)).toBeNull();
    expect(done.money).toBe(c.money + CHAPTERS.reduce((t, ch) => t + ch.reward, 0));
  });

  it('marks a message read, once', () => {
    const c = newCareer(1);
    const tip = messagesFor(c).find((m) => m.id.startsWith('tip:'));
    const r = readMessage(c, tip.id);
    expect(sagaOf(r).read).toContain(tip.id);
    expect(readMessage(r, tip.id)).toBe(r);
  });

  it('survives a save with a broken story field', () => {
    const c = save({ saga: { ch: 'x', read: 3 } });
    expect(sagaOf(c)).toEqual({ ch: 0, read: [], done: false });
    expect(() => messagesFor(c)).not.toThrow();
  });

  it('teaches from real sources: every lesson names where it comes from, and its course lesson exists', () => {
    const lessonIds = COURSE.flatMap((p) => p.lessons.map((l) => l.id));
    for (const ch of CHAPTERS) {
      expect(ch.lesson.sources.length, ch.id).toBeGreaterThan(0);
      if (ch.lesson.course) expect(lessonIds, ch.id).toContain(ch.lesson.course);
    }
  });
});
