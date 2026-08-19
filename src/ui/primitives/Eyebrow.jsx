/** Small uppercase section label with an accent rule. Labels a group; never a status. */

import React from 'react';

import styles from './Eyebrow.module.css';

/**
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {React.ElementType} [props.icon] optional Lucide icon component
 * @returns {React.ReactElement}
 */
export function Eyebrow({ children, icon: Icon }) {
  return (
    <div className={styles.eyebrow}>
      <span className={styles.rule} />
      {Icon && <Icon size={13} />}
      <span>{children}</span>
    </div>
  );
}
