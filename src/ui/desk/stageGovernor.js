/**
 * Decides when a 3D stage that cannot hold its frame rate gives up resolution.
 *
 * A phone with a 3x screen drawing the lit shop (a multisampled target, soft shadows and a
 * depth post pass) can spend more than it has. Rather than guess at devices, the stage times
 * its own frames: if drawn frames keep arriving slower than about 40 a second, it steps down
 * a ladder of drawn pixels per screen pixel and stays there. Never back up: a stage that
 * steps up again finds the limit again and flickers between the two.
 *
 * Pure, so the rule is tested without a GPU (tests/ui/stage-governor.test.js).
 */

/** Drawn pixels per screen pixel, best first. */
export const DPR_LADDER = [2, 1.5, 1.25, 1];
/** A drawn frame slower than this (ms) is slow: under about 40 frames a second. */
export const SLOW_FRAME_MS = 25;
/** Slow frames, net, before a step down. A fast frame pays back two. */
export const SLOW_RUN = 40;
/** A gap longer than this (ms) is a hidden tab or a stall, not a slow frame. */
export const STALL_MS = 500;

/**
 * @param {number} [start] the rung a previous visit settled on
 * @returns {{rung: number, dpr: number, frame: (ms: number, drew: boolean) => boolean}}
 *   `frame` takes the gap since the last frame and whether this one was drawn, and returns
 *   true when the stage should step down to `dpr` now
 */
export function createGovernor(start = 0) {
  let rung = Math.min(Math.max(0, Math.floor(start)), DPR_LADDER.length - 1);
  let slow = 0;
  let lastDrew = false;
  return {
    get rung() { return rung; },
    get dpr() { return DPR_LADDER[rung]; },
    frame(ms, drew) {
      // Judged across frames drawn back to back: an idle picture draws nothing, and the gaps
      // between its redraws say nothing about how fast it can draw.
      const judged = drew && lastDrew && ms > 0 && ms < STALL_MS;
      lastDrew = drew;
      if (!drew) { slow = 0; return false; }
      if (!judged) return false;
      slow = ms > SLOW_FRAME_MS ? slow + 1 : Math.max(0, slow - 2);
      if (slow >= SLOW_RUN && rung < DPR_LADDER.length - 1) {
        rung += 1;
        slow = 0;
        return true;
      }
      return false;
    },
  };
}
