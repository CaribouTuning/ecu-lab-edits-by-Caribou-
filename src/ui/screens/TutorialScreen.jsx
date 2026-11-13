/**
 * The lesson reader for the five-minute tutorial (tutorial/books.js).
 *
 * A contents page first, doing what the best tutorials do first: what the reader will
 * be able to do by the end, what they need and how long it takes. Then the lessons, one
 * idea each, showing the real game screens (ScreenSnippet). Lessons read are ticked on
 * the contents page, and the tutorial reopens where the player left it. Everything
 * deeper is in the Learn app.
 */

import { Check, ChevronLeft, List as ListIcon } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import { Button } from '../primitives/Button.jsx';
import { TUTORIAL } from '../tutorial/books.js';

import styles from './TutorialScreen.module.css';

/** @param {string} bookId */
const storeKey = (bookId) => `ecuLab.${bookId}.progress`;

/**
 * Lessons read and where the reader was, remembered per browser. Never required.
 * @param {string} bookId
 */
function loadProgress(bookId) {
  try {
    const raw = JSON.parse(localStorage.getItem(storeKey(bookId)) ?? 'null');
    return { read: Array.isArray(raw?.read) ? raw.read : [], at: typeof raw?.at === 'string' ? raw.at : null };
  } catch {
    return { read: [], at: null };
  }
}

/** @param {string} bookId @param {{read: string[], at: string|null}} p */
function saveProgress(bookId, p) {
  try {
    localStorage.setItem(storeKey(bookId), JSON.stringify(p));
  } catch {
    // Private mode or blocked storage: progress is a convenience, not a requirement.
  }
}

/**
 * @param {object} props
 * @param {import('../tutorial/books.js').Book} [props.book] which book; the tutorial by default
 * @param {() => void} props.onDone leaves the book, for the game
 * @returns {React.ReactElement}
 */
export function TutorialScreen({ book = TUTORIAL, onDone }) {
  const LESSONS = book.lessons;
  const bookName = book.label[0] + book.label.slice(1).toLowerCase();
  const [progress, setProgress] = useState(() => loadProgress(book.id));
  // null is the contents page; otherwise an index into LESSONS.
  const [at, setAt] = useState(/** @type {number|null} */ (null));
  const top = useRef(/** @type {HTMLDivElement|null} */ (null));

  useEffect(() => {
    top.current?.scrollTo?.(0, 0);
    if (at == null) return;
    const id = LESSONS[at].id;
    setProgress((p) => {
      const next = { read: p.read.includes(id) ? p.read : [...p.read, id], at: id };
      saveProgress(book.id, next);
      return next;
    });
  }, [at, LESSONS, book.id]);

  const resumeAt = Math.max(0, LESSONS.findIndex((l) => l.id === progress.at));

  if (at == null) {
    return (
      <div className={styles.screen}>
        <div className={styles.bar}>
          <div className={styles.count}>{bookName} contents</div>
          <Button variant="quiet" size="sm" onClick={onDone}>Skip</Button>
        </div>
        <div className={styles.body} ref={top}>
          <div className={styles.inner}>
            <Contents book={book} read={progress.read} onOpen={setAt} />
          </div>
        </div>
        <div className={styles.actions}>
          <Button size="lg" onClick={() => setAt(progress.at ? resumeAt : 0)}>
            {progress.at ? `CONTINUE AT ${LESSONS[resumeAt].number}` : 'START'}
          </Button>
        </div>
      </div>
    );
  }

  const lesson = LESSONS[at];
  const last = at === LESSONS.length - 1;
  const chapterNo = book.chapters.indexOf(lesson.chapter) + 1;
  const multiChapter = book.chapters.length > 1;
  const chapterEnd = last || LESSONS[at + 1].chapter !== lesson.chapter;
  const { Body } = lesson;

  return (
    <div className={styles.screen}>
      <div className={styles.bar}>
        <div className={styles.count}>{bookName}, page {at + 1} of {LESSONS.length}</div>
        <div className={styles.barActions}>
          <Button variant="quiet" size="sm" onClick={() => setAt(null)}>
            <ListIcon size={14} aria-hidden="true" /> CONTENTS
          </Button>
          <Button variant="quiet" size="sm" onClick={onDone}>Skip</Button>
        </div>
      </div>

      <div className={styles.body} ref={top}>
        <article className={styles.inner} key={lesson.id}>
          <div className={styles.eyebrow}>{multiChapter ? `Chapter ${chapterNo}: ` : ''}{lesson.chapter.title}</div>
          <h1 className={styles.title}><span className={styles.num}>{lesson.number}</span> {lesson.title}</h1>
          <Body />
          {chapterEnd && multiChapter && (
            <div className={styles.chapterDone} role="status">
              <Check size={16} aria-hidden="true" /> Chapter {chapterNo} complete: {lesson.chapter.title}.
            </div>
          )}
        </article>
      </div>

      <div className={styles.dots} aria-hidden="true">
        {multiChapter
          ? book.chapters.map((c) => (
            <span key={c.id} className={[styles.dot, c === lesson.chapter && styles.dotOn].filter(Boolean).join(' ')} />
          ))
          : LESSONS.map((l, i) => (
            <span key={l.id} className={[styles.dot, i === at && styles.dotOn].filter(Boolean).join(' ')} />
          ))}
      </div>

      <div className={styles.actions}>
        <Button size="lg" variant="ghost" onClick={() => setAt(at === 0 ? null : at - 1)}>
          <ChevronLeft size={16} aria-hidden="true" /> BACK
        </Button>
        <Button size="lg" onClick={() => (last ? onDone() : setAt(at + 1))}>
          {last ? book.doneLabel : 'NEXT'}
        </Button>
      </div>
    </div>
  );
}

/**
 * @param {object} props
 * @param {import('../tutorial/books.js').Book} props.book
 * @param {string[]} props.read lesson ids already read
 * @param {(index: number) => void} props.onOpen
 */
function Contents({ book, read, onOpen }) {
  return (
    <>
      <h1 className={styles.title}>{book.title}</h1>
      <p className={styles.lede}>{book.lede}</p>

      <div className={styles.outcomes}>
        <div className={styles.sectionHead}>By the end you will be able to</div>
        <ul className={styles.outcomeList}>
          {book.outcomes.map((o) => <li key={o}>{o}</li>)}
        </ul>
        <div className={styles.sectionHead}>You need</div>
        <p className={styles.need}>No car knowledge. Multiplication helps. Sound is optional.</p>
      </div>

      <nav aria-label={`${book.title} contents`}>
        {book.chapters.map((c, ci) => (
          <section key={c.id} className={styles.chapter}>
            <div className={styles.chapterHead}>
              <span>{book.chapters.length > 1 ? `${ci + 1}. ` : ''}{c.title}</span>
              <span className={styles.minutes}>{c.minutes} min</span>
            </div>
            <ul className={styles.lessonList}>
              {c.lessons.map((l) => {
                const i = book.lessons.findIndex((x) => x.id === l.id);
                const { number } = book.lessons[i];
                const done = read.includes(l.id);
                return (
                  <li key={l.id}>
                    <button type="button" className={styles.lessonLink} onClick={() => onOpen(i)} aria-label={`${number} ${l.title}${done ? ', read' : ''}`}>
                      <span className={styles.lessonNum}>{number}</span>
                      <span className={styles.lessonTitle}>{l.title}</span>
                      {done && <Check size={14} aria-hidden="true" className={styles.tick} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </nav>

    </>
  );
}
