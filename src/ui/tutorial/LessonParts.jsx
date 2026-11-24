/**
 * The pieces the five-minute tutorial's cards are built from, so every card reads the same
 * way: a paragraph, a numbered list, and the name of something on screen set as the game
 * sets it.
 */

import React from 'react';

import styles from './Lesson.module.css';

/** @param {{children: React.ReactNode}} props */
export function P({ children }) {
  return <p className={styles.p}>{children}</p>;
}

/** @param {{items: React.ReactNode[]}} props */
export function List({ items }) {
  return <ol className={styles.list}>{items.map((it, i) => <li key={i}>{it}</li>)}</ol>;
}

/** A name of something on screen, set the way the game sets it. @param {{children: React.ReactNode}} props */
export function K({ children }) {
  return <b className={styles.k}>{children}</b>;
}
