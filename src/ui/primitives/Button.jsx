/**
 * The app's only button.
 *
 * Content-width by default. The pre-overhaul UI set `width: '100%'` on every
 * call-to-action, which is why a primary action spanned the whole window on a
 * desktop monitor — so full-width is opt-in via `block`, and worth justifying each
 * time you reach for it.
 *
 * `danger` is for destructive actions only. It is not an emphasis variant; the
 * status colours mean engine state and must not be spent on decoration.
 *
 * `quiet` is for escape hatches — actions like SKIP that must be reachable but must
 * not compete with the screen's primary action. Text-only, no fill or border.
 */

import React from 'react';

import styles from './Button.module.css';

/**
 * @typedef {Object} ButtonProps
 * @property {React.ReactNode} children
 * @property {'primary'|'ghost'|'danger'|'quiet'} [variant='primary']
 * @property {'sm'|'md'|'lg'} [size='md']
 * @property {boolean} [block=false] - stretch to the full width of the container
 * @property {'button'|'submit'|'reset'} [type='button']
 */

/**
 * @param {ButtonProps & React.ButtonHTMLAttributes<HTMLButtonElement>} props
 * @returns {React.ReactElement}
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  block = false,
  type = 'button',
  ...rest
}) {
  const className = [styles.button, styles[variant], styles[size], block && styles.block]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} className={className} {...rest}>
      {children}
    </button>
  );
}
