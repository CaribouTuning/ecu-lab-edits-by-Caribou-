import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative base so a production build works when served from a subdirectory
  // (GitHub Pages project sites, for example) as well as from a domain root.
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    // The simulation is pure JS with no DOM dependency, so the default Node
    // environment is both correct and much faster than jsdom. Component tests opt
    // into jsdom per-file with `// @vitest-environment jsdom` rather than slowing
    // the physics suite down for everyone.
    environment: 'node',
    include: ['tests/**/*.test.{js,jsx}'],
    // Resets `window.location.hash` before every test. Navigation lives in the URL
    // now, and jsdom shares one `window` across a whole file, so without this each
    // test inherits the previous one's route. See tests/setup.js.
    setupFiles: ['./tests/setup.js'],
  },
});
