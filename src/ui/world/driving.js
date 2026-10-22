/**
 * Driving a tuned car: a planar vehicle model whose engine is the one the player built.
 *
 * The torque comes from the car's own dyno pull (`torqueCurveFromSweep`), the gearing, tyre
 * grip, mass, drag, drivetrain layout and gearbox from its DragCar, the same description the
 * drag strip runs. So a bigger turbo, a worse tune or a lighter flywheel is something you
 * feel through the seat of the pants, and the in-world 0-60 agrees with the strip's
 * (tests/driving.test.js holds it to that).
 *
 * THE MODEL
 *   Two axles (a single-track "bicycle" model) on a body with mass, yaw inertia and a
 *   centre of gravity height. Each axle has a lumped wheel with its own spin, so the tyres
 *   can really slip: a burnout, a locked brake, a slide are states of the model and not
 *   special cases.
 *     tyre force   F = mu * Fz * f(sigma),  sigma = hypot(kappa/kappa_peak, tan(alpha)/tan(alpha_peak))
 *                  f(sigma) = sin(1.5 * atan(1.732 * sigma)), peaking at sigma = 1 and falling to 71 %
 *                  of its peak when the tyre is sliding (combined slip: the grip circle)
 *     load shift   dFz = m * a * h / L (acceleration loads the rear, braking the front)
 *     driveline    wheel torque = engine torque * gear * final drive * efficiency, the engine
 *                  rigidly geared to the wheels once the clutch or converter has coupled
 *     resistance   aerodynamic drag 1/2 rho Cd A v^2 and rolling resistance Crr m g
 *   Nothing here adds speed: a part that adds power does it by moving the torque curve.
 *
 * Plain numbers in and out; no WebGL, so it is testable and the same step runs on the strip.
 */

import { NEUTRAL } from '../career/chassis.js';
import {
  DRIVETRAIN_OPTS, GEARBOX_OPTS, TIRE_GRIP, G, RHO_AIR, tireRadiusM,
} from '../../sim/index.js';

/** Integration step, seconds. Small, because a lumped wheel under a stiff tyre is a stiff equation. */
export const STEP_S = 1 / 240;
/** Peak slip ratio at which a tyre gives its full longitudinal force. */
const KAPPA_PEAK = 0.11;
/** Peak slip angle (tangent) by tyre grade: stiffer slicks peak sooner. */
const ALPHA_PEAK = { street: 0.15, sport: 0.13, race: 0.1, drag: 0.1 };
/**
 * Shape constants of f(sigma): B = tan(pi/(2C)) so the peak lands on sigma = 1, and C sets how
 * much grip a sliding tyre keeps, sin(C pi/2): 1.3 keeps 89%, as a road tyre does. (At 1.5 it
 * kept 71%, and an axle that went past its peak fell off a cliff: a snap spin, not a slide.)
 */
const SHAPE_C = 1.3;
const SHAPE_B = Math.tan(Math.PI / (2 * SHAPE_C));
/**
 * Brakes: their torque at full pedal, as a multiple of what the tyres can hold. A road car's
 * brakes can lock its wheels with room to spare; it is the tyres, and the ABS keeping them just
 * short of locking, that set the stopping distance.
 */
const BRAKE_MARGIN = 1.25;
/** The share of the rear tyres' grip the rear brakes may use. */
const EBD_REAR_SHARE = 0.95;
/**
 * ABS: the slip each axle is held at under braking, a little short of the tyre's peak, and how
 * quickly the valve releases and re-applies (per second). It modulates, as the real one does,
 * rather than dumping the brake: the wheels sit near their best grip and the car still steers.
 */
const ABS_SLIP = 0.85;
const ABS_RELEASE = 40;
const ABS_APPLY = 8;
/** Mass of one wheel assembly and the share that is rim and tyre (what spins). kg, fraction. */
const WHEEL_MASS_KG = 20;
const WHEEL_RING = 0.7;
/** Engine rotational inertia, kg m^2 (src/sim/live.js ENGINE_INERTIA, kept in step by the test). */
const ENGINE_INERTIA = 0.18;
/** Engine speed the engine idles at, and the hysteresis the limiter works with, RPM. */
const IDLE_RPM = 850;
const LIMITER_BAND_RPM = 200;
/**
 * Traction control is a governor, not a switch: it trims the torque just enough to hold the
 * driven tyres at a slip a touch past their peak, where they push hardest. The trim builds up
 * (integral) while the slip is over the target and backs off while it is under, with a quick
 * extra cut (proportional) for a sudden flare. Gains are per second, per peak-slip of error.
 */
const TC_TARGET = 0.13;
const TC_GAIN = 6;
const TC_KICK = 0.6;
const TC_MAX_CUT = 0.95;
/** Traction control's ignition-cut cycles per second, and how much of the torque a cut event drops. */
const TC_CUT_HZ = 14;
const TC_DEPTH = 0.9;
/** Reverse gear ratio and speed ceiling. */
const REVERSE_RATIO = 3.4;
const REVERSE_MAX_MS = 8;
/** Seconds holding the brake at a stop before reverse is chosen without a fresh press. */
const REVERSE_HOLD_S = 1;
/**
 * The sprung body. Weight moves between the tyres two ways: part straight away, through the
 * suspension links and the roll centres, and the rest only as the body pitches and rolls on
 * its springs, a damped oscillation at the body's natural frequency (about 1.5 Hz on a road
 * car, quicker on stiffer springs). That lag is what a driver feels: the nose loading up under
 * braking, the car taking a set in a corner, the tail going light as you lift.
 */
const BODY_HZ = 1.5;
const BODY_DAMPING = 0.6;
const LINK_SHARE = 0.35;
/** Off the throttle at walking pace the car settles to rest: driveline drag and a light foot, m/s^2. */
const SETTLE_DECEL = 1.2;
const SETTLE_BELOW_MS = 3;
/** Steering lock at a standstill, radians, and how fast the wheels turn, rad/s. */
const STEER_LOCK = 0.5;
const STEER_RATE = 3.2;
/**
 * The most lock a driver uses at speed, as a multiple of the tyre's peak slip angle on top
 * of the geometric angle for the tightest turn the grip allows (L / R, R = v^2 / mu g).
 * A driver on a keyboard cannot feel a front tyre go past its peak; a real one stops adding
 * lock when it does, and this is that hand on the wheel.
 */
const STEER_PEAK_MARGIN = 0.85;
/**
 * The rear tyres peak at a smaller slip angle than the fronts. Every road car is set up to
 * understeer (wider rear tyres, rear toe-in, a softer front bar), because a car that
 * pushes wide at the limit is one a driver can save and a car that spins is not.
 */
const REAR_ALPHA_SCALE = 0.75;
/**
 * And they carry more rubber at the back: a road car's rear tyres are a size wider (a 350Z runs
 * 225s in front and 245s behind), worth this much more cornering grip. Without it the bicycle model is
 * balanced on a knife edge: at the limit each axle's grip times its distance from the centre
 * of mass is the same, and the slightest lift or brake tips the tail out.
 */
const REAR_GRIP = 1.08;
/** The front's extra share of the lateral load transfer over the chassis's spring-and-bar split. */
const FRONT_ROLL_BIAS = 0.08;
/**
 * Lateral load transfer and tyre load sensitivity. A cornering car loads its outside tyres
 * and unloads its inside ones, and a tyre's grip grows more slowly than its load, so the axle
 * that carries more of the roll gives up more grip. Road cars are set up with the stiffer
 * roll resistance at the front (chassis.rollShareF), so at the limit the nose runs wide: the
 * understeer is the physics, not a fudge.
 */
const TRACK_M = 1.55;
/** Grip lost per unit of extra load on a wheel (mu falls this much as load doubles). */
const LOAD_SENSITIVITY = 0.14;
/**
 * Tyre relaxation length by grade, metres: a tyre needs to roll about this far before its
 * sideways force catches up with a change of slip angle. It is what makes a car take a
 * moment to bite after the wheel is turned, instead of reacting instantly like a toy.
 */
const RELAX_M = { street: 0.55, sport: 0.45, race: 0.35, drag: 0.5 };
/** Stability control cuts the engine while the rear tyres are sliding sideways (combined slip past this). */
const ESC_REAR_SLIP = 1.05;
/**
 * Stability control: with the aids on, the ECU brakes single wheels to hold the yaw rate
 * to what the tyres can sustain (mu g / v) and to catch the slide before the rear passes
 * its peak. It is the same box of electronics as traction control, and switches off with it.
 */
const ESC_YAW_MARGIN = 1.08;
const ESC_RATE = 9;
/** The speed at which the reference car's understeer halves its yaw response, m/s. */
const ESC_CHAR_SPEED = 28;
/** How far the yaw rate may stray from the reference before the system acts, rad/s. */
const ESC_DEADBAND = 0.06;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Tyre force shape: 1 at sigma = 1, 0.71 when sliding. @param {number} s */
const shape = (s) => Math.sin(SHAPE_C * Math.atan(SHAPE_B * s));

/**
 * @typedef {object} Powertrain
 * @property {import('../../sim/index.js').DragCar} car mass, drag, gearing, tyres, layout, gearbox
 * @property {(rpm: number) => number} torqueNm crank torque at full throttle, N m
 * @property {(rpm: number) => number} engineBrakeNm closed-throttle drag of the engine, N m (positive)
 * @property {number} redline rev limit, RPM
 * @property {number} [peakHpRpm] where the car makes its peak power, for the automatic's shift point
 */

/**
 * @typedef {object} VehicleState
 * @property {number} x metres east
 * @property {number} z metres south
 * @property {number} heading radians, 0 faces +z, increasing turns toward +x
 * @property {number} vx forward speed, m/s
 * @property {number} vy sideways speed (left positive), m/s
 * @property {number} yawRate rad/s
 * @property {number} wF front wheel angular speed, rad/s
 * @property {number} wR rear wheel angular speed, rad/s
 * @property {number} steer front wheel angle, rad
 * @property {number} rpm engine speed
 * @property {number} gear 1..n forward, 0 neutral, -1 reverse
 * @property {number} shiftT seconds until an in-progress gearchange completes
 * @property {boolean} limiter fuel is cut at the rev limit
 * @property {number} throttle applied, 0..1
 * @property {number} brake applied, 0..1
 * @property {number} ax longitudinal acceleration, m/s^2
 * @property {number} ay lateral acceleration, m/s^2
 * @property {number} slipF front tyre slip, 0 (gripping) to 1+ (sliding)
 * @property {number} slipR rear tyre slip
 * @property {number} wheelspin rear tyre longitudinal slip ratio
 * @property {boolean} shifting
 * @property {number} odo metres driven
 * @property {boolean} manual the player is choosing the gear
 * @property {number} tcCut share of engine torque traction control is taking away, 0..1
 * @property {boolean} reverse
 * @property {number} aF front tyre slip angle (tangent) as the tyre has built it up
 * @property {number} aR rear tyre slip angle (tangent)
 * @property {number} _stopT seconds held at a stop with the brake, before reverse is chosen
 * @property {number} pitchA the acceleration the body has pitched to, m/s^2 (its springs' share of the transfer)
 * @property {number} pitchV and how fast that is changing
 * @property {number} rollA the cornering acceleration the body has rolled to, m/s^2
 * @property {number} rollV and how fast that is changing
 * @property {number} [clutchT] seconds since pulling away: the clutch taking up
 * @property {number} [tcPhase] where in its cut cycle traction control is, 0..1
 * @property {number} [tcLevel] traction control's built-up trim, 0..1
 * @property {boolean} [tcCutting] traction control is dropping sparks this instant
 * @property {number} [absF] the ABS valve on the front brakes, 0..1 of the pedal's pressure
 * @property {number} [absR] and on the rear
 * @property {boolean} _armed stopped with the brake let go: the next press of it selects reverse
 * @property {number} t seconds driven
 */

/**
 * The most front-wheel angle the driver uses at a speed: the tightest turn the grip allows,
 * plus the tyre's peak slip angle, never more than the rack's lock.
 * @param {number} speed m/s @param {number} L wheelbase @param {number} mu @param {number} alphaPeak
 */
function steerLock(speed, L, mu, alphaPeak) {
  return Math.min(STEER_LOCK, (L * mu * G) / Math.max(1, speed * speed) + alphaPeak * STEER_PEAK_MARGIN);
}

/**
 * The same for a car as it stands, for a driver (the AI) who wants to know what a full
 * turn of the wheel means right now.
 * @param {VehicleState} s @param {Powertrain} pt @param {number} [gripScale]
 */
export function lockFor(s, pt, gripScale = 1) {
  const grip = TIRE_GRIP[pt.car.gripIdx] ?? TIRE_GRIP[0];
  return steerLock(Math.hypot(s.vx, s.vy), pt.car.wheelbaseM, grip.mu * gripScale, ALPHA_PEAK[grip.grade] ?? 0.15);
}

/** Grip of a car's tyres on tarmac, for planning a corner. @param {Powertrain} pt */
export const tyreMu = (pt) => (TIRE_GRIP[pt.car.gripIdx] ?? TIRE_GRIP[0]).mu;

/** A car at rest. @param {{x?: number, z?: number, heading?: number}} [at] @returns {VehicleState} */
export function makeVehicle(at = {}) {
  return {
    x: at.x ?? 0, z: at.z ?? 0, heading: at.heading ?? 0, vx: 0, vy: 0, yawRate: 0, wF: 0, wR: 0, steer: 0, rpm: IDLE_RPM,
    gear: 1, shiftT: 0, limiter: false, throttle: 0, brake: 0, ax: 0, ay: 0, slipF: 0, slipR: 0, wheelspin: 0, shifting: false,
    odo: 0, manual: false, t: 0, reverse: false, tcCut: 0, _stopT: 0, _armed: true, aF: 0, aR: 0, pitchA: 0, pitchV: 0, rollA: 0, rollV: 0,
  };
}

/** @param {import('../../sim/index.js').DragCar} car */
export function geometry(car) {
  const L = car.wheelbaseM;
  const a = L * car.rearFrac; // CG to front axle: the rear carries a/L of the weight
  const b = L - a;
  const r = tireRadiusM(car);
  const Iw = WHEEL_MASS_KG * WHEEL_RING * r * r;
  return { L, a, b, r, h: car.cgHeightM, Iz: 1.2 * car.massKg * a * b, Iw };
}

/**
 * The gear an automatic would choose. Flat out it runs to the redline, as a driver on a
 * strip would; the lighter the throttle, the sooner it changes up, and it drops a gear
 * when the engine would otherwise fall off its torque.
 * @param {Powertrain} pt @param {VehicleState} s @param {number} throttle
 */
function autoGear(pt, s, throttle) {
  const { car, redline } = pt;
  const n = car.gearCount;
  const g = s.gear;
  if (g < 1) return 1;
  const v = Math.max(0, s.vx);
  const rpmIn = (gear) => (v / (2 * Math.PI * tireRadiusM(car))) * car.gears[gear - 1] * car.finalDrive * 60;
  const up = redline * (0.38 + 0.6 * throttle ** 1.5) - (throttle > 0.9 ? 120 : 0);
  if (g < n && rpmIn(g) > up) return g + 1;
  if (g > 1) {
    const low = rpmIn(g - 1);
    const downBelow = redline * (0.26 + 0.3 * throttle);
    if (rpmIn(g) < downBelow && low < up * 0.9) return g - 1;
  }
  return g;
}

/**
 * Advance the vehicle by one fixed step.
 *
 * @param {VehicleState} s state, mutated
 * @param {Powertrain} pt
 * @param {{throttle: number, brake: number, steer: number, handbrake?: boolean, shift?: -1|0|1, manual?: boolean, tc?: boolean, gripScale?: number, rollScale?: number, hold?: boolean}} input
 *   `hold` is a car held on a start line: on the brakes with the clutch down, the engine free to rev
 * @param {number} [dt]
 */
export function stepVehicle(s, pt, input, dt = STEP_S) {
  const { car } = pt;
  const geo = geometry(car);
  const grip = TIRE_GRIP[car.gripIdx] ?? TIRE_GRIP[0];
  const drive = DRIVETRAIN_OPTS[car.driveIdx] ?? DRIVETRAIN_OPTS[0];
  const box = GEARBOX_OPTS[car.boxIdx] ?? GEARBOX_OPTS[0];
  // Grass, gravel and wet paint grip less and drag more: the level says how much.
  const mu = grip.mu * (input.gripScale ?? 1);
  const alphaPeak = ALPHA_PEAK[grip.grade] ?? 0.15;
  const m = car.massKg;
  // Suspension, tyre and transmission settings (career/chassis.js); a car with none runs on the defaults.
  const ch = /** @type {any} */ (car).chassis ?? NEUTRAL;
  const { L, a, b, r, h, Iz, Iw } = geo;

  // ---- held on the line: nothing moves but the revs ----
  if (input.hold) {
    const t0 = clamp(input.throttle, 0, 1);
    const free = IDLE_RPM + (pt.redline * 0.75 - IDLE_RPM) * t0;
    s.rpm += (free - s.rpm) * Math.min(1, dt * 6);
    Object.assign(s, { vx: 0, vy: 0, yawRate: 0, wF: 0, wR: 0, ax: 0, ay: 0, pitchA: 0, pitchV: 0, rollA: 0, rollV: 0, throttle: t0, brake: 1, reverse: false, _stopT: 0, gear: 1, limiter: false, tcCut: 0 });
    s.t += dt;
    return;
  }

  // ---- driver ----
  let thr = clamp(input.throttle, 0, 1);
  let brk = clamp(input.brake, 0, 1);
  // Reverse: stopped, let go of the brake and press it again, or keep holding it at a stop for a
  // second. Waiting at a stop on the brake does not back the car up. The throttle goes back to drive.
  const stopped = Math.abs(s.vx) < 0.6;
  if (stopped && brk < 0.05) s._armed = true;
  else if (!stopped) s._armed = false;
  if (stopped && brk > 0.3 && thr < 0.05) {
    s._stopT += dt;
    if (s._armed || s._stopT > REVERSE_HOLD_S) s.reverse = true;
  } else if (thr > 0.2 && s.vx > -0.6) { s.reverse = false; s._stopT = 0; } else if (brk < 0.05) s._stopT = 0;
  const reversing = s.reverse && s.vx < 0.8;
  if (reversing) [thr, brk] = [brk, thr];

  // ---- steering: the lock closes up with speed, and the wheels take a moment to turn ----
  const speedAbs = Math.hypot(s.vx, s.vy);
  const lock = steerLock(speedAbs, L, mu, alphaPeak);
  const wantSteer = -clamp(input.steer, -1, 1) * lock;
  const dSteer = clamp(wantSteer - s.steer, -STEER_RATE * dt, STEER_RATE * dt);
  s.steer += dSteer;

  // ---- gearbox ----
  s.manual = !!input.manual;
  if (s.shiftT > 0) { s.shiftT -= dt; if (s.shiftT <= 0) s.shifting = false; }
  if (!reversing) {
    let want = s.gear;
    if (input.shift) want = clamp(s.gear + input.shift, 1, car.gearCount);
    else if (!s.manual) want = autoGear(pt, s, thr);
    if (want !== s.gear && s.shiftT <= 0) {
      s.gear = want;
      s.shiftT = box.shiftSec * (ch.shiftScale ?? 1);
      s.shifting = true;
    }
  }
  const ratio = reversing ? -REVERSE_RATIO : car.gears[clamp(s.gear, 1, car.gearCount) - 1];
  const overall = ratio * car.finalDrive;

  // ---- loads on the axles ----
  const wTotal = m * G;
  // Through the links at once, through the springs as the body gets there.
  const axLoad = LINK_SHARE * s.ax + (1 - LINK_SHARE) * s.pitchA;
  const ayLoad = LINK_SHARE * s.ay + (1 - LINK_SHARE) * s.rollA;
  const shift = (m * axLoad * h) / L;
  const FzR = clamp((wTotal * a) / L + shift, wTotal * 0.15, wTotal * 0.85);
  const FzF = wTotal - FzR;

  // ---- velocities at the axles (body frame; x forward, y left) ----
  const vyF = s.vy + a * s.yawRate;
  const vyR = s.vy - b * s.yawRate;
  const cosD = Math.cos(s.steer);
  const sinD = Math.sin(s.steer);
  // Front axle velocity in the wheel's own frame.
  const uF = s.vx * cosD + vyF * sinD;
  const vF = -s.vx * sinD + vyF * cosD;
  const uR = s.vx;
  const vR = vyR;

  // ---- engine ----
  const rpmWheels = Math.abs(s.wR) * Math.abs(overall) * 60 / (2 * Math.PI);
  // A clutch or converter lets the engine sit above the wheels off the line.
  // Off the line the engine sits at its launch speed, then comes down onto the wheels: a clutch
  // takes up over its engagement time (as the strip model's does), a converter slips less as
  // the car gathers speed. Either way the revs fall and then climb with the road speed, not
  // pinned at one note while the car speeds up (which is what a CVT does, and sounds like).
  const launch = IDLE_RPM + (box.launchRpm - IDLE_RPM) * thr;
  if (Math.abs(s.vx) < 0.5 && thr < 0.05) s.clutchT = 0;
  else if (thr > 0.05) s.clutchT = (s.clutchT ?? 0) + dt;
  const engaged = box.engageSec > 0
    // A driver lets the clutch out progressively: it bites late, so the revs dip without bogging.
    ? clamp((s.clutchT ?? 0) / box.engageSec, 0, 1) ** 2
    : clamp(Math.abs(s.vx) / Math.max(1, box.couplingSpeedMs), 0, 1);
  const slipRpm = launch * (1 - engaged) + rpmWheels * engaged;
  const coupled = rpmWheels >= slipRpm - 1;
  let rpm = coupled ? rpmWheels : slipRpm;
  if (s.limiter) { if (rpm < pt.redline - LIMITER_BAND_RPM) s.limiter = false; } else if (rpm >= pt.redline) s.limiter = true;
  const converter = box.torqueMult > 1 ? box.torqueMult - (box.torqueMult - 1) * clamp(Math.abs(s.vx) / Math.max(1, box.couplingSpeedMs), 0, 1) : 1;
  let tqEng;
  if (s.limiter || s.shifting || s.gear < 1) tqEng = -pt.engineBrakeNm(rpm) * (s.limiter ? 0 : 0.6);
  else tqEng = pt.torqueNm(clamp(rpm, 1000, pt.redline)) * thr - pt.engineBrakeNm(rpm) * (1 - thr) * (coupled ? 1 : 0.3);
  if (!coupled && tqEng < 0) tqEng = 0;
  const clutchLimit = coupled ? Infinity : pt.torqueNm(clamp(launch, 1000, pt.redline)) * 1.1 * converter;
  // The dyno-derived torque curve already has the driveline's loss taken off (see
  // torqueCurveFromSweep), so the gearing multiplies it as it stands.
  let tqWheelIn = clamp(tqEng * (tqEng > 0 ? converter : 1), -Infinity, clutchLimit) * overall;
  // Engine braking holds the wheels back whichever way they turn: a car rolling backwards in a
  // forward gear is slowed by it, not pushed.
  if (tqEng < 0) tqWheelIn = -Math.abs(tqWheelIn) * Math.sign(s.wR);
  // Traction control: what every modern car's ECU does, and what a driver does with his right
  // foot: back off the torque as the driven tyres go past their peak slip.
  if (input.tc !== false && tqEng > 0 && !input.handbrake) {
    const kap = (Math.abs(s.wR) * r - Math.abs(s.vx)) / Math.max(Math.abs(s.vx), 1.2);
    const err = (kap - TC_TARGET) / KAPPA_PEAK;
    s.tcLevel = clamp((s.tcLevel ?? 0) + dt * TC_GAIN * err, 0, TC_MAX_CUT);
    s.tcCut = clamp(s.tcLevel + TC_KICK * Math.max(0, err), 0, TC_MAX_CUT);
    // The tail is already sliding: power would only spin it further.
    if (s.slipR > ESC_REAR_SLIP && Math.abs(s.vx) > 1.5) s.tcCut = Math.max(s.tcCut, clamp((s.slipR - ESC_REAR_SLIP) * 2, 0, 1) * TC_MAX_CUT);
    // The ECU does not turn the torque down like a dial: it drops sparks, whole firing events at
    // a time, so the engine stutters (the brap of traction control). Over each cycle the share
    // of cut events is the cut asked for.
    s.tcPhase = ((s.tcPhase ?? 0) + dt * TC_CUT_HZ) % 1;
    s.tcCutting = s.tcCut > 0.04 && s.tcPhase < s.tcCut / TC_DEPTH;
    if (s.tcCutting) tqWheelIn *= 1 - TC_DEPTH;
  } else { s.tcCut = 0; s.tcLevel = 0; s.tcCutting = false; }
  // Reverse is one low gear: the power fades out toward its top speed instead of switching on and off.
  if (reversing && tqWheelIn < 0) tqWheelIn *= clamp((REVERSE_MAX_MS + s.vx) / 2, 0, 1);

  // ---- brakes ----
  const brakeTq = brk * BRAKE_MARGIN * mu * wTotal * r;
  const tqBrakeF = brakeTq * ch.brakeFront;
  // Brake-force distribution (a proportioning valve on an old car, EBD on a new one): the
  // rear brakes never ask more of the rear tyres than their load, lightened by the
  // braking itself, lets them give, so they keep some grip for cornering.
  const tqBrakeR = Math.min(brakeTq * (1 - ch.brakeFront), EBD_REAR_SHARE * mu * FzR * r) + (input.handbrake ? mu * FzR * r * 1.2 : 0);

  // ---- tyre forces ----
  // Each axle's grip, with this moment's lateral weight transfer and load sensitivity.
  const nominal = wTotal / 4;
  const axleCap = (Fz, share) => {
    const dF = Math.min(Fz / 2 * 0.95, (m * Math.abs(ayLoad) * h * share) / TRACK_M);
    const outer = Fz / 2 + dF;
    const inner = Fz / 2 - dF;
    const g = (F) => F * (1 - LOAD_SENSITIVITY * (F / nominal - 1));
    return clamp((g(outer) + g(inner)) / (Fz * (1 - LOAD_SENSITIVITY * (Fz / 2 / nominal - 1))), 0.5, 1);
  };
  // A limited-slip diff keeps the driven axle's grip when the inside wheel unloads.
  const lsdGain = (cap) => cap + (1 - cap) * ch.lsd * 0.7;
  const rawF = axleCap(FzF, ch.rollShareF + FRONT_ROLL_BIAS);
  const rawR = axleCap(FzR, 1 - ch.rollShareF - FRONT_ROLL_BIAS);
  const capF = drive.drive === 'awd' ? lsdGain(rawF) : rawF;
  const capR = lsdGain(rawR);
  const relax = (RELAX_M[grip.grade] ?? 0.5) * ch.relaxScale;
  /** @param {number} Fz @param {number} u @param {number} v @param {number} w @param {number} aPeak @param {number} cap @param {'aF'|'aR'} key */
  const sub = (Fz, u, v, w, aPeak, cap, key, muAx, latSc, longSc) => {
    const wheelV = w * r;
    const ref = Math.max(Math.abs(u), 1.2);
    const kappa = (wheelV - u) / ref;
    // Against the sideways slide whichever way the car rolls: going backwards does not turn it round.
    const kin = Math.atan2(v, ref);
    // The tyre's slip angle follows the kinematic one with its relaxation length.
    s[key] += (Math.tan(kin) - s[key]) * Math.min(1, (dt * Math.max(Math.abs(u), 1.5)) / relax);
    const sx = kappa / KAPPA_PEAK;
    const sy = s[key] / aPeak;
    const sig = Math.hypot(sx, sy);
    const f = sig < 1e-6 ? 0 : (mu * muAx * cap * Fz * shape(sig)) / sig;
    return { Fx: f * sx * longSc, Fy: -f * sy * latSc, sig, kappa };
  };
  const tF = sub(FzF, uF, vF, s.wF, alphaPeak, capF, 'aF', ch.muF, ch.latF, ch.longF);
  const tR = sub(FzR, uR, vR, s.wR, alphaPeak * REAR_ALPHA_SCALE, capR, 'aR', ch.muR, ch.latR * REAR_GRIP, ch.longR);

  // ---- wheel spin: engine torque on the driven wheel(s), tyre force and brakes against it ----
  const drivenFront = drive.drive === 'awd' ? 0.4 : 0;
  const drivenRear = 1 - drivenFront;
  const coupledI = coupled ? ENGINE_INERTIA * overall * overall : 0;
  // Engine inertia is referred to the wheels it drives, shared across the axles by the split.
  const IwR = Iw * 2 + coupledI * drivenRear;
  const IwF = Iw * 2 + coupledI * drivenFront;
  // The wheel's equation is stiff (a tyre pulls hard against any slip), so it is advanced
  // implicitly: the tyre's small-slip stiffness is folded into the effective inertia, which
  // keeps it stable at a 4 ms step without changing where it settles.
  const spinStep = (w, I, drv, tyre, Fz, tqBrake, absKey) => {
    const ref = Math.max(Math.abs(s.vx), 1.2);
    const dFdw = ((mu * Fz * SHAPE_B * SHAPE_C) / KAPPA_PEAK) * (r / ref);
    const net = drv - tyre.Fx * r;
    let tb = tqBrake;
    if (tb > 0 && !input.handbrake && Math.abs(s.vx) > 1) {
      // ABS: past the target slip it bleeds the pressure off, short of it it builds it back.
      const kap = (Math.abs(w) * r - Math.abs(s.vx)) / Math.max(Math.abs(s.vx), 1.2);
      const target = -ABS_SLIP * KAPPA_PEAK;
      let f = s[absKey] ?? 1;
      if (kap < target) f -= dt * ABS_RELEASE * Math.min(1, (target - kap) / KAPPA_PEAK);
      else f += dt * ABS_APPLY;
      s[absKey] = clamp(f, 0.05, 1);
      tb *= s[absKey];
    } else s[absKey] = 1;
    const dir = w === 0 ? 0 : -Math.sign(w);
    const wNext = w + (dt * (net + dir * tb)) / (I + dt * dFdw * r);
    // A brake cannot spin a wheel backwards.
    if (w !== 0 && Math.sign(wNext) !== Math.sign(w) && Math.abs(net) < tb) return 0;
    return wNext;
  };
  s.wR = spinStep(s.wR, IwR, tqWheelIn * drivenRear, tR, FzR, tqBrakeR, 'absR');
  s.wF = spinStep(s.wF, IwF, tqWheelIn * drivenFront, tF, FzF, tqBrakeF, 'absF');
  if (Math.abs(s.vx) < 0.3 && thr < 0.02 && brk > 0.02) { s.wR = 0; s.wF = 0; }

  // ---- body ----
  const Fxf = tF.Fx * cosD - tF.Fy * sinD;
  const Fyf = tF.Fx * sinD + tF.Fy * cosD;
  const Fxr = tR.Fx;
  const Fyr = tR.Fy;
  const drag = 0.5 * RHO_AIR * car.cd * car.frontalAreaM2 * s.vx * Math.abs(s.vx);
  const crr = car.crr * ch.crrScale * (input.rollScale ?? 1);
  const roll = Math.abs(s.vx) > 0.2 ? crr * wTotal * Math.sign(s.vx) : crr * wTotal * (s.vx / 0.2);
  const Fx = Fxf + Fxr - drag - roll;
  const Fy = Fyf + Fyr;
  const Mz = a * Fyf - b * Fyr;
  const effMass = m + (WHEEL_MASS_KG * WHEEL_RING * 4);
  const ax = Fx / effMass;
  const ay = Fy / m;
  s.vx += (ax + s.yawRate * s.vy) * dt;
  s.vy += (ay - s.yawRate * s.vx) * dt;
  s.yawRate += (Mz / Iz) * dt;
  // Stability control. The ECU knows what the driver asked for: the yaw rate of a car
  // following its front wheels on a gently understeering line, r = v delta / (L (1 + v^2 / vch^2)),
  // never more than the grip can hold (mu g / v). Braking single wheels it pulls the car's
  // real yaw rate back toward that, and catches a sideways slide before the rear lets go.
  if (input.tc !== false && !input.handbrake && s.vx > 1.5) {
    const maxYaw = (mu * G * ESC_YAW_MARGIN) / s.vx;
    const ref = clamp((s.vx * s.steer) / (L * (1 + (s.vx / ESC_CHAR_SPEED) ** 2)), -maxYaw, maxYaw);
    const err = s.yawRate - ref;
    const k = Math.min(1, dt * ESC_RATE);
    // Only ever taking yaw away: turning a car harder than its tyres allow is not a thing brakes can do.
    const oversteer = Math.abs(s.yawRate) > Math.abs(ref) || Math.sign(s.yawRate) !== Math.sign(ref);
    if (oversteer && Math.abs(err) > ESC_DEADBAND) s.yawRate -= (err - Math.sign(err) * ESC_DEADBAND) * k;
    const beta = Math.atan2(s.vy, s.vx);
    const betaMax = alphaPeak * REAR_ALPHA_SCALE * 1.2;
    if (Math.abs(beta) > betaMax) s.vy -= (s.vy - Math.tan(Math.sign(beta) * betaMax) * s.vx) * k * 0.5;
  }
  // Off the pedals at walking pace, the car rolls to rest rather than on for ever on an idling,
  // disengaged driveline; the wheels follow it down.
  if (thr < 0.02 && Math.abs(s.vx) < SETTLE_BELOW_MS) {
    const dv = SETTLE_DECEL * dt;
    s.vx = Math.abs(s.vx) <= dv ? 0 : s.vx - Math.sign(s.vx) * dv;
    s.wR = Math.sign(s.wR) === Math.sign(s.vx) ? Math.min(Math.abs(s.wR), Math.abs(s.vx) / r) * Math.sign(s.vx) : 0;
    s.wF = s.vx / r;
  }
  // Parked: a car at rest with no input stays put (the stiction a bicycle model lacks).
  if (Math.abs(s.vx) < 0.15 && Math.abs(s.vy) < 0.15 && thr < 0.02) {
    s.vx *= 1 - Math.min(1, dt * 6); s.vy *= 1 - Math.min(1, dt * 6); s.yawRate *= 1 - Math.min(1, dt * 8);
    if (Math.abs(s.vx) < 0.02) s.vx = 0;
  }
  // Reversing, and at a crawl, a car goes where its wheels point: the slip-angle model is
  // unstable going backwards (the steered axle trails) and meaningless at walking pace, so the
  // motion is drawn toward the rolling path, yaw = v tan(delta) / L with no slip at the rear axle.
  const follow = s.vx < 0 ? clamp(1 - (Math.abs(s.vy) - 2) / 3, 0, 1) : clamp(1 - s.vx / 3, 0, 1);
  if (follow > 0 && !input.handbrake) {
    const yawK = (s.vx * Math.tan(s.steer)) / L;
    const k = Math.min(1, dt * 12) * follow;
    s.yawRate += (yawK - s.yawRate) * k;
    s.vy += (b * yawK - s.vy) * k;
  }
  // At a crawl the slip-angle definition is meaningless, so damp the yaw instead of letting it jitter.
  if (speedAbs < 1.5) s.yawRate *= 1 - Math.min(1, dt * 4 * (1 - speedAbs / 1.5));

  s.heading += s.yawRate * dt;
  s.x += (Math.sin(s.heading) * s.vx + Math.cos(s.heading) * s.vy) * dt;
  s.z += (Math.cos(s.heading) * s.vx - Math.sin(s.heading) * s.vy) * dt;
  s.ax = ax;
  s.ay = ay;
  // The body follows on its springs and dampers (semi-implicit, so it is stable at this step).
  const wn = 2 * Math.PI * BODY_HZ * (ch.bodyHz ?? 1);
  s.pitchV += (wn * wn * (ax - s.pitchA) - 2 * BODY_DAMPING * wn * s.pitchV) * dt;
  s.pitchA += s.pitchV * dt;
  s.rollV += (wn * wn * (ay - s.rollA) - 2 * BODY_DAMPING * wn * s.rollV) * dt;
  s.rollA += s.rollV * dt;
  s.rpm = rpm;
  s.throttle = thr;
  s.brake = brk;
  s.slipF = tF.sig;
  s.slipR = tR.sig;
  s.wheelspin = (Math.abs(s.wR) * r - Math.abs(s.vx)) / Math.max(Math.abs(s.vx), 1.2);
  s.odo += Math.abs(s.vx) * dt;
  s.t += dt;
}

/**
 * Advance by real time, in whole fixed steps. Returns the leftover so the caller can carry it.
 * @param {VehicleState} s @param {Powertrain} pt @param {Parameters<typeof stepVehicle>[2]} input
 * @param {number} dt seconds
 * @param {number} [carry]
 */
export function advance(s, pt, input, dt, carry = 0) {
  let t = carry + Math.min(dt, 0.1);
  let first = true;
  while (t >= STEP_S) {
    stepVehicle(s, pt, first ? input : { ...input, shift: 0 }, STEP_S);
    first = false;
    t -= STEP_S;
  }
  return t;
}

/** Speed in mph and km/h, for the dash. @param {number} ms */
export const toMph = (ms) => ms * 2.23694;
export const toKph = (ms) => ms * 3.6;

/**
 * A powertrain from what the build screens already know.
 *
 * @param {import('../../sim/index.js').DragCar} car
 * @param {(rpm: number) => number} torqueNm from `torqueCurveFromSweep`
 * @param {number} redline
 * @param {{displacementL?: number, peakHpRpm?: number, frictionNm?: (rpm: number) => number}} [o]
 * @returns {Powertrain}
 */
export function powertrainOf(car, torqueNm, redline, o = {}) {
  const disp = o.displacementL ?? 3.5;
  // Closed throttle: the pumping and friction the engine has to push against. Mean effective
  // pressure of about 1.3 bar at idle rising to 2.3 bar near the redline, T = p * Vd / (4 pi).
  const engineBrakeNm = o.frictionNm ?? ((rpm) => ((1.3e5 + 1.0e5 * clamp(rpm / redline, 0, 1.2)) * (disp / 1000)) / (4 * Math.PI));
  return { car, torqueNm, engineBrakeNm, redline, peakHpRpm: o.peakHpRpm };
}
