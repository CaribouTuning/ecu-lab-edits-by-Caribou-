/**
 * One accordion section: a header row that names the section, and a body that
 * collapses to nothing when it is not the open one.
 *
 * Every tab is built out of these, and each one is ADDRESSABLE: `active` and
 * `onClick` come from the route, so the open section is part of the URL and
 * clicking the open section's own header closes it, leaving the tab with none open
 * (see `toggleSection` in EcuLab.jsx). It is therefore navigation, not local state,
 * and the section owns neither.
 *
 * The body is HIDDEN, not unmounted: `max-height: 0` with an opacity fade, so the
 * transition has something to animate and so a control inside a closed section is
 * still in the document. Both halves of that are load-bearing — `tests/ui/
 * routing-shell.test.jsx` reads the inline `maxHeight` as the only DOM-visible
 * difference between open and closed, and `tests/ui/build-store.test.jsx` reaches a
 * slider inside a collapsed section. Do not convert this component's inline styles
 * to a stylesheet without re-pointing both.
 *
 * Relocated from EcuLab.jsx by the screen split, markup unchanged.
 */

import { ChevronDown } from 'lucide-react';
import React, { createContext, useContext } from 'react';


/**
 * True while every section's controls are read-only: CAREER's BUILD, where the car is
 * the customer's and the job is to inspect it, not to change it. The headers still
 * open and close; only what is inside them is disabled (a `<fieldset disabled>`).
 */
export const BuildLocked = createContext(false);

/**
 * True on the engine stand's build software (desk/BuildBench.jsx), which lists the parts
 * itself and shows one at a time: there a section is its controls alone, no accordion head.
 */
export const BuildBenchMode = createContext(false);

/**
 * @param {object} props
 * @param {boolean} props.active whether this is the tab's open section
 * @param {() => void} props.onClick toggles this section open or closed
 * @param {React.ElementType} props.icon Lucide icon component for the header
 * @param {string} props.label
 * @param {React.ReactNode} [props.sub] one line of current state, read while collapsed
 * @param {React.ReactNode} props.children
 * @returns {React.ReactElement}
 */
export function BuildSection({ active, onClick, icon: Icon, label, sub, children }) {
  const locked = useContext(BuildLocked);
  const bench = useContext(BuildBenchMode);
  if (bench) {
    return locked ? <fieldset disabled style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>{children}</fieldset> : <>{children}</>;
  }
  return (
    <div style={{ marginBottom: 9 }}>
      <button onClick={onClick} style={{
        width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 14px',
        // CSS variables rather than the JS tokens, so a Mac window's greys (Desk.module.css
        // .screen) reach it; open is shown by the chevron and a lighter head, not a light ring.
        borderRadius: 8, border: '1px solid var(--line)', background: active ? 'var(--panel3)' : 'var(--panel2)', color: 'var(--ink)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, textAlign: 'left' }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--panel3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={15} color="var(--ink2)" />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>{label}</div>
            {sub && <div style={{ fontSize: 11, color: 'var(--ink2)', marginTop: 1 }}>{sub}</div>}
          </div>
        </div>
        <ChevronDown size={16} style={{ color: 'var(--ink2)', flexShrink: 0, marginLeft: 8, transform: active ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>
      {/* A cap, because the tests read maxHeight, but one no section reaches: at 3000px
          Learn How It Works (2400px of titles before any article opens) cut off whatever
          was opened past it. The easing differs by direction so a close still starts
          at once instead of spending most of its time above the content's real height. */}
      <div style={{ maxHeight: active ? 20000 : 0, opacity: active ? 1 : 0, overflow: 'hidden', transition: active ? 'max-height .6s ease-in, opacity .25s ease' : 'max-height .35s cubic-bezier(0, 1, 0, 1), opacity .25s ease' }}>
        <div style={{ padding: '13px 2px 2px' }}>
          {locked ? <fieldset disabled style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>{children}</fieldset> : children}
        </div>
      </div>
    </div>
  );
}
