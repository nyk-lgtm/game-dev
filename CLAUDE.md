# Telegraph — notes for Claude

- The owner plays and tests only on an Android phone (Chrome, portrait). Every UI
  change must work by touch at ~390 CSS px wide; tap targets ≥ 44px.
- `src/core/` must stay pure and deterministic (no DOM, no Math.random, no Date).
  All randomness flows from the run seed via `Rng`/`mixSeed`. Replays depend on it.
- New enemies go in `ENEMIES` (src/core/enemies.ts) plus a shape in
  src/render/draw.ts and a color in palette.ts; add rules tests in tests/enemies.test.ts.
  Telegraphed attacks set `aim` and resolve via `release` at the start of the next
  enemy phase; an enemy that releases skips its `act` that turn.
- Before pushing: `npm test && npm run build`, and check balance with
  `npx vite-node scripts/balance.ts 150` when rules or levelgen change
  (target: greedy bot median depth ≈ 7 — it can't plan bash/lunge combos, humans
  should beat it). `npx vite-node scripts/damage.ts` shows what hurts the player.
- Visual check: build, `npx vite preview`, screenshot with Playwright using the
  `Pixel 7` device profile. `window.__game` exposes the controller for scripts.
- Bug reports from the owner look like `TELEGRAPH build=… seed=… a=…`; reproduce
  with `replay(seed, a)` from src/core or `?seed=…&a=…` in the browser.
- The live site (https://nyk-lgtm.github.io/game-dev/) deploys only from `main`;
  other branches just build and test in CI.
