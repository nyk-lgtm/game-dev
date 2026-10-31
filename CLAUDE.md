# Game Lab — notes for Claude

A hub of small mobile web games: https://nyk-lgtm.github.io/game-dev/
(`index.html` + `src/hub/`), one folder per game: `telegraph/`, `grove/`, `lantern/`,
`afterglow/` (survivor-like), `delve/` (first-person ASCII crawler), `nightline/`
(pseudo-3D ASCII racer), `glyph/` (Glyphwright, spell-crafting autobattler).

- The owner plays and tests only on an Android phone (Chrome, portrait). Every UI
  change must work by touch at ~390 CSS px wide; tap targets ≥ 44px.
- Layout: `<game>/index.html` is the page; code in `src/<game>/` with a pure
  `core/` (rules), `render/`, controller `game.ts`, `main.ts`. Shared code in
  `src/shared/` (hex math, rng, storage with per-game prefixes, debug overlay,
  modal cards, timeline, hex layout, shell.css). Tests in `tests/<game>/`,
  tools in `scripts/<game>/`.
- Adding a game: new `<game>/index.html`, `src/<game>/`, an entry in
  `vite.config.ts` (rollupOptions.input) and a card in `src/hub/main.ts`.
- Every `core/` must stay pure and deterministic (no DOM, no Math.random, no
  Date). All randomness flows from the seed via `Rng`/`mixSeed`; replays and bug
  reports depend on it. Bump a game's `RULES_VERSION` when old saves would replay
  differently.
- Before pushing: `npm test && npm run build`. Balance probes:
  - Telegraph: `npx vite-node scripts/telegraph/balance.ts 150` (greedy bot median
    depth ≈ 7; it can't plan bash/lunge combos). `scripts/telegraph/damage.ts`
    shows what hurts the player.
  - Grove: `npx vite-node scripts/grove/balance.ts 60` (score, game length, best tier).
  - Lantern: `npx vite-node scripts/lantern/balance.ts 50` (completion bot: ~98% finish,
    level 7 at the king). Maps are hand-drawn strings in src/lantern/core/maps.ts;
    diagonal steps can't squeeze between two blocked cells, so never connect areas
    only diagonally.
  - Afterglow: `npx vite-node scripts/afterglow/balance.ts` (bot survival per character).
  - Delve: `npx vite-node scripts/delve/balance.ts`; Nightline: `npx vite-node scripts/nightline/balance.ts`.
  - Glyphwright: `npx vite-node scripts/glyph/balance.ts` (smart bot win rate, deaths per wave).
- ASCII games (Delve, Nightline) draw into a character `Grid` (src/shared/ascii.ts) painted
  with batched `fillText` runs; art lives in each game's `art.ts`.
- Glyphwright runs are a seed + build actions (`B`uy/`M`ove/`S`ell/`R`eroll/`F`reeze/`G`o);
  battles are deterministic, so `replay(seed, a)` rebuilds the run.
- Telegraph specifics: new enemies go in `ENEMIES` (src/telegraph/core/enemies.ts)
  plus a shape in render/draw.ts and a color in palette.ts; tests in
  tests/telegraph/enemies.test.ts. Telegraphed attacks set `aim` and resolve via
  `release` at the start of the next enemy phase; a releasing enemy skips `act`.
- Visual check: build, `npx vite preview`, screenshot with Playwright using the
  `Pixel 7` device profile. `window.__game` exposes each game's controller.
- Bug reports from the owner look like `TELEGRAPH …`/`GROVE …`/`LANTERN …`/`GLYPH … seed=… a=…` (and the other games' equivalents);
  reproduce with that game's `replay(seed, a)` or `<game>/?seed=…&a=…`.
- The live site deploys only from `main` (CI pushes `dist/` to `gh-pages`);
  other branches just build and test.
