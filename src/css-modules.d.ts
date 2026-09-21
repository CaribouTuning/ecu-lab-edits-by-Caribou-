/**
 * Vite resolves `*.module.css` to an object of generated class names at build time.
 * `tsc` knows nothing about that, so without this declaration every stylesheet
 * import is a "cannot find module" error under `npm run typecheck`.
 */

declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}

declare module '*.css';
