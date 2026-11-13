/**
 * CAREER's Messages app: your conversation with Pops, drawn the way iMessage draws one.
 *
 * The conversation list (one thread, Pops) and the thread itself; on a phone one at a time,
 * side by side where there is room. Everything Pops sends is in the one thread, oldest at
 * the top: a chapter opens with what he has to say, in bubbles, then what Ray taught him as a
 * card (as iMessage shows a link), then the goal; a text closes the chapter, and you answer
 * it. The day's tip arrives last. Opening the thread reads it all.
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { CHAPTERS, messagesFor, openChapter, readMessage, sagaOf } from '../career/story.js';

import styles from './Apps.module.css';

/** What you texted back: a thank-you for a chapter's reward, a nod to the day's tip. @param {{id: string}} m */
const reply = (m) => (m.id.startsWith('tip:') ? 'Got it, thanks Pops.' : 'Thanks Pops. On to the next one.');

/** The divider above a message: the chapter it belongs to, or today for the tip. @param {{id: string, order: number}} m */
const divider = (m) => {
  if (m.id.startsWith('tip:')) return 'Today';
  const ch = CHAPTERS[Math.floor(m.order / 10)];
  return `Chapter ${Math.floor(m.order / 10) + 1} · ${ch?.title ?? ''}`;
};

/** Pops's picture: his initial on a grey disc, as iOS draws a contact with no photo. @param {{size?: number}} props */
function Avatar({ size = 40 }) {
  return <span className={styles.avatar} style={{ width: size, height: size, fontSize: size * 0.45 }} aria-hidden="true">P</span>;
}

/** Whether the conversation list and the thread fit side by side. */
const wide = () => typeof window !== 'undefined' && !!window.matchMedia?.('(min-width: 701px)').matches;

/**
 * @param {object} props
 * @param {import('../career/shop.js').Career} props.career
 * @param {(c: import('../career/shop.js').Career) => void} props.update
 * @returns {React.ReactElement}
 */
export function MessagesApp({ career, update }) {
  // Oldest first, as a thread reads.
  const list = messagesFor(career).slice().reverse();
  const s = sagaOf(career);
  const unread = list.filter((m) => !s.read.includes(m.id));
  const last = list[list.length - 1];
  const [open, setOpen] = useState(wide);
  const end = useRef(/** @type {HTMLDivElement|null} */ (null));

  // Opening the thread reads everything in it.
  useEffect(() => {
    if (!open || unread.length === 0) return;
    update(unread.reduce((c, m) => readMessage(c, m.id), career));
  }, [open, unread, career, update]);
  // A thread opens on its latest message, as iMessage does.
  useLayoutEffect(() => { if (open) end.current?.scrollIntoView?.({ block: 'end' }); }, [open, list.length]);

  const chapter = openChapter(career);
  const progress = s.done ? 'Master tuner' : `Chapter ${Math.min(s.ch + 1, CHAPTERS.length)} of ${CHAPTERS.length}`;

  return (
    // `data-plain`: a phone's own app, drawn the way the phone draws it, not inked.
    <div className={styles.msgs} data-open={open ? 'true' : undefined} data-plain="">
      <aside className={styles.msgList} aria-label="Conversations">
        <h2 className={styles.msgTitle}>Messages</h2>
        <button type="button" className={styles.msgRow} aria-current={open ? 'page' : undefined} onClick={() => setOpen(true)}
          aria-label={`Pops${unread.length ? `, ${unread.length} unread` : ''}`}>
          <span className={styles.msgDotSlot}>{unread.length > 0 && <span className={styles.msgDot} />}</span>
          <Avatar size={46} />
          <span className={styles.msgRowText}>
            <span className={styles.msgRowTop}>
              <b>Pops</b>
              <small>{last ? (last.id.startsWith('tip:') ? 'Today' : progress) : ''}<ChevronRight size={14} aria-hidden="true" /></small>
            </span>
            <span className={styles.msgRowPreview} data-unread={unread.length ? 'true' : undefined}>
              {last ? (last.lesson ? last.subject : last.body[0]) : 'No messages yet.'}
            </span>
          </span>
        </button>
      </aside>

      <section className={styles.msgView} aria-label="Conversation with Pops">
        {open && (
          <>
            <header className={styles.threadHead}>
              <button type="button" className={styles.msgBack} onClick={() => setOpen(false)} aria-label="Back to Messages">
                <ChevronLeft size={22} aria-hidden="true" />
              </button>
              <div className={styles.threadWho}>
                <Avatar size={44} />
                <b>Pops <ChevronRight size={12} aria-hidden="true" /></b>
                <small>{progress}</small>
              </div>
            </header>
            <div className={styles.bubbles}>
              {list.map((m, mi) => (
                <React.Fragment key={m.id}>
                  {/* A divider where the chapter changes, not above every message in it. */}
                  {(mi === 0 || divider(list[mi - 1]) !== divider(m)) && <p className={styles.threadDay}>{divider(m)}</p>}
                  {m.body.map((t, i) => (
                    <p key={t} className={styles.bubble} data-tail={i === m.body.length - 1 && !m.lesson && !m.goal ? 'true' : undefined}
                      data-pay={/^\+\$\d/.test(t) ? 'true' : undefined}>{t}</p>
                  ))}
                  {m.lesson && (
                    <div className={styles.linkCard} data-tail={m.goal ? undefined : 'true'}>
                      <div className={styles.linkCardHead}>
                        <small>What Ray taught me</small>
                        <b>{m.lesson.title}</b>
                      </div>
                      <ul>{m.lesson.points.map((t) => <li key={t}>{t}</li>)}</ul>
                      <p className={styles.linkCardFoot}>{m.lesson.sources.join(' · ')}</p>
                    </div>
                  )}
                  {m.goal && <p className={styles.bubble} data-tail="true" data-goal="true"><b>Your goal:</b> {m.goal}</p>}
                  {m.kind === 'text' && <p className={styles.bubble} data-me="true" data-tail="true">{reply(m)}</p>}
                </React.Fragment>
              ))}
              {chapter && !s.done && <p className={styles.threadNote}>Pops will text when the goal is met.</p>}
              <div ref={end} />
            </div>
          </>
        )}
        {!open && <p className={styles.msgEmpty}>Pick a conversation.</p>}
      </section>
    </div>
  );
}
