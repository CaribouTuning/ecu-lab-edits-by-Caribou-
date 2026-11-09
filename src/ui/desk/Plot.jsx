/**
 * An engineering plot: a titled figure with numbered axes, their quantities and units,
 * gridlines at the ticks and a legend that names every trace. Every trace on the Physics
 * page draws inside one, so none is a line with nothing to read it against.
 *
 * The plot hands its scales to its children (`x`, `y`, and the plot box), and they draw
 * the traces in the SVG's own units.
 */

import React, { useLayoutEffect, useRef, useState } from 'react';

import styles from './Plot.module.css';

/**
 * Round tick values across a range: steps of 1, 2 or 5 × a power of ten, about `n` of them.
 * @param {number} lo @param {number} hi @param {number} [n]
 * @returns {number[]}
 */
export function niceTicks(lo, hi, n = 4) {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

/**
 * Crank-angle ticks every 90°, named at the dead centres.
 * @param {number} a first degree on the axis @param {number} b last
 * @param {(d: number) => string} [name] a dead centre's name at that angle, or ''
 * @returns {{v: number, label: string}[]}
 */
export function crankTicks(a, b, name = () => '') {
  const out = [];
  for (let d = Math.ceil(a / 90) * 90; d <= b; d += 90) out.push({ v: d, label: name(d) || `${d}°` });
  return out;
}

/**
 * @typedef {{label: string, kind: 'line'|'dash'|'dots'|'fill'|'dot', tone: string}} LegendItem
 *   `tone` is a CSS colour (a var())
 */

/**
 * @param {object} props
 * @param {string} props.title what is plotted
 * @param {string} [props.sub] the conditions it is plotted at
 * @param {string} props.xLabel the x quantity and its unit
 * @param {string} props.yLabel the y quantity and its unit
 * @param {[number, number]} props.xDomain
 * @param {[number, number]} props.yDomain
 * @param {{v: number, label: string}[]} [props.xTicks] default: round numbers
 * @param {number[]} [props.yTicks] default: round numbers
 * @param {LegendItem[]} [props.legend]
 * @param {string} props.ariaLabel what a screen reader hears, with the value now
 * @param {number} [props.height] the plot's height, px
 * @param {(s: {x: (v: number) => number, y: (v: number) => number, X0: number, X1: number, Y0: number, Y1: number}) => React.ReactNode} props.children
 * @returns {React.ReactElement}
 */
export function Plot({ title, sub, xLabel, yLabel, xDomain, yDomain, xTicks, yTicks, legend = [], ariaLabel, height = 180, children }) {
  // Laid out at the width it is drawn at, so its text is the same size on a phone and on a
  // wide monitor (a fixed viewBox scaled to a 1,100 px panel drew 30 px tick labels).
  const boxRef = useRef(/** @type {HTMLElement|null} */ (null));
  const [W, setW] = useState(320);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => { const w = Math.round(el.clientWidth); if (w > 0) setW(Math.max(240, w)); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = height;
  const X0 = 40; const X1 = W - 10; const Y0 = 8; const Y1 = H - 34;
  const [xa, xb] = xDomain; const [ya, yb] = yDomain;
  const x = (v) => X0 + ((v - xa) / (xb - xa || 1)) * (X1 - X0);
  const y = (v) => Y1 - ((v - ya) / (yb - ya || 1)) * (Y1 - Y0);
  const xt = xTicks ?? niceTicks(xa, xb, Math.max(4, Math.round(W / 90))).map((v) => ({ v, label: String(v) }));
  const yt = yTicks ?? niceTicks(ya, yb, 4);
  return (
    <figure className={styles.fig}>
      <figcaption className={styles.head}>
        <span className={styles.title}>{title}</span>
        {sub && <span className={styles.sub}>{sub}</span>}
      </figcaption>
      <div ref={(el) => { boxRef.current = el; }} className={styles.box}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className={styles.svg} role="img" aria-label={ariaLabel}>
        {yt.map((v) => (
          <g key={`y${v}`}>
            <line x1={X0} x2={X1} y1={y(v)} y2={y(v)} className={styles.grid} />
            <text x={X0 - 5} y={y(v) + 3.5} className={styles.tick} textAnchor="end">{Math.abs(v) >= 1000 ? v.toLocaleString('en-US') : v}</text>
          </g>
        ))}
        {xt.map((t) => (
          <g key={`x${t.v}`}>
            <line x1={x(t.v)} x2={x(t.v)} y1={Y0} y2={Y1} className={styles.grid} />
            <line x1={x(t.v)} x2={x(t.v)} y1={Y1} y2={Y1 + 4} className={styles.axis} />
            <text x={x(t.v)} y={Y1 + 14} className={styles.tick} textAnchor="middle">{t.label}</text>
          </g>
        ))}
        <svg x={X0} y={Y0} width={X1 - X0} height={Y1 - Y0} viewBox={`${X0} ${Y0} ${X1 - X0} ${Y1 - Y0}`} overflow="hidden">
          {children({ x, y, X0, X1, Y0, Y1 })}
        </svg>
        <rect x={X0} y={Y0} width={X1 - X0} height={Y1 - Y0} className={styles.frame} />
        <text x={(X0 + X1) / 2} y={H - 4} className={styles.axisTitle} textAnchor="middle">{xLabel}</text>
        <text transform={`translate(10 ${(Y0 + Y1) / 2}) rotate(-90)`} className={styles.axisTitle} textAnchor="middle">{yLabel}</text>
      </svg>
      </div>
      {legend.length > 0 && (
        <ul className={styles.legend}>
          {legend.map((l) => (
            <li key={l.label}><i data-kind={l.kind} style={/** @type {React.CSSProperties} */ ({ '--tone': l.tone })} aria-hidden="true" />{l.label}</li>
          ))}
        </ul>
      )}
    </figure>
  );
}
