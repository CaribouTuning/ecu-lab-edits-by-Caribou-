/**
 * Physical constants — real measured values, not tuning knobs.
 *
 * Nothing in this file is an adjustable parameter. If you find yourself wanting to
 * change a number here to make the engine behave differently, the value you actually
 * want is in `coefficients.js` instead.
 *
 * The simulation works in real engineering units throughout:
 *   pressure kPa · temperature K · air & fuel mass grams · time ms
 *   energy J · torque Nm internally (converted to lb-ft only for display)
 *   MEP values Pa · airflow g/s · power W (converted to hp for display)
 */

/** Specific gas constant for air, J/(kg·K). */
export const R_AIR = 287;

/** Sea-level ambient pressure, kPa. */
export const BARO_KPA = 101.325;

/** Kelvin to Celsius offset. */
export const KELVIN_OFFSET = 273.15;

/** Ambient air temperature, K. */
export const AMBIENT_K = 298;

/**
 * The same ambient temperature in Celsius, 24.85 °C.
 *
 * Derived rather than written out, because two places used to state ambient
 * independently — `AMBIENT_K` here and a bare `25` in the knock model's IAT penalty —
 * and they did not agree. Everything that needs ambient in Celsius must come through
 * this, so the model cannot hold two ambients at once.
 */
export const AMBIENT_C = AMBIENT_K - KELVIN_OFFSET;

/** Pounds per square inch to kilopascals. */
export const PSI_TO_KPA = 6.895;

/** Kilopascals per bar — cylinder pressures are conventionally quoted in bar. */
export const KPA_PER_BAR = 100;

/** (γ−1)/γ for air — the isentropic compression exponent. */
export const GAMMA_EXP = 0.286;

/** Typical turbocharger compressor isentropic efficiency. */
export const COMP_ISEN_EFF = 0.70;

/** Fraction of the compression temperature rise an intercooler removes. */
export const IC_EFFECTIVENESS = 0.70;

/** Fraction of the ideal Otto cycle realised as INDICATED work. */
export const OTTO_REALIZATION = 0.685;

/** Crank → wheel transmission efficiency. */
export const DRIVETRAIN_EFF = 0.85;

/** Injector opening latency at ~13.5 V, ms. */
export const INJ_DEADTIME_MS = 1.0;

/** How strongly bore:stroke ratio biases the powerband. */
export const CHAR_SCALE = 0.3;
