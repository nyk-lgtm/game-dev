import { defineConfig } from 'vitest/config';
import { execSync } from 'node:child_process';

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
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
