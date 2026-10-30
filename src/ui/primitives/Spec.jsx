/**
 * The engine builder's spec-sheet parts: how one engine parameter is shown and set.
 *
 * Laid out as an engineering datasheet is, not as a settings form: a ruled heading names a
 * group of related figures, each figure is a row with its name on the left and its value, big
 * and in a monospaced face, on the right, and the factory figure sits under it once it has
 * changed. A slider is a thin rule with a blade for a thumb, the way a caliper or a fader reads.
 *
 * Presentation only. Every control still writes the same build field through the same
 * action; these hold no state and know nothing about the engine.
 */

import React, { useId } from 'react';

import styles from './Spec.module.css';

/**
 * A heading ruled out across the page, over the figures it groups.
 * @param {object} props
 * @param {string} props.title
 * @param {React.ReactNode} [props.aside] a word on the right: what the group adds up to
 * @param {React.ReactNode} props.children
 * @returns {React.ReactElement}
 */
export function SpecGroup({ title, aside = null, children }) {
  return (
    <section className={styles.group} aria-label={title}>
      <header className={styles.groupHead}>
        <h3 className={styles.groupTitle}>{title}</h3>
        {aside != null && <span className={styles.groupAside}>{aside}</span>}
      </header>
      <div className={styles.groupBody}>{children}</div>
    </section>
  );
}

/**
 * A named choice or control that is not a slider: its label above, a word on the right.
 * @param {object} props
 * @param {string} props.label
 * @param {React.ReactNode} [props.aside]
 * @param {'warn'|undefined} [props.tone]
 * @param {React.ReactNode} props.children
 * @returns {React.ReactElement}
 */
export function SpecField({ label, aside = null, tone, children }) {
  return (
    <div className={styles.field} data-tone={tone}>
      <div className={styles.fieldHead}>
        <span className={styles.fieldLabel}>{label}</span>
        {aside != null && <span className={styles.fieldAside}>{aside}</span>}
      </div>
      {children}
    </div>
  );
}

/**
 * One parameter on a slider: name, value, the factory figure once changed, and the rule.
 * @param {object} props
 * @param {string} props.label
 * @param {number} props.value
 * @param {string} [props.unit] shown after the value (mm, °, :1)
 * @param {number} [props.decimals]
 * @param {number} props.min
 * @param {number} props.max
 * @param {number} props.step
 * @param {(value: number) => void} props.onChange
 * @param {number|null} [props.stock] the factory engine's figure; shown when `value` differs
 * @param {React.ReactNode} [props.aside] a derived figure beside the label (overlap, float RPM)
 * @param {string} [props.lo] what the low end of the rule means
 * @param {string} [props.hi] what the high end means
 * @param {'warn'|undefined} [props.tone] the value is past something that matters
 * @param {string} [props.ariaLabel] names the slider where `label` alone is not enough
 * @returns {React.ReactElement}
 */
export function SpecSlider({ label, value, unit = '', decimals = 0, min, max, step, onChange, stock = null, aside = null, lo, hi, tone, ariaLabel }) {
  const id = useId();
  const pct = max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;
  const fmt = (v) => v.toFixed(decimals);
  const changed = stock != null && Math.abs(stock - value) > 0.5 * 10 ** -decimals;
  return (
    <div className={styles.slider} data-tone={tone}>
      <div className={styles.fieldHead}>
        <label className={styles.fieldLabel} htmlFor={id}>{label}</label>
        {aside != null && <span className={styles.fieldAside}>{aside}</span>}
        <output className={styles.value} htmlFor={id}>{fmt(value)}<span className={styles.unit}>{unit}</span></output>
      </div>
      <input
        id={id} type="range" className={styles.range} style={/** @type {React.CSSProperties} */ ({ '--pct': `${pct}%` })}
        min={min} max={max} step={step} value={value} aria-label={ariaLabel}
        aria-valuetext={`${fmt(value)} ${unit}`.trim()}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {(lo || hi || changed) && (
        <div className={styles.rangeFoot}>
          <span>{lo ?? fmt(min)}</span>
          {changed && <span className={styles.stock}>Stock {fmt(stock)}{unit}</span>}
          <span>{hi ?? fmt(max)}</span>
        </div>
      )}
    </div>
  );
}

/**
 * A strip of the figures the parameters above add up to, so the effect of a change shows
 * where it is made. An item with a `share` draws a bar: how far it is toward a limit.
 * @param {object} props
 * @param {Array<{label: string, value: string, unit?: string, note?: React.ReactNode, share?: number, tone?: 'warn'}>} props.items
 * @returns {React.ReactElement}
 */
export function SpecReadouts({ items }) {
  return (
    <dl className={styles.readouts}>
      {items.map((it) => (
        <div key={it.label} className={styles.readout} data-tone={it.tone}>
          <dt>{it.label}</dt>
          <dd><span className={styles.big}>{it.value}</span>{it.unit && <span className={styles.unit}>{it.unit}</span>}</dd>
          {it.share != null && <span className={styles.meter} aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(0, it.share * 100))}%` }} /></span>}
          {it.note && <small>{it.note}</small>}
        </div>
      ))}
    </dl>
  );
}
