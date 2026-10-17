/** Whether this browser can draw the 3-D world at all. Kept apart from the renderer so asking does not load three.js. */
export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
