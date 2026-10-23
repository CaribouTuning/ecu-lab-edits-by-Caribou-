/**
 * CAREER's Messages app: Pops's emails and texts, on the laptop or the phone.
 *
 * The inbox on one side, the open message on the other (one at a time on a phone). An
 * email opens a chapter of the story: what Ray taught him, the lesson and where it comes
 * from, and the goal that closes it. A text closes one, or is the day's tip.
 */

import { Mail, MessageSquare } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { CHAPTERS, messagesFor, openChapter, readMessage, sagaOf } from '../career/story.js';

import styles from './Apps.module.css';

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
    <div className={styles.msgs} data-open={open ? 'true' : undefined}>
      <aside className={styles.msgList} aria-label="Inbox">
        <div className={styles.msgProgress}>
          <b>{s.done ? 'Master tuner' : `Chapter ${s.ch + 1} of ${CHAPTERS.length}: ${chapter?.title}`}</b>
          <div className={styles.msgBar} aria-hidden="true"><span style={{ width: `${(Math.min(s.ch, CHAPTERS.length) / CHAPTERS.length) * 100}%` }} /></div>
          {chapter && <span>{chapter.goal}</span>}
        </div>
        {list.map((m) => (
          <button key={m.id} type="button" className={styles.msgRow} aria-current={m.id === openId ? 'page' : undefined} onClick={() => setOpenId(m.id)}>
            {m.kind === 'email' ? <Mail size={16} aria-hidden="true" /> : <MessageSquare size={16} aria-hidden="true" />}
            <span className={styles.msgRowText}>
              <b>{!read.includes(m.id) && <span className={styles.msgDot} aria-label="unread" />}Pops</b>
              <span>{m.subject}</span>
            </span>
          </button>
        ))}
      </aside>
      <section className={styles.msgView} aria-label="Message">
        {!open && <p className={styles.panelNote}>Pick a message.</p>}
        {open && (
          <>
            <button type="button" className={styles.msgBack} onClick={() => setOpenId(null)}>‹ Inbox</button>
            <h3 className={styles.msgSubject}>{open.subject}</h3>
            <p className={styles.msgFrom}>From Pops · {open.kind === 'email' ? 'email' : 'text'}</p>
            {open.kind === 'text' ? (
              <div className={styles.bubbles}>{open.body.map((t) => <p key={t} className={styles.bubble}>{t}</p>)}</div>
            ) : (
              open.body.map((t) => <p key={t} className={styles.msgPara}>{t}</p>)
            )}
            {open.lesson && (
              <div className={`${styles.msgLesson} ink-frame`}>
                <h4>What Ray taught me: {open.lesson.title}</h4>
                <ul>{open.lesson.points.map((t) => <li key={t}>{t}</li>)}</ul>
                <p className={styles.msgSources}><b>Where it comes from:</b> {open.lesson.sources.join(' · ')}</p>
                {open.lesson.course && onCourse && <button type="button" className={styles.msgCourse} onClick={onCourse}>Open the Tuning Course</button>}
              </div>
            )}
            {open.goal && <p className={styles.msgGoal}><b>Your goal:</b> {open.goal}</p>}
          </>
        )}
      </section>
    </div>
  );
}
