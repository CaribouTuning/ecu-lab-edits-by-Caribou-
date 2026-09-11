/**
 * The signature dial: a swept-needle gauge face.
 *
 * Used three ways — as the static brand mark on the start screen, as the live
 * RPM readout inside the HOME live-engine panel, and as the dyno tach's face.
 * That spread across two screen files and the shell is why it lives here rather
 * than beside any one of them.
 *
 * Relocated from EcuLab.jsx by the screen split, markup unchanged. Its styling is
 * still SVG presentation attributes rather than a stylesheet, which is the right
 * shape for a drawing: the tick colours are computed per tick from the index.
 */

import React from 'react';

import { T } from '../theme.js';

/**
 * @param {object} props
 * @param {number} [props.size] rendered width and height in px
 * @param {number} [props.pct] needle position, 0 to 1 across the 240° sweep
 * @param {boolean} [props.live] drop the needle's settle animation, for a value
 *   that is already being updated continuously (the 20 Hz live engine)
 * @returns {React.ReactElement}
 */
export function DialMark({ size = 64, pct = 0.62, live = false }) {
  const angle = -120 + pct * 240;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size}>
      <circle cx="50" cy="50" r="44" fill={T.panel2} stroke={T.line} strokeWidth="1.5" />
      {Array.from({ length: 13 }).map((_, i) => {
        const a = (-120 + (i / 12) * 240) * (Math.PI / 180);
        const inner = 34, outer = i % 3 === 0 ? 28 : 31;
        return (
          <line key={i}
            x1={50 + inner * Math.sin(a)} y1={50 - inner * Math.cos(a)}
            x2={50 + outer * Math.sin(a)} y2={50 - outer * Math.cos(a)}
            stroke={i > 9 ? T.danger : T.ink3} strokeWidth={i % 3 === 0 ? 1.6 : 1} />
        );
      })}
      <g style={{ transition: live ? 'none' : 'transform .6s cubic-bezier(.34,1.4,.64,1)' }} transform={`rotate(${angle} 50 50)`}>
        <line x1="50" y1="50" x2="50" y2="20" stroke={T.acc} strokeWidth="3" strokeLinecap="round" />
      </g>
      <circle cx="50" cy="50" r="5" fill={T.acc} />
    </svg>
  );
}
