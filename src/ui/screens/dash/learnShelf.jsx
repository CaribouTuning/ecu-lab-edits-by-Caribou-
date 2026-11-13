/**
 * The Learn app's pages, and the article wrapper that puts each article on one.
 *
 * Learn is laid out as the Physics app is: one page at a time, chosen from a list on a phone
 * and a row of tabs where there is room. The pages run in the order a tuner learns the job:
 * the idea, air, fuel, spark and knock, reading a pull, a whole job worked through, boost and
 * the adders, then the rest of the ECU, the engine science and where the model comes from.
 *
 * Every article in the guide (LearnScreen, LearnDeep) is an `Article`, and its number puts it
 * on a page (`PAGE_OF`). With no page chosen (HOME's guide) they all show as the guide's usual
 * expandable rows; on a page each is an open section with its title, as the Physics app's
 * panels are. The articles keep their numbers, which the rest of the app cites them by.
 */

import { BookOpen, Compass, Cpu, Droplet, Flame, Gauge, Rocket, Wind, Wrench, Zap } from 'lucide-react';
import React, { createContext, useContext } from 'react';

import { ExpandableInfo } from '../../components/ExpandableInfo.jsx';

import styles from './LearnScreen.module.css';

/**
 * The pages, in the order the Learn app lists them. `goal` is what a reader can do after
 * the page; `articles` the article numbers on it ('key' is the symbol key).
 */
export const LEARN_PAGES = /** @type {const} */ ([
  { id: 'start', name: 'Start here', icon: Compass, articles: [1, 12, 32, 'key'],
    goal: 'What an engine computer decides, the loop every tune follows, and how power and torque relate.' },
  { id: 'air', name: 'Air and VE', icon: Wind, articles: [2, 7, 27, 37, 38],
    goal: 'How the ECU knows how much air is in the cylinder, and how to correct its VE or MAF from a log.' },
  { id: 'fuel', name: 'Fuel', icon: Droplet, articles: [3, 8, 9, 10, 28],
    goal: 'Lambda, the fuel each cylinder needs, injector time and its limit, and what closed loop corrects.' },
  { id: 'spark', name: 'Spark and knock', icon: Zap, articles: [4, 5, 29],
    goal: 'Why timing makes torque, where knock stops it, and what knock control can and cannot hear.' },
  { id: 'pull', name: 'Reading a pull', icon: Gauge, articles: [11, 14, 39],
    goal: 'From cylinder pressure to wheel torque, every datalog column, and a diagnosis from the symptom.' },
  { id: 'job', name: 'A whole job', icon: Wrench, articles: [13, 15, 16, 40, 42],
    goal: 'A tune worked start to finish, the order of work on any car, what tuning cannot fix, and the habits that keep engines alive.' },
  { id: 'boost', name: 'Boost and adders', icon: Rocket, articles: [17, 18, 35, 36],
    goal: 'Turbos, superchargers and nitrous: what each does to the air, and what each costs.' },
  { id: 'ecu', name: 'The rest of the ECU', icon: Cpu, articles: [6, 26, 30, 31],
    goal: 'The whole control loop, the controllers and protections, and what you can leave alone.' },
  { id: 'engine', name: 'Engine science', icon: Flame, articles: [19, 20, 24],
    goal: 'Where the fuel’s heat goes, why the textbook cycle is not your engine, and why it sounds as it does.' },
  { id: 'model', name: 'The model and sources', icon: BookOpen, articles: [21, 22, 23, 25, 33, 34, 41],
    goal: 'Where every equation and figure in the simulator comes from, what it simplifies, and what to read next.' },
]);

/** The page each article is on, by its number ('key' for the symbol key). */
const PAGE_OF = new Map(LEARN_PAGES.flatMap((pg) => pg.articles.map((n) => /** @type {[number|string, string]} */ ([n, pg.id]))));

/** The page showing, or null for the whole guide. */
export const LearnShelf = createContext(/** @type {string|null} */ (null));

/** An article's number and its title without it: "21. Where…" is 21 and "Where…". @param {string} title */
function split(title) {
  const m = /^(\d+)\.\s+(.*)$/.exec(title);
  return m ? { n: Number(m[1]), name: m[2] } : { n: 'key', name: title };
}

/**
 * One article, on its page. In the whole guide it is the usual expandable row; on its page,
 * an open section with its title and number.
 * @param {{g?: string} & React.ComponentProps<typeof ExpandableInfo>} props `g` is unused, kept
 *   so the guide's markup need not change
 */
export function Article({ g: _g, title, children, lazy }) {
  const page = useContext(LearnShelf);
  if (!page) return <ExpandableInfo title={title} lazy={lazy}>{children}</ExpandableInfo>;
  const { n, name } = split(title);
  if (PAGE_OF.get(n) !== page) return null;
  return (
    <section className={styles.panel} aria-label={name} data-article={n}>
      <h3 className={styles.panelTitle}>
        <span>{name}</span>
        {n !== 'key' && <small className={styles.panelNum}>Article {n}</small>}
      </h3>
      <div className={styles.panelBody}>{children}</div>
    </section>
  );
}
