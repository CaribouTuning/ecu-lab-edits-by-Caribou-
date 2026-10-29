/**
 * The Learn app's four shelves, and the article wrapper that puts each article on one.
 *
 * Every article in the guide (LearnScreen, LearnDeep) is an `Article` with a shelf. With no
 * shelf chosen they all show, in reading order, as they always have; with one chosen only
 * that shelf's articles do, so the guide's text never moves to be filtered.
 *
 *   sources   where the model and its figures come from, and further reading
 *   ecu       what an engine computer does, step by step, and how to tune it
 *   engine    how the engine and the car it drives make and spend power
 *   how       how the whole thing fits together, and how this simulator runs
 */

import React, { createContext, useContext } from 'react';

import { ExpandableInfo } from '../../components/ExpandableInfo.jsx';

/** The shelves, in the order the Learn app lists them. */
export const SHELVES = [
  { id: 'sources', label: 'Sources' },
  { id: 'ecu', label: 'ECU' },
  { id: 'engine', label: 'Engine' },
  { id: 'how', label: 'How it works' },
];

/** The shelf showing, or null for the whole guide. */
export const LearnShelf = createContext(/** @type {string|null} */ (null));

/**
 * One article, on its shelf. Renders as the guide's usual expandable article.
 * @param {{g: string} & React.ComponentProps<typeof ExpandableInfo>} props
 */
export function Article({ g, ...rest }) {
  const shelf = useContext(LearnShelf);
  if (shelf && shelf !== g) return null;
  return <ExpandableInfo {...rest} />;
}
