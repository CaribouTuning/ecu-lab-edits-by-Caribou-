/**
 * TUNE > Injectors (fuel system: octane, physical injectors, ECU injector scaling).
 *
 * `dutyPreview` and `injectorCc` are the shell's rather than this screen's own: both
 * feed the score breakdown and the dyno payload too, so the shell keeps owning them.
 * `fuel`, by contrast, is a pure lookup off `octaneIdx` — which this screen already
 * reads from the store for the Octane `Seg` — so it is derived here rather than
 * threaded down as its own prop. `dutyDangerous` has exactly one reader — this
 * screen's duty panel — so it is computed here too, off the shared `dutyPreview`,
 * rather than threaded down as its own prop.
 */

import React from 'react';

import { Fuel } from 'lucide-react';

import { INJECTOR_OPTS, OCTANE_OPTS } from '../../../sim/index.js';
import { ExpandableInfo } from '../../components/ExpandableInfo.jsx';
import { PickList } from '../../components/PickList.jsx';
import { Bar } from '../../primitives/Bar.jsx';
import { Button } from '../../primitives/Button.jsx';
import { Eyebrow } from '../../primitives/Eyebrow.jsx';
import { Note } from '../../primitives/Note.jsx';
import { Panel } from '../../primitives/Panel.jsx';
import { Seg } from '../../primitives/Seg.jsx';
import { ACTIONS } from '../../state/reducer.js';
import { useBuild } from '../../state/StoreProvider.jsx';
import { T, utilisationColor } from '../../theme.js';

import styles from './InjectorsScreen.module.css';

/**
 * @param {object} props
 * @param {number} props.dutyPreview injector duty at WOT/6500rpm — the shell's,
 *   also read by the score breakdown and dyno payload
 * @param {number} props.injectorCc the shell's — `INJECTOR_OPTS[injIdx].cc`, also
 *   read by the same computations as `dutyPreview`
 * @returns {React.ReactElement}
 */
export function InjectorsScreen({ dutyPreview, injectorCc }) {
  const [build, dispatch] = useBuild();
  const { turboOn, octaneIdx, injIdx, ecuInjectorCc } = build;
  const fuel = OCTANE_OPTS[octaneIdx];
  const dutyDangerous = utilisationColor(dutyPreview) === T.danger;

  return (
    <div className={styles.wrap}>
      <Eyebrow icon={Fuel}>Fuel System</Eyebrow>
      {!turboOn && <Note>Naturally aspirated — no turbo installed. Add one on <b>BUILD</b> if you want boost to tune around.</Note>}
      {turboOn && <Note>Turbo hardware and the boost target curve live on <b>BUILD</b> — this tab is fuel-side tuning: octane, injectors, and MAF/ECU.</Note>}

      <div className={styles.label}>Fuel Octane</div>
      <Seg label="Fuel Octane" options={OCTANE_OPTS.map((o) => ({ label: o.label, id: o.label }))} value={OCTANE_OPTS[octaneIdx].label} onChange={(v) => dispatch({ type: ACTIONS.SET_BUILD_FIELD, field: 'octaneIdx', value: OCTANE_OPTS.findIndex((o) => o.label === v) })} />
      <ExpandableInfo title="What octane actually does — and what E85 costs you">
        Octane measures a fuel's resistance to auto-igniting under heat and pressure before the spark fires it — not energy content or "power." Higher octane tolerates more cylinder pressure and temperature before knock, letting a tuner run more advance or more boost safely. It does not add power on its own; it raises the ceiling for how much timing/boost you can use before knock becomes the limit.
        <br /><br /><b className={styles.em}>E85 is not a free upgrade.</b> Its stoichiometric point is about 9.8:1, not gasoline's 14.7:1 — so hitting the same lambda takes roughly <b className={styles.emAcc}>1.43× the fuel volume</b>. Switch to E85 without upsizing injectors and you will run out of duty cycle long before you cash in that knock margin. Watch the duty preview below change the moment you select it.
        <br /><br />That trade — huge knock resistance, huge fuel demand — is exactly why serious E85 builds pair it with bigger injectors and a bigger pump, and why "just run E85" is not a shortcut around a fuel system.
      </ExpandableInfo>

      <div className={styles.labelTight}>Fuel Injectors</div>
      <PickList options={INJECTOR_OPTS.map((o) => ({ label: o.label, value: o.label }))} value={INJECTOR_OPTS[injIdx].label} onChange={(v) => dispatch({ type: ACTIONS.SET_BUILD_FIELD, field: 'injIdx', value: INJECTOR_OPTS.findIndex((o) => o.label === v) })} />
      <div className={styles.label}>
        ECU Injector Scaling <span className={styles.subLabel}>— what the ECU thinks is fitted</span>
      </div>
      <Seg label="ECU Injector Scaling" options={INJECTOR_OPTS.map((o) => ({ label: `${o.cc}`, id: o.cc }))} value={ecuInjectorCc} onChange={(v) => dispatch({ type: ACTIONS.SET_BUILD_FIELD, field: 'ecuInjectorCc', value: v })} equal />
      {ecuInjectorCc !== injectorCc ? (
        <div className={styles.mismatchBanner}>
          <b>Scaling mismatch.</b> Hardware is {injectorCc}cc but the ECU is calibrated for {ecuInjectorCc}cc — every pulse delivers about {((injectorCc / ecuInjectorCc) * 100).toFixed(0)}% of the intended fuel, so the engine runs {injectorCc > ecuInjectorCc ? 'far too rich' : 'dangerously lean'} everywhere.
          {/* The wrapper, not the button, is what breaks the line: the button
              sits inside a paragraph and is inline-flex, so without a block
              parent it would run on from the end of the warning text. */}
          <div className={styles.mismatchAction}>
            <Button onClick={() => dispatch({ type: ACTIONS.SET_BUILD_FIELD, field: 'ecuInjectorCc', value: injectorCc })}>
              RESCALE ECU TO {injectorCc}cc
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.matchNote}>ECU scaling matches the fitted injectors.</div>
      )}
      <ExpandableInfo title="Injector scaling — the step everyone forgets">
        The ECU never commands "fuel" — it commands a pulse width, calculated for the injector size it has been <i>told</i> is fitted. Bolt in bigger injectors without updating that number and every pulse delivers proportionally more fuel than intended, so the engine runs rich everywhere regardless of what your AFR table says.
        <br /><br />Every real tuning platform has this constant: UpRev calls it the <b className={styles.em}>K-fuel multiplier</b> (lower it for bigger injectors), HP Tuners calls it <b className={styles.em}>injector flow rate</b>. It is the first thing you change after a fuel system upgrade, before touching any table.
      </ExpandableInfo>

      <ExpandableInfo title="Why injector duty cycle limits everything">
        Injectors flow a rated amount of fuel, and the ECU controls delivery by varying how long each stays open per cycle. As RPM and airflow rise, more fuel is needed in less time, and eventually the injector is open almost the whole cycle — that is duty cycle nearing 100%. Past about 90%, there is no more room to add fuel even if the AFR table calls for it, so the mixture leans out on its own regardless of what you commanded.
      </ExpandableInfo>

      <Panel tight className={styles.dutyPanel}>
        <div className={styles.dutyHead}>
          <div className={styles.dutyHeadLabel}>INJECTOR DUTY PREVIEW · WOT @ 6500 RPM</div>
          {fuel.stoich < 14 && <div className={styles.dutyFuelNote}>{fuel.label} stoich {fuel.stoich}:1</div>}
        </div>
        <div className={styles.dutyBarWrap}>
          <Bar label="Duty" value={dutyPreview} higherIsBetter={false} />
        </div>
        {/* The figure itself is the Bar's, now that it has a label row of its own —
            restating it here put the same number on screen twice, seven pixels
            apart. What is left is the part the Bar cannot say: what an undersized
            injector is about to do to the mixture. */}
        {dutyDangerous && (
          <div className={styles.dutyWarning}>
            Undersized for this build — expect forced lean-out
          </div>
        )}
      </Panel>
    </div>
  );
}
