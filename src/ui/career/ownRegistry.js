/**
 * The synthetic jobs behind the tuner's own cars. A kept car rides the same lift-and-bay
 * machinery as a customer's, so it needs a job to stand in for it; that job has no checks and
 * pays nothing. Its own module so `jobs.js` can look jobs up without importing the cars
 * (which import the shop, which imports the jobs).
 */

/** @type {Map<string, any>} */
const OWN_JOBS = new Map();

export const ownJobId = (/** @type {string} */ id) => `own:${id}`;
/** @param {string} jobId */
export const ownIdOf = (jobId) => (typeof jobId === 'string' && jobId.startsWith('own:') ? jobId.slice(4) : null);

/** @param {{id: string, name: string, preset: string|null, body: string, look: any, plate: string, drag: any}} car */
export function ownJob(car) {
  return {
    id: ownJobId(car.id), tier: 1, own: true, customer: { name: 'Your car', car: car.name, color: car.look.color, body: car.body },
    says: '', wants: 'Your own car: tune it, race it, show it.', work: [], checks: [], needs: {}, minRep: 0, pay: 0, rep: 0, hint: '',
    teaches: '', car: { preset: car.preset }, look: car.look, plate: car.plate, drag: car.drag, ownId: car.id,
  };
}

/** Make a save's own cars known to `jobById`. @param {{cars?: any[]}} c */
export function registerCars(c) {
  OWN_JOBS.clear();
  for (const car of c.cars ?? []) OWN_JOBS.set(ownJobId(car.id), ownJob(car));
}

/** @param {string} jobId */
export const lookupOwnJob = (jobId) => OWN_JOBS.get(jobId);
