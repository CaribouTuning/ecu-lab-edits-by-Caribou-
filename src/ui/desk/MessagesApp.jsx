/**
 * CAREER's Messages app: Pops's emails and texts, on the laptop or the phone.
 *
 * The inbox on one side, the open message on the other (one at a time on a phone). An
 * email opens a chapter of the story: what Ray taught him, the lesson and where it comes
 * from, and the goal that closes it. A text closes one, or is the day's tip.
 */

import { ChevronLeft, ChevronRight, Mail } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { CHAPTERS, messagesFor, openChapter, readMessage, sagaOf } from '../career/story.js';

import styles from './Apps.module.css';

/** When a message came, as the inbox prints it: the day's tip today, the rest by chapter. @param {{id: string, order: number}} m */
const when = (m) => (m.id.startsWith('tip:') ? 'Today' : `Ch. ${Math.floor(m.order / 10) + 1}`);

/** What you texted back: a thank-you for a chapter's reward, a nod to the day's tip. @param {{id: string}} m */
const reply = (m) => (m.id.startsWith('tip:') ? 'Got it, thanks Pops.' : 'Thanks Pops. On to the next one.');

/** Pops's picture: his initial in a circle, as a phone draws a contact with no photo. */
function Avatar({ small = false }) {
  return <span className={styles.avatar} data-small={small ? 'true' : undefined} aria-hidden="true">P</span>;
}

/**
 * @param {object} props
 * @param {import('../career/shop.js').Career} props.career
 * @param {(c: import('../career/shop.js').Career) => void} props.update
 * @param {() => void} [props.onCourse] open the Tuning Course
 * @returns {React.ReactElement}
 */
export function MessagesApp({ career, update, onCourse }) {
  const list = messagesFor(career);
  const read = sagaOf(career).read;
  const [openId, setOpenId] = useState(/** @type {string|null} */ (null));
  const open = list.find((m) => m.id === openId) ?? null;
  // Opening a message marks it read.
  useEffect(() => {
    if (open && !read.includes(open.id)) update(readMessage(career, open.id));
  }, [open, read, career, update]);
  const chapter = openChapter(career);
  const s = sagaOf(career);

  return (
    // `data-plain`: a phone's own app, drawn the way the phone draws it, not inked.
    <div className={styles.msgs} data-open={open ? 'true' : undefined} data-plain="">
      <aside className={styles.msgList} aria-label="Inbox">
        <h2 className={styles.msgTitle}>Messages</h2>
        <div className={styles.msgProgress}>
          <b>{s.done ? 'Master tuner' : `Chapter ${s.ch + 1} of ${CHAPTERS.length}: ${chapter?.title}`}</b>
          <div className={styles.msgBar} aria-hidden="true"><span style={{ width: `${(Math.min(s.ch, CHAPTERS.length) / CHAPTERS.length) * 100}%` }} /></div>
          {chapter && <span>{chapter.goal}</span>}
        </div>
        <div className={styles.msgRows}>
          {list.map((m) => {
            const unread = !read.includes(m.id);
            return (
              <button key={m.id} type="button" className={styles.msgRow} aria-current={m.id === openId ? 'page' : undefined} onClick={() => setOpenId(m.id)}>
                <span className={styles.msgDotSlot}>{unread && <span className={styles.msgDot} aria-label="unread" />}</span>
                <Avatar />
                <span className={styles.msgRowText}>
                  <span className={styles.msgRowTop}>
                    <b>Pops</b>
                    <small>{when(m)}<ChevronRight size={14} aria-hidden="true" /></small>
                  </span>
                  <span className={styles.msgRowSubject} data-unread={unread ? 'true' : undefined}>
                    {m.kind === 'email' && <Mail size={12} aria-label="Email" />}{m.subject}
                  </span>
                  <span className={styles.msgRowPreview}>{m.body[0]}</span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>
      <section className={styles.msgView} aria-label="Message" data-kind={open?.kind}>
        {!open && <p className={styles.msgEmpty}>Pick a message.</p>}
        {open && (
          <>
            <button type="button" className={styles.msgBack} onClick={() => setOpenId(null)}><ChevronLeft size={18} aria-hidden="true" />Inbox</button>
            {open.kind === 'text' ? (
              <>
                <header className={styles.threadHead}>
                  <Avatar />
                  <b>Pops</b>
                  <small>{open.subject}</small>
                </header>
                <div className={styles.bubbles}>
                  <p className={styles.threadDay}>{when(open)}</p>
                  {open.body.map((t) => <p key={t} className={styles.bubble}>{t}</p>)}
                  <p className={styles.bubble} data-me="true">{reply(open)}</p>
                </div>
              </>
            ) : (
              <article className={styles.mail}>
                <h3 className={styles.msgSubject}>{open.subject}</h3>
                <div className={styles.mailFrom}>
                  <Avatar small />
                  <span><b>Pops</b><small>To: You</small></span>
                  <small className={styles.mailWhen}>{when(open)}</small>
                </div>
                {open.body.map((t) => <p key={t} className={styles.msgPara}>{t}</p>)}
                {open.lesson && (
                  <div className={styles.msgLesson}>
                    <h4>What Ray taught me: {open.lesson.title}</h4>
                    <ul>{open.lesson.points.map((t) => <li key={t}>{t}</li>)}</ul>
                    <p className={styles.msgSources}><b>Where it comes from:</b> {open.lesson.sources.join(' · ')}</p>
                    {open.lesson.course && onCourse && <button type="button" className={styles.msgCourse} onClick={onCourse}>Open the Tuning Course</button>}
                  </div>
                )}
                {open.goal && <p className={styles.msgGoal}><b>Your goal:</b> {open.goal}</p>}
              </article>
            )}
          </>
        )}
      </section>
    </div>
  );
}
