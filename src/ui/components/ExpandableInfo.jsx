/**
 * A collapsible block of explanatory prose.
 *
 * Every tab teaches something, so this is used from all four of them and from the
 * HOME learning guide — which is why it lives here rather than beside one screen.
 * Its open/closed state is its own: nothing outside it needs to know, and nothing
 * addresses it, so it is deliberately NOT part of the route the way a BuildSection
 * is.
 *
 * Relocated from EcuLab.jsx by the screen split, markup unchanged.
 */

import { ChevronDown, Info } from 'lucide-react';
import React, { useState } from 'react';

import { T } from '../theme.js';

/**
 * @param {object} props
 * @param {string} props.title the always-visible summary line
 * @param {React.ReactNode} props.children the prose revealed when it opens
 * @returns {React.ReactElement}
 */
export function ExpandableInfo({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ margin: '10px 0', border: `1px solid ${T.line}`, borderRadius: 10, overflow: 'hidden', background: T.panel }}>
      <button onClick={() => setOpen((o) => !o)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 13px', background: 'none', border: 'none' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 9, color: T.ink, fontSize: 12.5, fontWeight: 700, textAlign: 'left' }}>
          <Info size={14} style={{ color: T.acc, flexShrink: 0 }} />{title}
        </span>
        <ChevronDown size={15} style={{ color: T.ink3, flexShrink: 0, marginLeft: 8, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>
      <div style={{ maxHeight: open ? 900 : 0, opacity: open ? 1 : 0, overflow: 'hidden', transition: 'max-height .3s ease, opacity .2s ease' }}>
        <div style={{ padding: '0 13px 13px', fontSize: 12.5, color: T.ink2, lineHeight: 1.65 }}>{children}</div>
      </div>
    </div>
  );
}
