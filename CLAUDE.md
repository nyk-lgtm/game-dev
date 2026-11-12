# Game Lab — notes for Claude

A hub of small mobile web games: https://nyk-lgtm.github.io/game-dev/
(`index.html` + `src/hub/`), one folder per game: `telegraph/`, `grove/`, `lantern/`,
`afterglow/` (survivor-like), `delve/` (first-person ASCII crawler), `nightline/`
(pseudo-3D ASCII racer), `glyph/` (Glyphwright, spell-crafting autobattler), `rewild/`
(ecosystem builder on a hex island), `unspoken/` (learn a procedurally invented language from pictures), `hexhold/` (hex maze tower defense),
`triad/` (hex logic puzzle: fire/water/leaf, numbers count beaten neighbors), `lastlight/` (tap-driven interactive story, two nights),
`ninefold/` (seeded mini-golf), `summit/` (peaks-solitaire roguelite with charms), `quarry/` (word roguelite on a hex letter wall).

- The owner plays and tests only on an Android phone (Chrome, portrait). Every UI
  change must work by touch at ~390 CSS px wide; tap targets ≥ 44px.
- Layout: `<game>/index.html` is the page; code in `src/<game>/` with a pure
  `core/` (rules), `render/`, controller `game.ts`, `main.ts`. Shared code in
  `src/shared/` (hex math, rng, storage with per-game prefixes, debug overlay,
  modal cards, timeline, hex layout, shell.css, settings: hub-wide sound/vibration/reduced effects (`reducedFx()`), checked by
  afterglow/audio's Sfx and applied in installErrorOverlay). Tests in `tests/<game>/`,
  tools in `scripts/<game>/`.
- Adding a game: new `<game>/index.html`, `src/<game>/`, an entry in
  `vite.config.ts` (rollupOptions.input) and a card in `src/hub/main.ts`.
- Every `core/` must stay pure and deterministic (no DOM, no Math.random, no
  Date). All randomness flows from the seed via `Rng`/`mixSeed`; replays and bug
  reports depend on it. Bump a game's `RULES_VERSION` when old saves would replay
  differently.
- Before pushing: `npm test && npm run build`. Balance probes:
  - Telegraph: `npx vite-node scripts/telegraph/balance.ts 150` (greedy bot median
    depth ≈ 7, ~15% of runs end on depth 3; it can't plan bash/lunge combos). `scripts/telegraph/damage.ts`
    shows what hurts the player; `scripts/telegraph/floors.ts` counts enemies/kinds per depth (budget
    `floorBudget`: +3 a floor to 24 at depth 8, then +2; at most 11 enemies, 4 brutes).
  - Grove: `npx vite-node scripts/grove/balance.ts 60` (score, game length, best tier; rules v2:
    median ~248 turns, Spirit Tree in ~half the games).
  - Lantern: `npx vite-node scripts/lantern/balance.ts 50` (completion bot: ~98% finish,
    level 7 at the king). Maps are hand-drawn strings in src/lantern/core/maps.ts;
    diagonal steps can't squeeze between two blocked cells, so never connect areas
    only diagonally.
  - Afterglow: `npx vite-node scripts/afterglow/balance.ts` (bot survival per character).
  - Delve: `npx vite-node scripts/delve/balance.ts`; Nightline: `npx vite-node scripts/nightline/balance.ts`.
  - Glyphwright: `npx vite-node scripts/glyph/balance.ts 100 smart,favor` (rules v3: smart bot ~37% wins, median wave 15;
    `favor` pushes it toward each caster). `scripts/glyph/probe.ts 2` ranks every caster × modifier build by real leaks
    with a per-caster best/top-10 line (`TWEAK='beam.dmg=17,MOD.pierceThrough=t'` tries numbers without editing rules).
  - Summit: `npx vite-node scripts/summit/balance.ts 1000` (greedy bot with chain lookahead, rules v3: floor 1
    ~98%, floor 2 ~94%, median floor 5, ~14-17% win all 8); `DRAWS=34,13,…` tries other allotments, `TUNE=mirrors:1`
    other charm strengths, and `CHARM=mirror` starts every run holding one charm (the fair way to compare charms:
    v3 wins 16% with none, ~36-43% Pockets/Flags/Mirror/Joker/Blast, ~27-34% Lantern/Wind/Stride/Momentum).
  - Quarry: `npx vite-node scripts/quarry/balance.ts 300 human` (bot that spots 8% of the common words ≤ 6 letters;
    rules v2: median depth 7, ~32% wins; `PICK=worst` (weakest perks) ~17%; `SEEN=0.05` ~6%; `best` mode 100%);
    `PERKTABLE=1` favors each perk in turn (others weakest-first: all within ~18-33% wins); `TARGETS=`/`WORDS=` try others.
  - Hexhold: `npx vite-node scripts/hexhold/balance.ts 32` (heuristic bot, rules v4: median wave ~28, ~7/32 wins);
    `scripts/hexhold/probe.ts 32` lists each loss with its wave and map shape (one or two portals) and the
    lives lost per band of waves (the difficulty curve: v4 is gentle to wave 10, pressure from 15 on).
  - Rewild: `npx vite-node scripts/rewild/balance.ts 16 greedy 1` (score, species, stars; compare
    with `random`; rules v5: greedy median ~2330 (32 games), stars at 900/1700/2400, ~1/4 of bot games 3★),
    `scripts/rewild/upto.ts <seed> <n>` (a bot game's actions to season n, for `?seed=&a=`), `scripts/rewild/probe.ts` (plays and causes of death), `trace.ts <seed>`.
- ASCII games (Delve, Nightline) draw into a character `Grid` (src/shared/ascii.ts) painted
  with batched `fillText` runs; art lives in each game's `art.ts`.
- Daily challenges (src/shared/daily.ts): `<game>/?daily` plays today's seed (`dailySeed(game, day)`,
  local date); each game keeps its in-progress daily under `dailyRun` and today's best under `daily`.
  Wired for Afterglow, Rewild, Glyphwright, Delve, Nightline, Unspoken, Hexhold, Triad, Ninefold, Summit and Quarry; the hub's Daily section links them.
- Afterglow extras: Nights 1-5 (`NIGHTS` in content.ts, unlocked by `profile.nightsWon`), arenas
  (`ARENAS`/pillars in core/arena.ts, hashed from the seed), unions (`union` on a WeaponDef: two
  maxed weapons merge in a chest), and player damage is attributed (`w.taken`, `w.killedBy`).
  `NIGHT=n ARENA=1 npx vite-node scripts/afterglow/probe.ts` probes them.
- Glyphwright runs are a seed + build actions (`B`uy/`M`ove/`S`ell/`E`mpower/`R`eroll/`F`reeze/`G`o; a trailing
  `k` on B/M/E keeps a set unmerged, and merges only take sets that include a rune the action placed);
  battles are deterministic, so `replay(seed, a)` rebuilds the run. Modifier order only matters for Echo and the
  element (last wins); burn is a fraction of the finished hit.
- Rewild runs are a seed + actions (`P<card>.<cell>` place, `R` new hand, `E` end season). The
  season sim (src/rewild/core/sim.ts) visits cells in index order with one Rng per season, so
  the UI's forecasts (clone + end season) are exact. `track(ev, cell, id, after)` (core/forecast.ts) follows one
  population through those events (`feed` events carry food/need when it eats, `move` says flee/food), so the
  placement glow and the cell readout come from the same trial. Wildfire burns last in a lightning summer
  (after grazing): only full-grown grass/flowers/shrubs on moisture-0 ground; the board draws the burn plan.
  Deals favour cards that can be placed somewhere (`placeReason` gives the blocker kind for hints).
- Unspoken: `makeLanguage(seed)` (core/lang.ts) invents grammar, sounds and glyphs; `makeWorld` builds
  5 chapters of authored scenes (every word in 2+ scenes; tests enforce it) plus generated riddles; state
  actions are `G<glyph>=<guess>` and `A<challenge>~p<n>` / `~<tile.tile…>`. Scene art: render/scene.ts.
  `npx vite-node scripts/unspoken/inspect.ts <seed> [village]` prints a language and its world.
  Village 2 (the mountain village, core/world2.ts `CHAPTERS2`, `makeLanguage(seed, 2)`, `newGame(seed, 2)`): case
  particles `SUBJ`/`OBJ` (`grammar.cased`: verb first/middle/last, particle before/after), so `Frame.ofirst` may put
  the done-to first; the verb carries the `PLV` mark when the subject is plural. Its extra concepts live in `GRAMMAR2`
  (not `CONCEPTS`) so village 1 never changes; tests/unspoken/village2.test.ts pins village-1 world hashes. Compose
  riddles accept either order (`Challenge.alts`). Opens once `profile.finished > 0`; saves under `run2`, last village
  in `village`; bug links add `&v=2`. Notebook shows `grammarRules` as their glyphs are proven. Village 2 saves have
  their own version (`RULES_VERSION2`, `rulesVersion(village)`); its riddles only use `adjShown2` adjectives. Copied
  links hide answers: `linkActions`/`unlinkActions` turn `G<glyph>=<guess>` into `g<code>-<code>` (old links still
  load), and a link-opened run becomes the current saved run of its village.
- Hexhold runs are a seed + tick-stamped actions (`<tick>:B<cell>.<tower>`, `U`, `S`, `W`); enemies follow a
  flow field (src/hexhold/core/board.ts) rebuilt on every build/sell; `buildError` forbids sealing any portal. Flyers use `FLY_DIST`, burrowers
  `s.dig` (the tower-less field); `distFor` picks. ~1/3 of maps have two portals (`s.portals`).
- Triad (src/triad/core/puzzle.ts): `generate(seed, radius)` fills a random answer, adds givens until
  single-clue deductions (`propagate`, exact per clue via `clueSupport`) finish it, then strips clues and
  givens while they still do; so every puzzle is unique and guess-free, and `nextHint` replays those
  deductions. Levels: Easy keeps more numbers; Hard strips further while `propagateDeep` ("what if" trials,
  capped at 2+2·radius) still finishes it. `npx vite-node scripts/triad/stats.ts 30 [numbers|links]` shows counts and ms per size/level.
  Links mode (`generate(seed, r, level, 'links')`, `p.links`): `p.clue` continues past the cells with one entry per
  `b.edges` edge (clue id = cells + edge; -1 or SAME = both hexes match); links are ordinary clues in `clueSupport`/
  `propagate`/hints/`brokenClues`, and get stripped together with numbers. Numbers mode must stay byte-identical
  (fingerprint test in tests/triad/links.test.ts). Easy/Normal links (`tidy`): no link touches a given, linked
  groups have at most 3 hexes; Hard links keeps the original generator (playtest favourite). Bump `LINKS_VERSION`
  when links puzzles change (saves record `clues` + `lv`; `validSave`); the daily is numbers-only. Hints skip
  hexes that links merely copy from a filled hex unless nothing else is left.
- Last Light: one pure module per night, night 1 (storm) src/lastlight/core/story.ts, night 2 (fog) core/night2.ts;
  core/nights.ts wraps each as a `Story` (core/types.ts) that game.ts drives. `choices(s)` lists legal action ids
  (`go:<room>`, `take:<item>`, `use:<item>:<target>`, `give:`, `say:<npc>:<topic>`, …); `act(s, id)` returns the text.
  A run is the list of ids, saved per night ('run', 'run2'); `?n=2&a=` replays (reports: `LASTLIGHT v…`,
  `LASTLIGHT2 v…`). Profile: night 1 at the top level, night 2 under `n2`. Never change night 1's ids or
  RULES_VERSION. `npx vite-node scripts/lastlight/walk.ts <night> <ids>` prints a run. tests/lastlight has each
  night's best route — update it when a story changes.
- Ninefold (src/ninefold/core): `makeHole(seed, n)` grows a corridor of 16-unit cells on a 6×9 grid (a
  self-avoiding walk, never touching itself, plus side pockets), walls = the cells' outer edges, obstacles in
  route cells (never tee/cup). `simulate` is a fixed 240 Hz step; shots are saved as `angle.power` in
  thousandths, so `replay(seed, a)` is exact; power is a share of MAX_ROLL on open grass. Par is a formula
  fitted to the bot (length, obstacles on the route, turns); `NOISE=0.06 balance.ts 8` median ≈ −2. Tools in
  scripts/ninefold: `show.ts <seed>` (ASCII), `balance.ts n` (search bot, NOISE=0.04 wobble), `trace.ts`,
  `botround.ts <seed>` (actions for `?seed=&a=`).
- Summit (src/summit/core): 8 floors; each deal is a hand-drawn layout (layouts.ts: rows as strings in
  half-card steps, ≤ 8 cards across; a card is covered by the next row's cards at x±1) from a seeded 52-card
  deck, plus a draw pile. A card plays if uncovered and one rank from the waste (A-K wraps). Draws are a run-wide
  supply: each floor adds `DEAL_DRAWS[f]` (34, 14, 11, 11, 10, 9, 8, 8) to what's left, of which at most
  `TUNE.carry` (15) carry up; no plays and no draws = run over. Every draw goes through `drawStep`: it never
  turns up the waste's rank (`noRepeat`), and from the `MERCY`-th (3rd) draw in a row without a play it swaps in
  the nearest deeper card that fits an open card, a plain card before the Joker (`o.noLuck` when none can).
  Spyglass shows `nextDraws(r, 3)`, which runs the same steps on a copy, so it's exact for draws in a row.
  Undo keeps cards you have seen face up. Charm strengths live in `TUNE` (Mirror 2 / Long Stride 3 plays per
  deal, Flags 1 draw per peak top, Wind 12, carry 15); a test checks the charm texts quote them.
  Streaks score 10·n. 13 charms (charms.ts), one of three after each floor (`offersFor`, seeded per floor).
  Actions: `P<slot>`, `D`, `B<slot>` (Blasting Cap), `U` (Rewind: snapshots in `hist`), `C<charm>`, `X` give up;
  `replay(seed, a)`; `startAt(seed, floor, charms)` for tests. Tools in scripts/summit: `trace.ts <seed>`,
  `upto.ts <seed> <floor> [moves]` (bot actions for `?seed=&a=`), `show.ts <seed> <a>`, `curve.ts` (clear rate
  vs draws per floor). UI is DOM cards (game.ts), not canvas.
- Quarry (src/quarry/core): a 6×7 face of flat-top hexes in columns (odd columns half a row lower; cell = row·6+col,
  `NEIGHBORS` in board.ts). Drag through touching tiles for a word (3-8 letters, Qu is one tile); points = letter
  values × length bonus × word multiplier. Length bonus = letters − 2 plus Long Haul/Hot Seam; word multiplier =
  1 + golds + Chisel/Echo/Opening/Prospector bonuses, which ADD (rules v2: they used to multiply and snowballed). Tiles fall down their column (`settle`) and refill from
  the bag (`pickLetter` keeps 34-48% vowels, ≤ 1 of each J/Q/X/Z); every tile drawn uses its own
  `Rng(mixSeed(levelSeed, drawn++))`. 8 depths: `TARGETS` within `WORDS`, spare words pay 10·depth each, then one
  of three of 13 perks (perks.ts). Rocks crack when a word touches them (granite needs two), fuses (depth 3+) blast
  their neighbours when used and cost a word if they run out; a fuse that drops into a cramped spot passes to the
  nearest `fuseFriendly` tile (4+ open neighbours, 2+ of the other vowel/consonant kind); if no word is left the face
  is shaken for free.
  Actions `W<i.i.i>`, `S` shake, `X<i>` pickaxe, `P<perk>`, `Q`; `replay(seed, a, dict)` needs the `Dict`.
  Dictionary: src/quarry/core/words.ts is generated by `scripts/quarry/build-words.ts` (SCOWL sizes 10-50 via
  `wordlist-english`, blocklists `badwords-list` + `naughty-words` + its own list, front-coded, ~46 KB gzipped,
  lazy-loaded by main.ts); bots use only the common part (SCOWL ≤ 35). `scripts/quarry/grep.ts '<regex>'` searches
  it; `upto.ts <seed> <depth>` prints bot actions for `?seed=&a=`. UI is DOM hexes (game.ts) with WAAPI falls.
- Telegraph specifics: new enemies go in `ENEMIES` (src/telegraph/core/enemies.ts)
  plus a shape in render/draw.ts and a color in palette.ts; tests in
  tests/telegraph/enemies.test.ts. Telegraphed attacks set `aim` and resolve via
  `release` at the start of the next enemy phase; a releasing enemy skips `act`. Previews
  (core/preview.ts) give `hurtBy` (who hits you) and `next` (telegraphs covering where a safe move ends
  up, from the simulated post-state); `threatsAt(threats(s), hex)` lists who threatens a hex.
- Visual check: build, `npx vite preview`, screenshot with Playwright using the
  `Pixel 7` device profile. `window.__game` exposes each game's controller.
- Bug reports from the owner look like `TELEGRAPH …`/`GROVE …`/`LANTERN …`/`GLYPH …`/`REWILD … seed=… a=…` (and the other games' equivalents);
  reproduce with that game's `replay(seed, a)` or `<game>/?seed=…&a=…`.
- The live site deploys only from `main` (CI pushes `dist/` to `gh-pages`);
  other branches just build and test.
  After pushing to main, confirm the CI run succeeded (a red run deploys nothing); CI is ~3x slower than
  this machine, so heavy generator/bot tests rely on the 30 s `testTimeout` in vite.config.ts.
  If a push's CI run sits "queued" for long (it happened once for 2h), start `deploy.yml` by hand
  (workflow_dispatch on `main`); it can't be cancelled while stuck.
- Autonomous work: read BACKLOG.md first; it holds the queue, the per-session routine and what's done.
- When shipping something the owner would notice, add a line at the top of `NEWS` in src/hub/news.ts
  (the hub's "What's new", which marks items newer than their last visit).
