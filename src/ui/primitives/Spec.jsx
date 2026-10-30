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
 * Facts about the thing being built, as a datasheet table: a name, its figure, a note, one
 * ruled row each. For what is known rather than set (a factory rating, a redline).
 * @param {object} props
 * @param {Array<{label: string, value: string, note?: React.ReactNode}>} props.rows
 * @returns {React.ReactElement}
 */
export function SpecTable({ rows }) {
  return (
    <dl className={styles.table}>
      {rows.map((r) => (
        <div key={r.label} className={styles.tableRow}>
          <dt>{r.label}</dt>
          <dd><span className={styles.tableValue}>{r.value}</span>{r.note && <small>{r.note}</small>}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * How far a figure is toward its limit: a thin rule filled to `share`, warm past it. Only
 * where there is a real limit to be toward (a bottom end's rating, the redline).
 * @param {object} props
 * @param {number} props.share 0..1+, the figure over its limit
 * @param {string} props.label what it measures, for assistive technology
 * @returns {React.ReactElement}
 */
export function SpecMeter({ share, label }) {
  return (
    <span className={styles.meter} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)} data-over={share > 1 ? 'true' : undefined}>
      <i style={{ width: `${Math.min(100, Math.max(0, share * 100))}%` }} />
    </span>
  );
}
