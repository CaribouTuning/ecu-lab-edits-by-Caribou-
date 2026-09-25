/**
 * The tutorial: a contents page, then five chapters of short lessons.
 *
 * The contents page does what the best tutorials do first: says what the reader will
 * be able to do by the end, what they need, how long it takes, and shows the finished
 * result (a real dyno pull of the engine they are about to tune) before step one.
 * Lessons are one idea each, show the real game screens (ScreenSnippet), and end with
 * something to do in the game. Lessons read are ticked on the contents page, and the
 * tutorial reopens where the player left it.
 */

import { Check, ChevronLeft, List as ListIcon, Play } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import { Button } from '../primitives/Button.jsx';
import { ResultScreen } from './dyno/ResultScreen.jsx';
import { CHAPTERS, LESSONS, OUTCOMES } from '../tutorial/lessons.jsx';
import { MISSIONS } from '../tutorial/missions.js';
import { peaks, stock } from '../tutorial/scenarios.js';
import { ScreenSnippet } from '../tutorial/ScreenSnippet.jsx';

import styles from './TutorialScreen.module.css';

const STORE_KEY = 'ecuLab.tutorial.v2';
const TOTAL_MINUTES = CHAPTERS.reduce((m, c) => m + c.minutes, 0);

/** Lessons read and where the reader was, remembered per browser. Never required. */
function loadProgress() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    return { read: Array.isArray(raw?.read) ? raw.read : [], at: typeof raw?.at === 'string' ? raw.at : null };
  } catch {
    return { read: [], at: null };
  }
}

/** @param {{read: string[], at: string|null}} p */
function saveProgress(p) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(p));
  } catch {
    // Private mode or blocked storage: progress is a convenience, not a requirement.
  }
}

/**
 * @param {object} props
 * @param {() => void} props.onDone leaves the tutorial for the game
 * @param {(missionId: string) => void} [props.onPractice] starts a practice mission in the game
 * @returns {React.ReactElement}
 */
export function TutorialScreen({ onDone, onPractice }) {
  const [progress, setProgress] = useState(loadProgress);
  // null is the contents page; otherwise an index into LESSONS.
  const [at, setAt] = useState(/** @type {number|null} */ (null));
  const top = useRef(/** @type {HTMLDivElement|null} */ (null));

  useEffect(() => {
    top.current?.scrollTo?.(0, 0);
    if (at == null) return;
    const id = LESSONS[at].id;
    setProgress((p) => {
      const next = { read: p.read.includes(id) ? p.read : [...p.read, id], at: id };
      saveProgress(next);
      return next;
    });
  }, [at]);

  const resumeAt = Math.max(0, LESSONS.findIndex((l) => l.id === progress.at));

  if (at == null) {
    return (
      <div className={styles.screen}>
        <div className={styles.bar}>
          <div className={styles.count}>TUTORIAL · CONTENTS</div>
          <Button variant="quiet" size="sm" onClick={onDone}>SKIP</Button>
        </div>
        <div className={styles.body} ref={top}>
          <div className={styles.inner}>
            <Contents read={progress.read} onOpen={setAt} onPractice={onPractice} />
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
  const chapterNo = CHAPTERS.indexOf(lesson.chapter) + 1;
  const chapterEnd = last || LESSONS[at + 1].chapter !== lesson.chapter;
  const mission = lesson.mission ? MISSIONS.find((m) => m.id === lesson.mission) : null;
  const { Body } = lesson;

  return (
    <div className={styles.screen}>
      <div className={styles.bar}>
        <div className={styles.count}>TUTORIAL · {at + 1}/{LESSONS.length}</div>
        <div className={styles.barActions}>
          <Button variant="quiet" size="sm" onClick={() => setAt(null)}>
            <ListIcon size={14} aria-hidden="true" /> CONTENTS
          </Button>
          <Button variant="quiet" size="sm" onClick={onDone}>SKIP</Button>
        </div>
      </div>

      <div className={styles.body} ref={top}>
        <article className={styles.inner} key={lesson.id}>
          <div className={styles.eyebrow}>CHAPTER {chapterNo} · {lesson.chapter.title.toUpperCase()}</div>
          <h1 className={styles.title}><span className={styles.num}>{lesson.number}</span> {lesson.title}</h1>
          <Body />
          {mission && onPractice && (
            <div className={styles.practice}>
              <div>
                <div className={styles.practiceTag}>PRACTICE IN THE GAME</div>
                <div className={styles.practiceTitle}>{mission.title}</div>
                <div className={styles.practiceText}>{mission.blurb} A checklist follows you through the game and ticks itself as you go.</div>
              </div>
              <Button onClick={() => onPractice(mission.id)}><Play size={14} aria-hidden="true" /> START PRACTICE</Button>
            </div>
          )}
          {chapterEnd && (
            <div className={styles.chapterDone} role="status">
              <Check size={16} aria-hidden="true" /> Chapter {chapterNo} complete: {lesson.chapter.title}.
            </div>
          )}
        </article>
      </div>

      <div className={styles.dots} aria-hidden="true">
        {CHAPTERS.map((c) => (
          <span key={c.id} className={[styles.dot, c === lesson.chapter && styles.dotOn].filter(Boolean).join(' ')} />
        ))}
      </div>

      <div className={styles.actions}>
        <Button size="lg" variant="ghost" onClick={() => setAt(at === 0 ? null : at - 1)}>
          <ChevronLeft size={16} aria-hidden="true" /> BACK
        </Button>
        <Button size="lg" onClick={() => (last ? onDone() : setAt(at + 1))}>
          {last ? 'START TUNING' : 'NEXT'}
        </Button>
      </div>
    </div>
  );
}

/**
 * @param {object} props
 * @param {string[]} props.read lesson ids already read
 * @param {(index: number) => void} props.onOpen
 * @param {(missionId: string) => void} [props.onPractice]
 */
function Contents({ read, onOpen, onPractice }) {
  const d = stock();
  const { hp, tq } = peaks(d);
  return (
    <>
      <h1 className={styles.title}>Learn to tune an engine</h1>
      <p className={styles.lede}>
        About {TOTAL_MINUTES} minutes, in {CHAPTERS.length} chapters of short lessons. Every screen in it is the real game screen, running live, and every number is the one your own game will show.
      </p>

      <div className={styles.outcomes}>
        <div className={styles.sectionHead}>BY THE END YOU WILL BE ABLE TO</div>
        <ul className={styles.outcomeList}>
          {OUTCOMES.map((o) => <li key={o}>{o}</li>)}
        </ul>
        <div className={styles.sectionHead}>YOU NEED</div>
        <p className={styles.need}>No car knowledge. Multiplication helps. Sound is optional.</p>
      </div>

      <div className={styles.sectionHead}>WHERE YOU ARE GOING</div>
      <ScreenSnippet
        where="DYNO"
        demo={d}
        height={250}
        caption={`The engine you start with, on the dyno: ${hp.hp} whp at ${hp.rpm} RPM and ${tq.torque} lb-ft at ${tq.rpm} RPM. By lesson 3.1 you will run this pull yourself; by chapter 4 you will fit a part, retune for it and prove it made more.`}
      >
        <ResultScreen chartData={d.chartData} engineDerived={d.derived} bands={d.bands} wholePullCount={d.wholePullCount} />
      </ScreenSnippet>

      <nav aria-label="Tutorial contents">
        {CHAPTERS.map((c, ci) => (
          <section key={c.id} className={styles.chapter}>
            <div className={styles.chapterHead}>
              <span>{ci + 1} · {c.title}</span>
              <span className={styles.minutes}>{c.minutes} min</span>
            </div>
            <ul className={styles.lessonList}>
              {c.lessons.map((l) => {
                const i = LESSONS.findIndex((x) => x.id === l.id);
                const done = read.includes(l.id);
                return (
                  <li key={l.id}>
                    <button type="button" className={styles.lessonLink} onClick={() => onOpen(i)} aria-label={`${LESSONS[i].number} ${l.title}${done ? ', read' : ''}`}>
                      <span className={styles.lessonNum}>{LESSONS[i].number}</span>
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

      {onPractice && (
        <>
          <div className={styles.sectionHead}>PRACTICE MISSIONS</div>
          <p className={styles.need}>Hands-on, in the real game. A checklist follows you and ticks itself as you do each step.</p>
          <ul className={styles.missionList}>
            {MISSIONS.map((m) => (
              <li key={m.id} className={styles.mission}>
                <div>
                  <div className={styles.practiceTitle}>{m.title}</div>
                  <div className={styles.practiceText}>{m.blurb}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => onPractice(m.id)} aria-label={`Start practice: ${m.title}`}>START</Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
