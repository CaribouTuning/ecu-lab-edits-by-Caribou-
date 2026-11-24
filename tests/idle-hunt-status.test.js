/**
 * A pull cannot see an idle, so the engine stand has to: the career's idle-hunt customer
 * swings about 1,300 rpm, and the stand now says the idle is hunting and where to fix it.
 */

import { describe, expect, it } from 'vitest';

import * as S from '../src/sim/index.js';
import { customerCar } from '../src/ui/career/cars.js';
import { jobById } from '../src/ui/career/jobs.js';
import { idleHunt, liveStatus } from '../src/ui/screens/dash/LiveScreen.jsx';
import { pullInputs } from '../src/ui/state/pullInputs.js';

import { STORY_FIXES } from './careerFixes.js';

/** The car idling warm on the stand for 12 s, as LIVE runs it. */
function idle(state) {
  const { args, mafErrorBase } = pullInputs(state);
  const cfg = { ...args, mafErrorBase, ecu: { ...args.ecu, aux: {} } };
  let s = { ...S.makeLiveState(), cranking: true, coolantC: 88, oilC: 88, ecu: { ...S.makeEcuLiveState(), sEct: 88 } };
  for (let i = 0; i < 240; i += 1) s = S.liveStep(s, 0.05, { throttle: 0, load: 0 }, cfg);
  return s;
}

describe('the stand tells a hunting idle', () => {
  const job = jobById('idle-hunt');

  it('the idle-hunt customer: the stand says it hunts, and sends the player to TUNE → IDLE', () => {
    const s = idle(customerCar(job.car));
    expect(idleHunt(s.ecu.log)).toBeTruthy();
    expect(liveStatus(s, customerCar(job.car).build)).toMatch(/idle is hunting.*TUNE → IDLE/);
  });

  it('fixed, and on a stock engine, it says nothing of the kind', () => {
    expect(idleHunt(idle(STORY_FIXES['idle-hunt'](customerCar(job.car))).ecu.log)).toBeNull();
    expect(idleHunt(idle(customerCar({ preset: 'vq35de-revup' })).ecu.log)).toBeNull();
  });
});
