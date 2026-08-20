/** A bordered surface. The app's default container for a group of related controls. */

import React from 'react';

import styles from './Panel.module.css';

/**
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {boolean} [props.tight] reduce the padding
 * @param {React.ElementType} [props.as] element to render, defaults to a div
 * @returns {React.ReactElement}
 */
export function Panel({ children, tight = false, as: As = 'div', ...rest }) {
  const className = [styles.panel, tight && styles.tight].filter(Boolean).join(' ');
  return <As className={className} {...rest}>{children}</As>;
}
