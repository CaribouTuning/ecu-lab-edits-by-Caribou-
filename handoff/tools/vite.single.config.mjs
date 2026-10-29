// One self-contained HTML file of the app, for the claude.ai beta artifact.
// Run from the repo root: npx vite build --config handoff/tools/vite.single.config.mjs
// then: python3 handoff/tools/inline.py dist-single ecu-lab-beta.html
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  root: process.cwd(),
  plugins: [react()],
  base: './',
  build: {
    outDir: path.resolve(process.cwd(), 'dist-single'),
    emptyOutDir: true, assetsInlineLimit: 100000000, cssCodeSplit: false, sourcemap: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
