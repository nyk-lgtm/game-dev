import { defineConfig } from 'vitest/config';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

function buildId(): string {
  const sha = process.env.GITHUB_SHA ?? (() => {
    try {
      return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      return 'dev';
    }
  })();
  return sha.slice(0, 7);
}

export default defineConfig({
  // Relative base so the build works at any path (e.g. /game-dev/ on GitHub Pages).
  base: './',
  define: {
    __BUILD_ID__: JSON.stringify(buildId()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
  },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    // One page per game plus the hub. Add new games here.
    rollupOptions: {
      input: {
        hub: resolve(__dirname, 'index.html'),
        telegraph: resolve(__dirname, 'telegraph/index.html'),
        grove: resolve(__dirname, 'grove/index.html'),
        lantern: resolve(__dirname, 'lantern/index.html'),
        afterglow: resolve(__dirname, 'afterglow/index.html'),
        delve: resolve(__dirname, 'delve/index.html'),
        nightline: resolve(__dirname, 'nightline/index.html'),
        glyph: resolve(__dirname, 'glyph/index.html'),
        rewild: resolve(__dirname, 'rewild/index.html'),
        unspoken: resolve(__dirname, 'unspoken/index.html'),
        hexhold: resolve(__dirname, 'hexhold/index.html'),
        triad: resolve(__dirname, 'triad/index.html'),
        ninefold: resolve(__dirname, 'ninefold/index.html'),
        summit: resolve(__dirname, 'summit/index.html'),
        lastlight: resolve(__dirname, 'lastlight/index.html'),
        quarry: resolve(__dirname, 'quarry/index.html'),
        sungrazer: resolve(__dirname, 'sungrazer/index.html'),
        kitbag: resolve(__dirname, 'kitbag/index.html'),
        brink: resolve(__dirname, 'brink/index.html'),
        loomsong: resolve(__dirname, 'loomsong/index.html'),
        simmer: resolve(__dirname, 'simmer/index.html'),
        gleam: resolve(__dirname, 'gleam/index.html'),
        lull: resolve(__dirname, 'lull/index.html'),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    // CI runners are several times slower than a laptop; generator and bot tests need room.
    testTimeout: 30_000,
  },
});
