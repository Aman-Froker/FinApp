import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  // The shared package ships TypeScript source, so it is bundled rather than left external.
  noExternal: ['@finapp/shared', '@finapp/parser'],
  sourcemap: true,
  clean: true,
});
