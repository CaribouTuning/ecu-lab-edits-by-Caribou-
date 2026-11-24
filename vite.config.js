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
    // three.js is one 695 kB module, fetched only when a 3D view first draws; every chunk the
    // game starts with is under the default 500 kB. The limit is set to let that one through.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Chunks that change on their own schedule, so an update to the game does not make a
        // player fetch React or the charts again. three.js is not here: it is fetched only when
        // a 3D view first draws (desk/useStage.js), in chunks of its own.
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
          if (/node_modules\/(recharts|d3-[a-z-]+|victory-vendor|react-smooth|recharts-scale|decimal\.js-light|lodash|eventemitter3|tiny-invariant|clsx|react-is|prop-types|fast-equals|internmap)\//.test(id)) return 'charts';
          if (/\/src\/sim\//.test(id)) return 'sim';
          if (/node_modules\/three\//.test(id)) return 'three';
          if (/\/src\/ui\/(screens\/dash\/Learn|tutorial\/|desk\/LearnApp)/.test(id)) return 'learn';
          if (/\/src\/ui\/career\//.test(id)) return 'career';
          return undefined;
        },
      },
    },
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
