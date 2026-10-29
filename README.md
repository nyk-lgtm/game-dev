# Telegraph

A turn-based hex tactics roguelike for phones (portrait, one thumb). Every enemy
telegraphs its threat; moving is attacking. Reach the stairs, go deeper.

**Play:** https://nyk-lgtm.github.io/game-dev/

## Stack

- TypeScript + Vite, no game engine. Canvas 2D for the board, HTML/CSS for UI.
- All art is procedural vector shapes; no image assets.
- Vitest for the rules; GitHub Actions builds, tests and deploys to GitHub Pages.

## Layout

```
src/core/     pure, deterministic rules (no DOM) — state in, state + events out
  hex.ts        axial hex math (flat-top), odd-q offset board
  board.ts      tile/occupancy queries, distance fields, rays
  enemies.ts    enemy definitions (data + behavior)
  levelgen.ts   seeded floor generation
  resolve.ts    applyAction(): player move, stab/lunge, enemy phase
  preview.ts    threat overlay + exact outcome preview
  replay.ts     compact action encoding, replay from (seed, actions)
src/render/   canvas drawing, scene model, event -> animation timeline
src/ui/       DOM HUD, info panel, modal cards
src/debug/    on-screen error overlay, bug-report export, URL replay
src/game.ts   controller: input -> rules -> animation -> UI
scripts/      greedy bot + balance probe (npx vite-node scripts/balance.ts)
tests/        rules, levelgen and fuzz tests
```

## Commands

```
npm install
npm run dev        # local dev server (--host, so a phone on the LAN can open it)
npm test           # rules tests
npm run build      # typecheck + production build into dist/
npx vite-node scripts/balance.ts 200   # how deep does the greedy bot get?
```

## Debugging from a phone

- Errors show as red banners at the bottom of the screen.
- Menu → **Copy bug report** copies the build, seed and full move list.
  Any run can be replayed exactly at `?seed=<seed>&a=<moves>`.
