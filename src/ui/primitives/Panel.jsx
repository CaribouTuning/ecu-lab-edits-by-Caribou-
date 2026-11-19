/** A bordered surface. The app's default container for a group of related controls. */

import React from 'react';

import styles from './Panel.module.css';

/**
 * @typedef {Object} PanelProps
 * @property {React.ReactNode} children
 * @property {boolean} [tight] reduce the padding
 * @property {React.ElementType} [as] element to render, defaults to a div
 * @property {React.ReactNode} [title] the panel's name, centred in a title strip along its top
 *   (a technical panel, as a car designer's are drawn); without it the panel has no strip
 * @property {React.ReactNode} [lead] small text at the strip's left (a size, a map number)
 * @property {React.ReactNode} [tools] controls at the strip's right (undo, help)
 */

/**
 * Anything not named above — `style`, `className`, `id`, `aria-*` — lands on the
 * element, which is how a caller supplies the layout the panel does not own.
 *
 * @param {PanelProps & React.HTMLAttributes<HTMLDivElement>} props
 * @returns {React.ReactElement}
 */
export function Panel({
  children, tight = false, as: As = 'div', className, title, lead, tools, ...rest
}) {
  // `className` is pulled out and merged rather than left in `...rest`, so a
  // caller-supplied class is additive instead of clobbering the panel's own
  // generated classes when `{...rest}` spreads after it.
  const titled = title != null;
  const classes = [styles.panel, 'ink-frame', tight && styles.tight, titled && styles.titled, className].filter(Boolean).join(' ');
  if (!titled) return <As className={classes} {...rest}>{children}</As>;
  return (
    <As className={classes} {...rest}>
      <div className={styles.strip}>
        <span className={styles.stripLead}>{lead}</span>
        <span className={styles.stripTitle}>{title}</span>
        <span className={styles.stripTools}>{tools}</span>
      </div>
      <div className={styles.body}>{children}</div>
    </As>
  );
}
