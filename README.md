# Game Lab

Small, deep games for one thumb, built for phones (portrait, touch).

**Play:** https://nyk-lgtm.github.io/game-dev/

| Game | What it is |
|---|---|
| [Telegraph](https://nyk-lgtm.github.io/game-dev/telegraph/) | Hex tactics roguelike. Every enemy telegraphs its next attack; moving is attacking. |
| [Grove](https://nyk-lgtm.github.io/game-dev/grove/) | Hex merge puzzle. Three alike merge into the next tier; trap the wandering wisps. |
| [Lantern](https://nyk-lgtm.github.io/game-dev/lantern/) | Tiny ASCII RPG. Tap to walk, bump to fight; relight the village Lantern. |

## Stack

- TypeScript + Vite (multi-page), no game engine. Canvas 2D boards, HTML/CSS UI.
- All art is procedural vector shapes; no image assets.
- Vitest for the rules; GitHub Actions builds, tests and deploys to GitHub Pages.

## Layout

```
index.html, src/hub/        the game-select hub
<game>/index.html           one page per game (telegraph/, grove/)
src/<game>/core/            pure, deterministic rules: state + action -> state + events
src/<game>/render/          canvas drawing and event-driven animation
src/<game>/game.ts          controller: input -> rules -> animation -> UI
src/shared/                 hex math, seeded rng, storage, debug overlay, cards, timeline
tests/<game>/               rules, generation and fuzz tests
scripts/<game>/             greedy bots and balance probes
```

## Commands

```
npm install
npm run dev        # dev server (--host, so a phone on the LAN can open it)
npm test           # all rules tests
npm run build      # typecheck + production build into dist/
npx vite-node scripts/telegraph/balance.ts 150
npx vite-node scripts/grove/balance.ts 60
npx vite-node scripts/lantern/balance.ts 50
```

## Debugging from a phone

- Errors show as red banners at the bottom of the screen.
- Each game's menu has **Copy bug report** (build, seed, full move list).
  Any game replays exactly at `<game>/?seed=<seed>&a=<moves>`.
