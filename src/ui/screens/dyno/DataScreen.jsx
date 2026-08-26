/**
 * DYNO > DATALOG (per-breakpoint asked-vs-got readout, and the fuel-trim histogram).
 *
 * Everything here reads the store directly rather than taking props — `result`,
 * `histogram` and `ve` are all plain state, not shell-level derivations, and
 * nothing here has a second consumer elsewhere in the app. `buildHistogram` and
 * `applyHistogram` moved down with the markup for the same reason: their only
 * caller was this section's two buttons.
 */

import React from 'react';

import { Grid3x3, Info } from 'lucide-react';

import { clamp, LOAD, RPM } from '../../../sim/index.js';
import { ExpandableInfo } from '../../components/ExpandableInfo.jsx';
import { Button } from '../../primitives/Button.jsx';
import { Eyebrow } from '../../primitives/Eyebrow.jsx';
import { ACTIONS } from '../../state/reducer.js';
import { useSession, useTune } from '../../state/StoreProvider.jsx';
import { deltaHeat, T, utilisationColor } from '../../theme.js';

import styles from './DataScreen.module.css';

/**
 * @returns {React.ReactElement}
 */
export function DataScreen() {
  const [session, dispatch] = useSession();
  const { result, histogram } = session;
  const [tune] = useTune();
  const { ve } = tune;

  // HISTOGRAM — the core real-world tuning workflow. A pull's lambda error is
  // binned onto the same RPM x MAP grid as the VE table, so the correction can be
  // applied cell-for-cell. This is what HP Tuners' scanner histogram does.
  const buildHistogram = () => {
    if (!result) return;
    const cells = LOAD.map(() => RPM.map(() => ({ sum: 0, n: 0 })));
    result.points.forEach((p) => {
      let ri = 0, best = Infinity;
      LOAD.forEach((m, i) => { const d = Math.abs(m - p.map); if (d < best) { best = d; ri = i; } });
      let ci = 0, bc = Infinity;
      RPM.forEach((r, i) => { const d = Math.abs(r - p.rpm); if (d < bc) { bc = d; ci = i; } });
      // Airflow error % = how far the ACTUAL mixture sat from what was commanded.
      //
      // Sign convention, because getting it backwards makes the tool teach the exact
      // wrong reflex: the ECU fuels from the VE table, so
      //     actualAfr / commandedAfr  =  trueVE / tableVE
      // A positive number therefore means the engine ran LEANER than commanded, which
      // means it swallowed MORE air than the table claimed, which means the table is
      // reading low and must come UP by that percentage. Multiplying the cell by
      // (1 + err/100) drives the table onto the truth in one pass.
      const err = ((p.afr / p.afrCommanded) - 1) * 100;
      cells[ri][ci].sum += err; cells[ri][ci].n += 1;
    });
    dispatch({ type: ACTIONS.SET_SESSION_FIELD, field: 'histogram', value: cells.map((row) => row.map((c) => (c.n ? c.sum / c.n : null))) });
  };
  const applyHistogram = () => {
    if (!histogram) return;
    // SET_TABLE carries a value, not a function, so the old functional update
    // (`setVeEdited((prev) => ...)`) is resolved here against the CURRENT `ve` — the
    // one already in scope from the store — before dispatching.
    const nextVe = ve.map((row, ri) => row.map((v, ci) => {
      const e = histogram[ri][ci];
      return e == null ? v : Number(clamp(v * (1 + e / 100), 10, 130).toFixed(1));
    }));
    dispatch({ type: ACTIONS.SET_TABLE, table: 've', value: nextVe });
    dispatch({ type: ACTIONS.SET_SESSION_FIELD, field: 'histogram', value: null });
  };

  return (
    <>
      <Eyebrow icon={Info}>Datalog</Eyebrow>
      <div className={styles.intro}>
        One card per RPM breakpoint. Each line pairs <b className={styles.em}>what you asked for</b> with <b className={styles.em}>what the engine actually did</b> — a mismatch is the ECU telling you something.
      </div>

      <div className={styles.cards}>
        {RPM.map((r) => {
          const p = result.points.find((pt) => pt.rpm === r);
          if (!p) return null;
          const bad = p.knock || p.fuelLimited || p.leanRisk || p.richRisk || p.pressureRisk;
          const warn = !bad && (p.duty > 85 || p.egtRisk);
          const tone = bad ? 'danger' : warn ? 'warn' : 'ok';

          // Each row: label, what was asked, what happened, and a verdict.
          const rows = [
            { k: 'Airflow', asked: p.veTable !== p.ve ? `${p.veTable}% VE` : null, got: `${p.maf} g/s`,
              note: p.veTable !== p.ve
                ? `${p.map} kPa manifold · table says ${p.veTable}% VE, engine actually flowed ${p.ve}%`
                : `${p.map} kPa manifold · ${p.ve}% VE`,
              ok: Math.abs(p.veTable - p.ve) / Math.max(1, p.ve) < 0.03 },
            { k: 'Timing', asked: `${p.commandedTiming}°`, got: `${p.timing}°`,
              note: p.knock ? `ECU pulled ${p.knockPull.toFixed(1)}° — too advanced for this cylinder pressure` : 'ran your commanded value',
              ok: !p.knock },
            { k: 'Mixture', asked: `${p.afrCommanded}:1`, got: `${p.afr}:1`,
              note: p.fuelLimited ? 'injectors out of time — mixture leaned out on its own'
                : p.richRisk ? 'far richer than commanded — check injector scaling'
                : `lambda ${p.lambda} · best power here is ${p.bestAfr}:1`,
              ok: !p.fuelLimited && !p.richRisk && !p.leanRisk },
            // Same "no headroom left" cutoff as the build tab's duty preview,
            // asked the same way: utilisationColor owns the band, and this
            // reads its verdict rather than restating >90 twice more.
            { k: 'Injectors', asked: null, got: `${p.duty}% duty`,
              note: `${p.pw} ms of the ${(120000 / p.rpm).toFixed(1)} ms available${utilisationColor(p.duty) === T.danger ? ' — at the limit' : ''}`,
              ok: utilisationColor(p.duty) !== T.danger },
            { k: 'Heat', asked: null, got: `${p.egt}°C`,
              note: `intake charge ${p.iat}°C${p.egtRisk ? ' · exhaust running hot — retard and lean mixture are what put it there' : ''}`,
              ok: !p.egtRisk },
            { k: 'Pressure', asked: null, got: `${p.peakPressure} bar`,
              note: p.pressureRisk
                ? 'past what stock pistons and rods take — a mechanical limit, not detonation'
                : `what ${p.map} kPa becomes at the top of the stroke, burning at ${p.timing}°`,
              ok: !p.pressureRisk },
          ];

          return (
            <div key={r} className={styles.card} data-tone={tone}>
              <div className={styles.cardHead}>
                <span className={styles.cardRpm}>{r} RPM</span>
                <span className={styles.cardStat}>
                  {p.hp} whp · {p.torque} lb-ft{bad ? '  ⚠' : warn ? '  !' : '  ✓'}
                </span>
              </div>
              <div className={styles.cardBody}>
                {rows.map((row, i) => (
                  <div key={i} className={styles.row}>
                    <div className={styles.rowTop}>
                      <span className={styles.rowKey}>{row.k}</span>
                      <span className={styles.rowValue} data-ok={row.ok ? 'true' : 'false'}>
                        {row.asked != null && <span className={styles.rowAsked}>{row.asked} → </span>}
                        {row.got}
                      </span>
                    </div>
                    <div className={styles.rowNote} data-ok={row.ok ? 'true' : 'false'}>{row.note}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <ExpandableInfo title="How to read a datalog">
        Diagnosis happens in the <b className={styles.em}>asked → got</b> pairs, not in the power number.
        <br /><br /><b className={styles.em}>Timing</b>: if the two differ, the ECU overrode you. That is knock retard, and the gap is how far past the limit your table was. Tuners treat anything sustained above ~2° as damaging.
        <br /><br /><b className={styles.em}>Mixture</b>: if actual is not what you commanded, the cause is upstream of the fuel table — usually injectors out of duty cycle, MAF scaling, or an ECU injector size that does not match the hardware. Do not paper over it by editing fuel cells; fix the cause.
        <br /><br /><b className={styles.em}>Injectors</b>: duty is a time budget. At 7500 RPM there are only 16 ms in an engine cycle. Past about 90% there is no room left and the mixture goes lean regardless of what you asked for.
        <br /><br /><b className={styles.em}>Heat</b>: exhaust temperature rises with retarded timing and lean mixtures. Sustained above ~950°C cooks turbines and valves.
        <br /><br /><b className={styles.em}>Pressure</b>: peak cylinder pressure is what the piston, rod and bearings physically carry, and it is set by compression ratio multiplied by manifold pressure, not by boost alone. A naturally aspirated engine peaks near 50 bar; a factory turbo engine near 90-110. Past that, stock pistons and rods start failing <i>without</i> any detonation to warn you — which is exactly what high-octane fuel hides, because octane buys knock margin and nothing else.
      </ExpandableInfo>

      <Eyebrow icon={Grid3x3}>Fuel Trim Histogram</Eyebrow>
      <ExpandableInfo title="How real tuners actually correct a VE table">
        This is the workflow every professional platform is built around. You log a pull, bin the difference between commanded and actual mixture onto the same RPM x MAP grid as your VE table, then apply that error back into the cells.
        <br /><br />A cell reading <b className={styles.em}>+6%</b> means the engine ran 6% leaner than you commanded, which can only happen if it actually pulled 6% <i>more</i> air than your VE table claimed — so that cell should go <b className={styles.em}>up</b> 6%. A negative cell means the opposite: the table is over-reporting airflow, the ECU is over-fuelling, and the number should come down.
        <br /><br />The ECU has no way to measure cylinder filling directly. It fuels from your table and nothing else, so a wrong table means wrong fuel, every time. Blue cells are within tolerance; red means your table is lying to the ECU at that point. Correct, re-pull, repeat until it is flat. A cell you hit squarely lands on the truth in one pass; the rest take a couple, because every logged point is interpolated between four cells.
      </ExpandableInfo>
      {!histogram ? (
        /* Was a cyan-outlined width:100% bar. Cyan is the chart-series
           hue — the same borrowed colour Task 6 took off the intercooler
           toggle — so this takes the accent like every other action. */
        <div className={styles.buildWrap}>
          <Button onClick={buildHistogram}>
            BUILD HISTOGRAM FROM THIS PULL
          </Button>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <div className={styles.tableScroll}>
            <div className={styles.tableInner}>
              <div className={styles.tableRow}>
                <div className={styles.cornerCell} />
                {RPM.map((r) => (
                  <div key={r} className={styles.headerCell}>{r}</div>
                ))}
              </div>
              {LOAD.map((m, ri) => (
                <div key={m} className={styles.tableRow}>
                  <div className={styles.loadCell}>{m}</div>
                  {RPM.map((_, ci) => {
                    const e = histogram[ri][ci];
                    const bg = e == null ? T.panel2 : deltaHeat(e);
                    return (
                      <div key={ci} className={styles.dataCell} data-empty={e == null ? 'true' : 'false'} style={{ background: bg }}>
                        {e == null ? '—' : `${e > 0 ? '+' : ''}${e.toFixed(1)}`}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className={styles.legend}>Cells show % airflow error (blank = not visited during this pull). Rows are MAP kPa, columns RPM.</div>
          <div className={styles.actions}>
            <Button style={{ flex: 2 }} onClick={applyHistogram}>
              APPLY CORRECTIONS TO VE
            </Button>
            {/* Not `danger`: discarding throws away a histogram that
                BUILD HISTOGRAM regenerates from the same pull. */}
            <Button variant="ghost" style={{ flex: 1 }} onClick={() => dispatch({ type: ACTIONS.SET_SESSION_FIELD, field: 'histogram', value: null })}>
              DISCARD
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
