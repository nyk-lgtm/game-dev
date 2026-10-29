# Telegraph — notes for Claude

- The owner plays and tests only on an Android phone (Chrome, portrait). Every UI
  change must work by touch at ~390 CSS px wide; tap targets ≥ 44px.
- `src/core/` must stay pure and deterministic (no DOM, no Math.random, no Date).
  All randomness flows from the run seed via `Rng`/`mixSeed`. Replays depend on it.
- New enemies go in `ENEMIES` (src/core/enemies.ts); add rules tests for them.
- Before pushing: `npm test && npm run build`, and check balance with
  `npx vite-node scripts/balance.ts 150` when rules or levelgen change
  (target: greedy bot median depth ≈ 10).
- Visual check: build, `npx vite preview`, screenshot with Playwright using the
  `Pixel 7` device profile. `window.__game` exposes the controller for scripts.
- Bug reports from the owner look like `TELEGRAPH build=… seed=… a=…`; reproduce
  with `replay(seed, a)` from src/core or `?seed=…&a=…` in the browser.
