/**
 * Under a sensor picker on BUILD: whether the ECU is set up for the part just chosen,
 * and a one-tap way to make it so.
 *
 * Changing a sensor is two jobs — the part on BUILD and the ECU's setting for it on
 * TUNE › SENSORS — and forgetting the second one is the mistake the sensor lesson is
 * built around. Showing the state right where the part is chosen turns a silent fault
 * into a visible one, without doing the second job behind the player's back.
 */

import { AlertTriangle, Check } from 'lucide-react';
import React from 'react';

import { ecuHardwareOf, sensorMismatches } from '../../../sim/index.js';
import { ACTIONS } from '../../state/reducer.js';
import { useBuild, useTune } from '../../state/StoreProvider.jsx';

import styles from './SensorMatchNote.module.css';

/**
 * @param {object} props
 * @param {'map'|'wideband'} props.sensor which sensor this note sits under
 * @returns {React.ReactElement}
 */
export function SensorMatchNote({ sensor }) {
  const [build] = useBuild();
  const [tune, dispatch] = useTune();
  const fitted = ecuHardwareOf(build).sensorHw;
  const miss = sensorMismatches(fitted, tune.ecu).find((m) => m.path === `sensors.${sensor}`);
  const blindToBoost = sensor === 'map' && build.turboOn && fitted.map === '1bar';

  if (miss) {
    return (
      <div className={styles.warn} role="status">
        <AlertTriangle size={13} aria-hidden="true" className={styles.icon} />
        <span className={styles.text}>The ECU is still set for {miss.told}, so it will misread this sensor.</span>
        <button type="button" className={styles.fix}
          onClick={() => dispatch({ type: ACTIONS.SET_ECU, path: miss.path, value: miss.value })}>
          Set ECU to match
        </button>
      </div>
    );
  }
  if (blindToBoost) {
    return (
      <div className={styles.warn} role="status">
        <AlertTriangle size={13} aria-hidden="true" className={styles.icon} />
        <span className={styles.text}>This engine makes boost, and a 1-bar sensor stops reading at atmospheric. The ECU will not see boost and will fuel too little under it. Fit 2.5-bar or bigger.</span>
      </div>
    );
  }
  return (
    <div className={styles.ok}>
      <Check size={13} aria-hidden="true" className={styles.icon} />
      <span className={styles.text}>The ECU is set up for this sensor.</span>
    </div>
  );
}
