/** A bordered surface. The app's default container for a group of related controls. */

import React from 'react';

import styles from './Panel.module.css';

/**
 * @typedef {Object} PanelProps
 * @property {React.ReactNode} children
 * @property {boolean} [tight] reduce the padding
 * @property {React.ElementType} [as] element to render, defaults to a div
 */

/**
 * Anything not named above — `style`, `className`, `id`, `aria-*` — lands on the
 * element, which is how a caller supplies the layout the panel does not own.
 *
 * @param {PanelProps & React.HTMLAttributes<HTMLDivElement>} props
 * @returns {React.ReactElement}
 */
export function Panel({ children, tight = false, as: As = 'div', ...rest }) {
  const className = [styles.panel, tight && styles.tight].filter(Boolean).join(' ');
  return <As className={className} {...rest}>{children}</As>;
}
