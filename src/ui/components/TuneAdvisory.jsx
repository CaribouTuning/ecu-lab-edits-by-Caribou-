/**
 * TUNE's advisor panel body: turns an `AdvisorReport` (`advisorReports.js`)
 * into prose.
 *
 * Pure by design — no store access, no computation of its own. `report.state`
 * picks which body renders and `report.detail` supplies the numbers that go
 * in it; every classification decision already happened in `advisorReports.js`
 * (which itself only reads what the sim's advisors concluded — see that
 * file's header for why re-deriving a category here would be a bug, not a
 * convenience).
 *
 * `kind` distinguishes the three grid screens sharing this component: SPARK
 * (`'timing'`, this task), FUEL (`'afr'`) and AIRFLOW (`'ve'`), the latter two
 * arriving in Tasks 5 and 6.
 */

import React from 'react';

import styles from './TuneAdvisory.module.css';

/** @typedef {import('./advisorReports.js').AdvisorReport} AdvisorReport */

/**
 * @param {object} props
 * @param {'ve'|'timing'|'afr'} props.kind
 * @param {AdvisorReport} props.report
 * @param {() => void} [props.onAcceptVe] only read by the `'ve'` kind (Task 6)
 * @returns {React.ReactElement|null}
 */
// eslint-disable-next-line no-unused-vars -- onAcceptVe is part of the interface Tasks 5/6 extend; the 've' kind lands in Task 6.
export function TuneAdvisory({ kind, report, onAcceptVe }) {
  if (kind === 'timing') return <TimingAdvisory report={report} />;
  return null;
}

/**
 * The cell's coordinates and its four numbers, as a small definition list.
 * Shared by every `cell-*` state below.
 * @param {object} props
 * @param {object} props.cell a `spark` row from `calibrationAdvice`
 * @returns {React.ReactElement}
 */
function CellStats({ cell }) {
  return (
    <>
      <div className={styles.bannerCell}>{cell.map} kPa / {cell.rpm} RPM</div>
      <dl className={styles.cellStats}>
        <dt>Your value</dt><dd>{cell.current}°</dd>
        <dt>Knock limit</dt><dd>{cell.knockCeiling}°</dd>
        <dt>MBT</dt><dd>{cell.mbt}°</dd>
        <dt>Suggested</dt><dd>{cell.suggested}°</dd>
      </dl>
    </>
  );
}

/**
 * @param {object} props
 * @param {AdvisorReport} props.report
 * @returns {React.ReactElement|null}
 */
function TimingAdvisory({ report }) {
  const { state, detail } = report;

  switch (state) {
    // Table-wide, mutually exclusive — the same four states SparkScreen used
    // to fall through to, moved here verbatim. The outer bordered/tinted box
    // does NOT come along: the panel already renders and colours that surface
    // from `report.tone`, so nesting a second one here would double it up.
    case 'table-over':
      return (
        <>
          <div className={styles.bannerBody}>
            Your current hardware will not tolerate this much advance here. These cells are asking for more timing than the charge, octane and compression allow:
          </div>
          {detail.cells.map((c, i) => (
            <div key={i} className={styles.bannerCell}>
              {c.map} kPa / {c.rpm} RPM: {c.current}° → {c.suggested}°
            </div>
          ))}
          {detail.more > 0 && <div className={styles.bannerMore}>…and {detail.more} more</div>}
          <div className={styles.bannerFooter}>Edit them yourself — a calibration is yours to make, not something the app should silently rewrite.</div>
        </>
      );
    case 'table-under':
      return (
        <div className={styles.prose}>
          <b className={styles.em}>Timing left on the table.</b> {detail.count} cells are more than 3° below what this build would tolerate. Safe, but you are giving away torque — advance them a little at a time and pull between each change.
        </div>
      );
    case 'table-past-mbt':
      return (
        <div className={styles.prose}>
          <b className={styles.em}>Past peak torque.</b> {detail.count} cells command more advance than the burn can use — the charge is already finishing where it should, so the extra degrees are working against the piston on its way up rather than adding torque. Not dangerous here — these cells are inside the knock limit — but pulling them back gains a little power and buys margin.
        </div>
      );
    case 'table-clean':
      return <div className={`${styles.prose} ${styles.ok}`}>Spark table sits within the knock limit for this hardware.</div>;

    // A single selected cell. These states did not exist before the panel —
    // `SparkScreen` never narrowed to a selection — so there is no old markup
    // to preserve; the wording below is the brief's, verbatim.
    case 'cell-over':
      return (
        <div className={styles.prose}>
          <CellStats cell={detail.cell} />
          Past the knock limit the engine is damaging itself. Pull this cell back to the suggested value, or lower.
        </div>
      );
    case 'cell-past-mbt':
      return (
        <div className={styles.prose}>
          <CellStats cell={detail.cell} />
          The burn already lands where it should, so the extra degrees are pushing against the piston on the way up rather than making torque. Not dangerous — this cell is inside the knock limit — but pulling it back gains a little power and buys margin.
        </div>
      );
    case 'cell-under':
      return (
        <div className={styles.prose}>
          <CellStats cell={detail.cell} />
          This cell is leaving advance on the table. Add it a degree at a time and run a pull between each change.
        </div>
      );
    case 'cell-ok':
      return (
        <div className={`${styles.prose} ${styles.ok}`}>
          <CellStats cell={detail.cell} />
          Inside both the knock limit and MBT. Nothing to correct here.
        </div>
      );
    case 'cell-unreachable':
      return (
        <div className={styles.prose}>
          This build never reaches this manifold pressure at this engine speed, so the advisor has nothing to say about the cell. It is still yours to edit — it just will not be used.
        </div>
      );

    // A selected row or column. Severity already picked the tone and headline
    // (Task 3); the body just points at the fix.
    case 'group-over':
    case 'group-past-mbt':
    case 'group-under':
      return <div className={styles.prose}>Select a single cell to see its numbers.</div>;
    case 'group-clean':
      return <div className={`${styles.prose} ${styles.ok}`}>Select a single cell to see its numbers.</div>;

    default:
      return null;
  }
}
