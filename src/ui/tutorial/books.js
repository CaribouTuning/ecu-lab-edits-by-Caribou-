/**
 * What the lesson reader shows: the five-minute tutorial. Everything deeper is in the
 * Learn app.
 */

import { QUICK_CHAPTERS, QUICK_OUTCOMES } from './quickTour.jsx';

/** @typedef {{id: string, title: string, Body: () => import('react').ReactElement}} Lesson */
/** @typedef {{id: string, title: string, minutes: number, lessons: Lesson[]}} Chapter */

/**
 * @typedef {object} Book
 * @property {string} id also its progress key
 * @property {string} label the bar's name for it
 * @property {string} title
 * @property {string} lede
 * @property {string[]} outcomes
 * @property {Chapter[]} chapters
 * @property {(Chapter['lessons'][number] & {chapter: Chapter, number: string})[]} lessons every lesson in reading order, numbered
 * @property {string} doneLabel the last lesson's button
 */

/** @param {Chapter[]} chapters */
const numbered = (chapters) => chapters.flatMap((c, ci) => c.lessons.map((l, li) => ({
  ...l, chapter: c, number: chapters.length > 1 ? `${ci + 1}.${li + 1}` : `${li + 1}`,
})));

/** @type {Book} */
export const TUTORIAL = {
  id: 'tutorial',
  label: 'TUTORIAL',
  title: 'Tuning in five minutes',
  lede: 'Five short cards: what tuning is, where things are, and how to measure your work. Every screen in it is the real game, running live.',
  outcomes: QUICK_OUTCOMES,
  chapters: QUICK_CHAPTERS,
  lessons: numbered(QUICK_CHAPTERS),
  doneLabel: 'START TUNING',
};
