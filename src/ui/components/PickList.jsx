/**
 * Full-width descriptive rows for a choice that needs a subtitle (turbine size,
 * injector size) — a `Seg` reads as a compact row of chips, and neither the turbine
 * housing names nor the injector flow figures fit that shape without wrapping.
 *
 * Relocated from EcuLab.jsx by the screen split, markup unchanged. Shared by BUILD's
 * Forced Induction screen and TUNE's ECU screen, which is why it lives here rather
 * than beside either one — see this folder's README for what that distinction means.
 */

import React from 'react';

import { T } from '../theme.js';

/**
 * @param {object} props
 * @param {Array<{value: string, label: string, sub?: string}>} props.options
 * @param {string} props.value
 * @param {(value: string) => void} props.onChange
 * @returns {React.ReactElement}
 */
export function PickList({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.value} onClick={() => onChange(o.value)} style={{
            textAlign: 'left', padding: '11px 13px', borderRadius: 9, fontWeight: 600, fontSize: 13,
            border: `1px solid ${active ? T.acc : T.line}`, background: active ? T.accBg : T.panel2,
            color: active ? T.accInk : T.inkSoft,
          }}>{o.label}{o.sub && <div style={{ fontSize: 11, color: T.ink2, marginTop: 2, fontWeight: 400 }}>{o.sub}</div>}</button>
        );
      })}
    </div>
  );
}
