/**
 * BUILD > Fuel System.
 *
 * What is physically FITTED: octane in the tank and the injectors bolted in. What
 * the ECU BELIEVES is fitted — the injector scaling it calculates pulse width
 * against — lives on TUNE > Injectors instead, deliberately: `RESCALE ECU TO
 * ###cc` exists precisely because hardware and calibration can disagree, and
 * splitting them across tabs is the honest depiction of that gap rather than two
 * controls sitting side by side pretending to be one setting.
 *
 * Relocated from TUNE > Injectors (originally `EcuScreen.jsx:65-74`) by the
 * BUILD/TUNE re-section; markup and dispatches unchanged.
 */

import { Fuel } from 'lucide-react';
import React from 'react';

import { INJECTOR_OPTS, OCTANE_OPTS } from '../../../sim/index.js';
import { BuildSection } from '../../components/BuildSection.jsx';
import { ExpandableInfo } from '../../components/ExpandableInfo.jsx';
import { PickList } from '../../components/PickList.jsx';
import { Seg } from '../../primitives/Seg.jsx';
import { ACTIONS } from '../../state/reducer.js';
import { useBuild } from '../../state/StoreProvider.jsx';

import styles from './FuelSystemScreen.module.css';

/**
 * @param {object} props
 * @param {boolean} props.active whether this is BUILD's open section
 * @param {(section: string) => void} props.onToggle opens or closes a BUILD section
 * @returns {React.ReactElement}
 */
export function FuelSystemScreen({ active, onToggle }) {
  const [build, dispatch] = useBuild();
  const { octaneIdx, injIdx } = build;

  return (
    <BuildSection
      active={active} onClick={() => onToggle('fuel')}
      icon={Fuel} label="Fuel System"
      sub={`${OCTANE_OPTS[octaneIdx].label} · ${INJECTOR_OPTS[injIdx].label}`}
    >
      <div className={styles.label}>Fuel Octane</div>
      <Seg label="Fuel Octane" options={OCTANE_OPTS.map((o) => ({ label: o.label, id: o.label }))} value={OCTANE_OPTS[octaneIdx].label} onChange={(v) => dispatch({ type: ACTIONS.SET_BUILD_FIELD, field: 'octaneIdx', value: OCTANE_OPTS.findIndex((o) => o.label === v) })} />
      <ExpandableInfo title="What Fuel Octane actually does — and what E85 costs you">
        Octane measures a fuel's resistance to auto-igniting under heat and pressure before the spark fires it — not energy content or "power." Higher octane tolerates more cylinder pressure and temperature before knock, letting a tuner run more advance or more boost safely. It does not add power on its own; it raises the ceiling for how much timing/boost you can use before knock becomes the limit.
        <br /><br /><b className={styles.em}>E85 is not a free upgrade.</b> Its stoichiometric point is about 9.8:1, not gasoline's 14.7:1 — so hitting the same lambda takes roughly <b className={styles.emAcc}>1.43× the fuel volume</b>. Switch to E85 without upsizing injectors and you will run out of duty cycle long before you cash in that knock margin. Watch the duty preview on <b className={styles.em}>TUNE &rsaquo; Injectors</b> change the moment you select it.
        <br /><br />That trade — huge knock resistance, huge fuel demand — is exactly why serious E85 builds pair it with bigger injectors and a bigger pump, and why "just run E85" is not a shortcut around a fuel system.
      </ExpandableInfo>

      <div className={styles.labelSpaced}>Fuel Injectors</div>
      <PickList options={INJECTOR_OPTS.map((o) => ({ label: o.label, value: o.label }))} value={INJECTOR_OPTS[injIdx].label} onChange={(v) => dispatch({ type: ACTIONS.SET_BUILD_FIELD, field: 'injIdx', value: INJECTOR_OPTS.findIndex((o) => o.label === v) })} />
    </BuildSection>
  );
}
