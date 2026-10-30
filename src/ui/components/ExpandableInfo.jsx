/**
 * A collapsible block of explanatory prose.
 *
 * Every tab teaches something, so this is used from all four of them and from the
 * HOME learning guide — which is why it lives here rather than beside one screen.
 * Its open/closed state is its own: nothing outside it needs to know, and nothing
 * addresses it, so it is deliberately NOT part of the route the way a BuildSection
 * is.
 *
 * Relocated from EcuLab.jsx by the screen split; it has since gained aria-expanded,
 * aria-controls and inert (issue 81).
 */

import { ChevronDown, Info } from 'lucide-react';
import React, { useContext, useId, useState } from 'react';

import { T } from '../theme.js';

import { BuildBenchMode } from './BuildSection.jsx';
import { inertWhen } from './inert.js';

/**
 * @param {object} props
 * @param {string} props.title the always-visible summary line
 * @param {React.ReactNode} props.children the prose revealed when it opens
 * @param {boolean} [props.lazy] mount the children only once first opened, for an
 *   article carrying a live game screen that should not run while nobody is reading it
 * @returns {React.ReactElement}
 */
export function ExpandableInfo({ title, children, lazy = false }) {
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(!lazy);
  if (open && !opened) setOpened(true);
  const bodyId = useId();
  // On the build bench the sheet is controls first: the explanation is a quiet line under
  // the control it explains, opened when wanted, not a full-width bar between every two.
  const quiet = useContext(BuildBenchMode);
  return (
    <div style={quiet ? { margin: '0 0 2px' } : { margin: '10px 0', border: `1px solid ${T.line}`, borderRadius: 10, overflow: 'hidden', background: T.panel }}>
      <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((o) => !o)} style={quiet
        // On the build bench: a plain link to the explanation, no icon and no chevron. One of
        // these sits under many controls, and an icon on each made a column of identical rows.
        ? { display: 'inline', padding: '2px 0', background: 'none', border: 'none', cursor: 'pointer', color: T.ink2, fontSize: 12, fontWeight: 500, textAlign: 'left', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }
        : { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 13px', background: 'none', border: 'none' }}>
        {quiet ? title : (
          <span style={{ display: 'flex', alignItems: 'center', gap: 9, color: T.ink, fontSize: 12.5, fontWeight: 700, textAlign: 'left' }}>
            <Info size={14} style={{ color: T.acc, flexShrink: 0 }} />{title}
          </span>
        )}
        {!quiet && <ChevronDown aria-hidden="true" size={15} style={{ color: T.ink2, flexShrink: 0, marginLeft: 8, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />}
      </button>
      {/* Grid rows, not max-height: `1fr` animates to the content's own height, where a
          max-height cap clipped any article taller than it (four Learn articles ran past
          the old 900px on a phone, and their endings could not be read). */}
      {/* inert while shut, as in BuildSection. */}
      <div id={bodyId} {...inertWhen(!open)} style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0, transition: 'grid-template-rows .3s ease, opacity .2s ease' }}>
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          <div style={quiet ? { margin: '6px 0 8px', padding: '2px 0 2px 12px', borderLeft: `2px solid ${T.lineHi}`, fontSize: 12.5, color: T.ink2, lineHeight: 1.65 } : { padding: '0 13px 13px', fontSize: 12.5, color: T.ink2, lineHeight: 1.65 }}>{opened ? children : null}</div>
        </div>
      </div>
    </div>
  );
}
