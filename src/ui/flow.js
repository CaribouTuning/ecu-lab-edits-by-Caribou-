/**
 * Where to go next: the game's flow, as one step at a time.
 *
 * Both modes are one loop, the loop a tuner works in. SANDBOX: choose an engine and build it
 * on the stand, start it and hear it, pull it on the dyno, read what the pull's log says and
 * fix that on the laptop, pull again. CAREER: take a customer's car from the job board, pull
 * it (or road test it), fix what the log points at, pull again, and hand it back. This works
 * out which step the player is on from what is true now (no checklist to fall out of step
 * with the game), and the chrome shows it in the same words wherever they are: over the
 * shop floor, on the station's bar, on the laptop.
 *
 * Pure: no React, no store. EcuLab.jsx gathers the facts and acts on `go`.
 */

/**
 * Where a step sends the player:
 *   build      the engine stand's build software
 *   live       the engine stand's Run screen
 *   dyno       the dyno (in CAREER without one, the road test)
 *   tune:PAGE  that page of the laptop's Tune app
 *   board      the job board on the shop wall
 *   messages   Pops's messages, on the laptop
 *   ticket     the job ticket, open, where the car is handed back
 * @typedef {'build'|'live'|'dyno'|'board'|'messages'|'ticket'|`tune:${string}`} Go
 */

/**
 * @typedef {object} FlowFacts
 * @property {'sandbox'|'career'} mode
 * @property {boolean} engineMissing SANDBOX with no engine chosen yet
 * @property {boolean} heard the engine has run on the stand since its hardware last changed
 * @property {boolean} [atDyno] the player is at the dyno: a pull there is the next thing, not
 *   a walk back to the stand to hear it first
 * @property {boolean} pulled there is a pull at all
 * @property {boolean} fresh the last pull is of the setup on the bench now
 * @property {number} [peakHp] that pull's peak, at the wheels
 * @property {{page: string, label: string, count: number}[]} attention the pages the fresh
 *   pull's log points at, most entries first
 * @property {boolean} [working] CAREER: a car is on the bay
 * @property {number} [unread] CAREER: Pops's unread messages
 * @property {boolean} [newShop] CAREER: no job finished yet, so Pops's first messages are how
 *   the game is explained, and they come before the first job
 * @property {boolean} [roadTest] CAREER: the shop has no dyno yet
 * @property {boolean} [buildJob] CAREER: an engine-building job
 * @property {boolean} [own] CAREER: the car on the bay is the player's own
 */

/**
 * @typedef {object} Step
 * @property {string} id what the step is, for tests and keys
 * @property {string} text what to do, in a sentence
 * @property {string} label the button that does it: where it goes
 * @property {Go} go
 */

/**
 * The step the player is on.
 * @param {FlowFacts} f
 * @returns {Step}
 */
export function nextStep(f) {
  if (f.mode === 'career') {
    if (!f.working) {
      const many = (f.unread ?? 0) > 1;
      if (f.unread && f.newShop) return { id: 'read', text: `Pops sent you ${many ? `${f.unread} messages` : 'a message'}: how the shop works. Read ${many ? 'them' : 'it'} before the first job.`, label: 'Messages', go: 'messages' };
      return { id: 'take', text: `No car on the bay. Take a customer's car from the job board.${f.unread ? ` Pops sent you ${many ? `${f.unread} messages` : 'a message'} too.` : ''}`, label: 'Job board', go: 'board' };
    }
    if (f.buildJob && !f.pulled) return { id: 'build-job', text: 'An engine-building job: build it to the ticket on the engine stand.', label: 'Engine stand', go: 'build' };
    if (!f.fresh) {
      if (f.roadTest) return { id: 'road', text: f.pulled ? 'You changed the car since the last road test. Take it out again.' : 'Road test it: one full-throttle pull to redline, and the logger records it.', label: 'Road test', go: 'dyno' };
      return { id: 'pull', text: f.pulled ? 'You changed the car since the last pull. Pull it again to see what it did.' : 'Strap it on the dyno and run a pull: the log says what is wrong.', label: 'Dyno', go: 'dyno' };
    }
    if (f.attention.length) return fixStep(f.attention[0]);
    if (f.own) return { id: 'own-done', text: 'A clean pull. Fit a part on the stand, or put the car away.', label: 'Engine stand', go: 'build' };
    return { id: 'hand-back', text: 'A clean pull. Check it against the ticket, then hand the car back.', label: 'Ticket', go: 'ticket' };
  }

  if (f.engineMissing) return { id: 'choose', text: 'No engine yet. Choose one on the engine stand, or build your own.', label: 'Engine stand', go: 'build' };
  if (!f.heard && !f.fresh && !f.atDyno) return { id: 'hear', text: 'Start it on the stand and listen to it.', label: 'Run it', go: 'live' };
  if (!f.fresh) return { id: 'pull', text: f.pulled ? 'It has changed since the last pull. Pull it again to see what that did.' : 'Put it on the dyno and run a pull.', label: 'Dyno', go: 'dyno' };
  if (f.attention.length) return fixStep(f.attention[0]);
  return {
    id: 'more',
    text: `A clean pull${f.peakHp ? `, ${Math.round(f.peakHp)} whp` : ''}. Build more into it on the stand, or tune for more on the laptop.`,
    label: 'Engine stand',
    go: 'build',
  };
}

/**
 * The fix the log asks for: its page on the laptop.
 * @param {{page: string, label: string, count: number}} a
 * @returns {Step}
 */
function fixStep(a) {
  return {
    id: 'fix',
    text: `The pull log points at ${a.label} ${a.count === 1 ? 'once' : `${a.count} times`}. Read it, then fix it on the laptop.`,
    label: a.label,
    go: `tune:${a.page}`,
  };
}

/**
 * Which of the shop floor's places a step is at: its marker is the one lit.
 * @param {Go} go
 * @returns {'stand'|'dyno'|'laptop'|'board'}
 */
export function spotOf(go) {
  if (go === 'build' || go === 'live') return 'stand';
  if (go === 'dyno' || go === 'ticket') return 'dyno';
  if (go === 'board') return 'board';
  return 'laptop';
}
