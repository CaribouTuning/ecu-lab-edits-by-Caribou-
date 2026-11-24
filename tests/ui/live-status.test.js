/**
 * The engine stand's status line says why an engine will not start, not only that the
 * starter is turning: injectors fitted without scaling the ECU flood it, and the fix is
 * one setting on TUNE.
 */

import { describe, expect, it } from 'vitest';

import { liveStatus } from '../../src/ui/screens/dash/LiveScreen.jsx';

const cranking = { cranking: true, running: false, live: { lambda: 0.18 } };

describe('the engine stand\'s status line', () => {
  it('names unscaled injectors as the reason a flooded engine will not start, and the setting that fixes it', () => {
    const msg = liveStatus(cranking, { injIdx: 3, ecuInjectorCc: 315 });
    expect(msg).toMatch(/flooded/);
    expect(msg).toMatch(/315 cc/);
    expect(msg).toMatch(/650 cc/);
    expect(msg).toMatch(/TUNE → Injectors/);
  });

  it('a flooded engine with its injectors scaled is still called flooded', () => {
    expect(liveStatus(cranking, { injIdx: 0, ecuInjectorCc: 315 })).toMatch(/flooded/);
  });

  it('a cranking engine that is not flooded is just cranking', () => {
    expect(liveStatus({ ...cranking, live: { lambda: 1 } }, { injIdx: 0, ecuInjectorCc: 315 })).toBe('Starter engaged…');
  });

  it('a running engine on the wrong injector scaling says so before anything routine', () => {
    const msg = liveStatus({ cranking: false, running: true, coolantC: 90, closedLoop: true, ecu: {} }, { injIdx: 3, ecuInjectorCc: 315 });
    expect(msg).toMatch(/overfuelling everywhere by 106%/);
  });
});
