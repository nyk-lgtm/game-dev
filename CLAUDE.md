# Game Lab — notes for Claude

A hub of small mobile web games: https://nyk-lgtm.github.io/game-dev/
(`index.html` + `src/hub/`), one folder per game: `telegraph/`, `grove/`, `lantern/`,
`afterglow/` (survivor-like), `delve/` (first-person ASCII crawler), `nightline/`
(pseudo-3D ASCII racer), `glyph/` (Glyphwright, spell-crafting autobattler), `rewild/`
(ecosystem builder on a hex island), `unspoken/` (learn a procedurally invented language from pictures), `hexhold/` (hex maze tower defense),
`triad/` (hex logic puzzle: fire/water/leaf, numbers count beaten neighbors), `lastlight/` (tap-driven interactive story, two nights),
`ninefold/` (seeded mini-golf), `summit/` (peaks-solitaire roguelite with charms), `quarry/` (word roguelite on a hex letter wall),
`sungrazer/` (one-thumb arcade: hold to swing a comet round stars, let go to fling),
`kitbag/` (dice-placement roguelite: roll dice, slot them into gear cards, 12 floors to a boss),
`brink/` (push duel on a crumbling hex island vs an alpha-beta AI, plus win-in-N puzzles),
`loomsong/` (rhythm game: seeded synth songs, notes charted from the song's own onsets, 4 lanes),
`simmer/` (cozy management sim: a night-market food stall for 20 nights, critter guests on a watchable evening),
`gleam/` (light-and-mirrors logic puzzle: place mirrors/splitters/filters so every crystal gets its exact colour),
`lull/` (musical garden sandbox: plants sing a pentatonic loop, creatures carry notes, no fail state),
`trestle/` (physics builder: planks/twigs/twine on a peg grid carry a cart over a gap or hold a lantern at a ring),
`tidings/` (narrative roguelite: carry the winter post over 11 stops; face 2 of 3 event cards a stop, trade five resources).

- The owner plays and tests only on an Android phone (Chrome, portrait). Every UI
  change must work by touch at ~390 CSS px wide; tap targets ≥ 44px.
- Layout: `<game>/index.html` is the page; code in `src/<game>/` with a pure
  `core/` (rules), `render/`, controller `game.ts`, `main.ts`. Shared code in
  `src/shared/` (hex math, rng, storage with per-game prefixes, debug overlay,
  modal cards, timeline, hex layout, shell.css, settings: hub-wide sound/vibration/reduced effects (`reducedFx()`), checked by
  afterglow/audio's Sfx and applied in installErrorOverlay). Tests in `tests/<game>/`,
  tools in `scripts/<game>/`.
- Adding a game: new `<game>/index.html`, `src/<game>/`, an entry in
  `vite.config.ts` (rollupOptions.input) and a card in `src/hub/games.ts` (tests/hub checks every page has one).
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
  - Lantern: `npx vite-node scripts/lantern/balance.ts 50` (completion bot, rules v2: ~100% finish,
    0 falls, level 8 at the king; it clears everything). `scripts/lantern/duel.ts [potions]` pits each level
    against the King (axe, cloth): L6 + 1 potion ~87%, L5 ~29% (`OLD=1` for the v1 King). Maps are hand-drawn strings in src/lantern/core/maps.ts;
    diagonal steps can't squeeze between two blocked cells, so never connect areas
    only diagonally.
  - Afterglow: `npx vite-node scripts/afterglow/balance.ts` (bot survival per character).
  - Delve: `npx vite-node scripts/delve/balance.ts 100` (descent bot, rules v6: ~58% wins (56% over 400 seeds), d10 reached
    ~84%, deaths mostly at the Warden (450 HP), then depth 5 ~6%, depth 6 ~3%; it also prints damage per depth by kind with the
    killers there, each floor's monster mix, and `DEATHS=1` how each death went (burst, potions left, foes in sight).
    Per-floor caps `FLOOR_CAP`/`floorCap` in gen.ts: a capped kind's first depth holds one, so wraiths and cultists,
    both new at depth 5, come one of each; floor damage d4 ~50, d5 ~108, d6-8 ~120); Nightline: `npx vite-node scripts/nightline/balance.ts`
    (rules v2: bot finishes ~40/40 always-left, ~38/40 always-right; it dodges with perfect information, so
    human-facing fixes are about seeing traffic and curves sooner). Nightline's camera height follows the
    horizon (`camHeight` in render.ts) so the road at the car stays as wide as CAR_HIT_W was measured for.
  - Glyphwright: `npx vite-node scripts/glyph/balance.ts 100 smart,favor` (rules v3, bot model refit 2026-11-13: smart bot
    ~83% wins (85% on 200 seeds), every loss at the Lich; favor runs 71-91%, Nova 91%. The old model's ~37% came from
    the bot stacking Novas/Fire with nothing for Drakes; the game didn't change). `favor` pushes it toward each caster.
    `scripts/glyph/probe.ts 2` ranks every caster × modifier row by real leaks (beside two plain bolts) with a per-caster
    best/top-10 line; `looms.ts [3/2] [waves]` plays whole looms of the best rows (per caster: best loom using it 1/2/3
    times and what leaks, by foe); `leaks.ts` splits bot leaks by primary caster, wave band and foe; `fit.ts` refits the
    bot's model `W` in smart.ts (row sets + 1500 random late looms, Spearman rho; `--fresh` after rule changes).
    `TWEAK='beam.dmg=17,MOD.pierceThrough=t,drake.hp=100,BUDGET.square=0.5'` (tweak.ts; probe/looms/balance) tries rule
    numbers, `BOTW='cover=1,novaStack=1'` bot weights.
  - Summit: `npx vite-node scripts/summit/balance.ts 1000` (greedy bot with chain lookahead, rules v4: floor 1
    ~100%, floor 2 ~98%, median floor 5, ~14-15% win all 8); `DRAWS=34,13,…` tries other allotments, `TUNE=mirrors:1`
    other charm strengths, and `CHARM=mirror` starts every run holding one charm (the fair way to compare charms:
    v4 wins 15% with none, ~40-48% Pockets/Flags/Stride/Joker/Mirror/Blast, ~32-34% Lantern/Wind/Momentum).
  - Quarry: `npx vite-node scripts/quarry/balance.ts 300 human` (bot that spots 8% of the common words ≤ 6 letters;
    rules v4: median depth 8, ~44% wins with its perk order (`PRIORITY` in bot.ts); `PICK=worst` (`WORST`) ~25%;
    `SEEN=0.05` ~14%; `best` mode 100%); `PERKTABLE=1` favors each perk in turn (others weakest-first: ~16-46%, Wild
    Stone and Hot Seam on top); `TARGETS=`/`WORDS=` try others.
  - Sungrazer: `npx vite-node scripts/sungrazer/balance.ts 30 human` (skills novice/human/good/perfect: reaction
    delay, timing jitter, a two-level release planner; rules v4 (40 runs): novice median ~22 s (alt ~470), human
    ~50-70 s (alt ~700-900; seed noise is large), good ~115 s (alt ~1900, p75 ~158 s), perfect survives 10 min;
    most good-bot deaths are cinders it brushes after a jittered grab). `SG_MODE=s|t|m` for modes, `CHECK=1` verifies replays.
  - Kitbag: `npx vite-node scripts/kitbag/balance.ts 1000` (planning bot, rules v4: first two fights 100%, median floor 12,
    ~27% wins (28% seeds 1000+, 24% SEED=9000), ~34 turns a run; losses: The House ~36% of runs (it wins ~57% of
    its fights; the balance line splits that by script), floors 9-10 ~24%, floors 3-8 ~11%). `TUNE=hp:1.04,dmg:1.05`
    tries numbers (win rate is touchy: hp ×1.04 alone ≈ −3 points); `trace.ts <seed>` prints a bot run turn by turn,
    `upto.ts <seed> <floorsDone> [phase] [extra]` gives actions for `?seed=&a=`.
  - Loomsong: `npx vite-node scripts/loomsong/charts.ts 300` (charts unchanged since v1: songs 90-120 s at 90-140 BPM; notes/s median Easy
    ~1.2, Normal ~2.2, Hard ~3.7, busiest 4 s ~2 / 3.5 / 5.75; per song Easy ~6 holds 2 flicks 0 chords, Normal ~13 / 3 / 7,
    Hard ~25 / 5 / 32; lanes ~21/29/28/22%; same-lane runs ≤ 4). `botrun.ts <seed> [lv] [jitter] [skip]` prints a bot play
    and its `?seed=&lv=&a=` (N=100 gives the grade spread, rules v2: Normal, 2% skipped, jitter 15 ms → A 86 / S 12, 30 → A 65 / B 31, 45 → B,
    60 → C; a full combo of Goods is a B).
  - Simmer: `npx vite-node scripts/simmer/balance.ts 100 [naive,lazy,middle,careful,buyall,clever,payback,builder,lazynohelp,steady,cheap,premium,greedy,fame,hoard,sweets,fishy,overstock,understock]`
    (bots plan from the forecast only, never the real crowd; rules v6, 100 seasons on two seed sets, stars 1500/3400/5000:
    naive (start menu, listed prices, 6 portions each, no shop) ~2080 = 1★; lazy = what a lazy person taps (start menu,
    listed prices, Fill to forecast, Open, the warning card's default) ~3470-3530, 2★ 59-68%; middle (lazy + lanterns from
    night 4, second stove from night 7) ~4430, 3★ 10%; careful (middle + menus valued for delight + learning and serving
    the asked-for dish at `askPrice`) ~4900-5050, 3★ 45-58%; buyall (careful's habits + every recipe and upgrade as soon as
    tonight's stock is covered: the fourth tester's dominant line) ~4480-4560, 3★ 13-16%; clever (careful's shopping +
    prices searched within 0.8-1.3 of the list (PLO/PHI) + forecast stock with cheap-day stock-ups) ~5230, 3★ 67-70%.
    Others (v5, 40 seasons): builder ~4750, cheap ×0.8 ~4190, payback (v3 clever, payback shopping) ~4020, fame ~3710,
    overstock ~3690, fishy ~3220, hoard ~3110, understock ~3080, premium ×1.35 ~3010, sweets ~2470. ~0.1-1 s a
    season. `trace.ts <seed> [strat]` prints a season night by night, `upto.ts <seed> <nights> [strat]` gives `?seed=&a=`.
    Env RV/RD/COVER/PAD/PLO/PHI tune the bots, TUNE=k:v the rules.
  - Brink: `npx vite-node scripts/brink/selfplay.ts 40 [hard,hard normal,easy …]` (AI vs AI per pairing: wins, first-mover
    wins, plies, time per move, shove-backs a game and the longest run, repeated layouts (and "cheap" ones, re-searched
    exactly); rules v1, AI v4 (80 games Easy/Normal, 40 Hard): first mover 45% Easy, 49% Normal, ~42% Hard mirrors; Hard
    beats Normal 93%, Easy 100%; Normal beats Easy 81-89%; games 19-25 plies median; Hard ~160 ms/move (p90 ~190) on a
    laptop; shove-back runs ≤ 1-3, repeated layouts 0.1-0.3 a game. vite-node runs the search ~4x slower than the browser; for long probes bundle with esbuild and run node.
    `TUNE=crumbleStart:6,komi:1`, `W=threat:60`, `LV=normal.depth:3`, `SETUP=1` try other rules/weights/levels/starts.
  - Gleam: `npx vite-node scripts/gleam/stats.ts 300` (rules v3: gen median 4.4 / 4.1 / 28 ms Small/Medium/Large, max
    ~44 / 33 / 196 ms; unique 100%; deduction depth 2 needed in 0% / ~27% / 100% (Large: ≥ 3 depth-2 eliminations);
    Small's most direct route is always a trap (`trapped`), Medium always has a white lamp and a filter, no idle pieces
    (`idlePieces`); hints ≤ ~40 ms).
    `show.ts <seed> [size]` prints a puzzle, its light and the model's eliminations; `hints.ts <seed> [size]` the hint
    texts in order (`hints.ts longest 150`: the longest; #info is 76 px = 4 lines at 360 px and must hold them); `stress.ts 200` checks the model never rules out an answer piece from part-filled boards and
    hints always finish.
  - Trestle: `npx vite-node scripts/trestle/probe.ts 100` (rules v5 live numbers: first layout proven 76% (crossings ~88%,
    lanterns ~38%), always within ≤ 15 layouts; par/budget median 0.74; gen median ~0.4 s, p90 ~1.3 s, max ~2 s on a laptop
    incl. a 300-step polish (the page's worker; live trail levels and dailies make two candidates); one test run ~3 ms).
    `pool.ts 60 18` rebuilds the picked trail (src/trestle/core/pool.ts, ~15 min): v6 difficulty thirds 0.41 → 0.65 → 0.92,
    neighbour steps ≤ 0.12, 2 answer-shape repeats (28/47, 59/62), tricks taught: tie at 8, relay at 12, fan at 20.
    `trail.ts 1 80` lists the trail with difficulty (past the pool ~0.69-0.96). `par.ts 45` re-surveys 4× harder;
    `wind.ts 18 2.4` adds wind to calm levels (v6: the calm par build fails in 13/18); `why.ts`, `bumps.ts [cart]`,
    `tutorials.ts` (each tutorial's `ref` peak < 0.85, surveyor ≤ par).
  - Tidings: `npx vite-node scripts/tidings/balance.ts 400 [careful,casual,random,safe,risky,greedy,crowd,miser]` (rules v4:
    careful (plans every order of this stop's cards, choices, provisions and partings, gambles by their shown odds, then the
    road, valuing stock against the cheapest remaining leg costs on the map) arrives ~78-79% (seed sets 1000/5000), ★★★ ~27%
    of arrivals (via ~0.75 promises kept and ~2 companions); casual (one action at a time, 25% whim that heeds the page's ☠
    and "find N more" warnings) ~26%; random/safe/risky/greedy 0-1%; careful deaths oil ~55%, food ~40%, mostly stops 8-10;
    endings list `+wedding` separately (~1/3 of careful arrivals). v3 was 79/24, v2 74/21. `variety.ts 1000 [ids]` prints
    cards dealt per run and stop 10's hands (`RECENT=1` with the cross-run freshness). The gap
    careful − casual stays ~50 points whatever the knob (provisions add ~+15 to both, startO/startF/startH/startC/legFoodPass
    take from both); v1 was 55/11. `TUNE=startC:3` → 67/16, `legFoodPass:3` → ~-10/-6, `buyCost:99` (no provisions) ~-15.
    `W=reserve:0.7` bot weights; `trace.ts <seed> [policy]` prints a journey stop by stop and its `?seed=&a=`;
    `comps.ts 400` gives each companion's offer/take rate (all ~45-54% offered), `WITH=1 comps.ts 300` starts every run with
    one companion (power: none 73%, Fen ~78 … Pell ~89%).
  - Lull: `npx vite-node scripts/lull/probe.ts [seed] [plants]` (weather spells, then a full garden's day: rules v1 ~1.6 notes
    a step / ~26 a bar, busiest step capped at 6 (`MAX_PER_STEP`), Harpfern runs are the bulk; bees/fireflies/frog out per phase).
    Frame cost (Playwright, Pixel 7, 30 grown plants): desktop 60 fps (draw JS ~0.4 ms); CPU ×4 throttled ~45-48 fps at DPR 2
    on a clear day (mist / rainy night ~36), more after the page steps down (`Scene.slower`, by 0.25; `faster` steps back up
    after 4 good 2-s windows, doubling the wait after a failed step up). Headless canvas is software and its raster runs on
    the main thread inside Commit (a CDP trace shows `LayerTreeHost::DoUpdateLayers` ≈ 85% of the frame; JS ≈ 7%), so cost
    is pixels and draw paths, not JS. Profiled and fixed: a sheared drawImage (the sway skew) is the slow path, so sprites
    go out in 12 px strips, each only shifted and snapped to device pixels (`blitSwayed`); scaled or 'lighter' draws of the
    beat band and mist cost ~9 fps, so both are built at device size and blitted 1:1; the unlit beat chips and the plant
    shadows are baked (landscape layer / sprites); at most 3 glows a plant. Ablate with `__game.scene.<method> = () => {}`.
  - Hexhold: `npx vite-node scripts/hexhold/balance.ts 32` (heuristic bot, rules v6: median wave ~27, ~8/32 wins);
    `scripts/hexhold/probe.ts 32` lists each loss with its wave and map shape (one or two portals) and the
    lives lost per band of waves (the difficulty curve: v6 is gentle to wave 10 (1-3/4-7/8-10: 0/34/21), steady
    pressure from 15 on, no spike at 27-30), lives lost wave by wave for 1-12, plus gold banked per band, open cells and upgrade gold left, and gold unspent at the end
    (`CAP=14` stops building at 14 towers, `EXPAND=1` builds again once they're all maxed: hoarding check, no sink
    needed: the bot banks ~16 gold, a capped maze 1-3k but spending it on new towers wins 1 → 29/64);
    `scripts/hexhold/waves.ts` shows wave sizes and the biggest pile of one kind; `upto.ts <seed> <wave>` gives a bot
    game's `?seed=&a=&t=` just before that wave is sent (screenshots, repros).
  - Rewild: `npx vite-node scripts/rewild/balance.ts 16 greedy 1` (score, species, stars; compare
    with `random`; rules v7: greedy median ~2300 (32 games; random ~890), stars at 900/1700/2400, ~1/4 of bot games 3★),
    `scripts/rewild/upto.ts <seed> <n>` (a bot game's actions to season n, for `?seed=&a=`), `scripts/rewild/probe.ts` (plays and causes of death), `trace.ts <seed>`,
    `fire.ts 64 1 [random]` (per lightning summer: burns, the idle burn plan, whether the bot plays differently than in a
    drought, and the score vs the same game with lightning turned into drought; v7 greedy: ~1.6 lightning summers a game,
    something burns in ~44/101, mean −7; random −34).
- Delve rules v5 (src/delve/core/rules.ts): a sleeping monster spends the turn it notices you; cultists rest a turn
  (`cd`) after each firebolt; blocked hunters try another equally short step; `use` (HIT) hits ahead, then a front
  corner (`cornerFoe`), opens/shuts doors (never with a foe beside you or in the doorway), else "You swing at nothing"
  (no turn); `doorNoises` drives the "?" on doors; scrolls of seeing are carried (`player.scrolls`, action `read`, code `v`).
- ASCII games (Delve, Nightline) draw into a character `Grid` (src/shared/ascii.ts) painted
  with batched `fillText` runs; art lives in each game's `art.ts`.
- Daily challenges (src/shared/daily.ts): `<game>/?daily` plays today's seed (`dailySeed(game, day)`,
  local date); each game keeps its in-progress daily under `dailyRun` and today's best under `daily`.
  Wired for Afterglow, Rewild, Glyphwright, Delve, Nightline, Unspoken, Hexhold, Triad, Ninefold, Summit, Quarry, Sungrazer, Kitbag, Brink (a daily win-in-N puzzle), Loomsong (a daily song), Simmer (a daily season), Gleam (a Medium puzzle), Trestle (a d 0.55 level), Tidings (a daily road) and Lull (a daily wish); the hub's Daily section links them.
- Afterglow extras: Nights 1-5 (`NIGHTS` in content.ts, unlocked by `profile.nightsWon`), arenas
  (`ARENAS`/pillars in core/arena.ts, hashed from the seed), unions (`union` on a WeaponDef: two
  maxed weapons merge in a chest), and player damage is attributed (`w.taken`, `w.killedBy`).
  `NIGHT=n ARENA=1 npx vite-node scripts/afterglow/probe.ts` probes them.
- Glyphwright runs are a seed + build actions (`B`uy/`M`ove/`S`ell/`E`mpower/`R`eroll/`F`reeze/`G`o; a trailing
  `k` on B/M/E keeps a set unmerged, and merges only take sets that include a rune the action placed);
  battles are deterministic, so `replay(seed, a)` rebuilds the run. Modifier order only matters for Echo and the
  element (last wins); burn is a fraction of the finished hit. Novas only hit walkers near the tower (by design: Wisps
  and Drakes fly over), so a Nova loom needs one other row for flyers; that is enough (looms.ts), two Novas aren't.
  The smart bot scores a loom by a power mean of its damage per foe kind (`W.cover` 0.15, so a kind it can't hurt
  is a hole) and counts a second Nova row at `W.novaStack` (0.07).
- Rewild runs are a seed + actions (`P<card>.<cell>` place, `R` new hand, `E` end season). The
  season sim (src/rewild/core/sim.ts) visits cells in index order with one Rng per season, so
  the UI's forecasts (clone + end season) are exact. `track(ev, cell, id, after)` (core/forecast.ts) follows one
  population through those events (`feed` events carry food/need when it eats, `move` says flee/food), so the
  placement glow and the cell readout come from the same trial. Wildfire burns last in a lightning summer
  (after grazing; rules v6): it catches in the nearest burnable cell within 3 of the strike (`NEAR3`) and leaps to burnable
  cells up to 2 away (`NEAR2`); burnable = grass/flowers/shrub at size ≥ 2 on moisture-0 ground, not cropped by a grazer
  this season (`cropped` in simulate); animals on burning cells die (bees/songbirds escape). Rules v7: `fireZone` (burnable
  cells within reach, judged after the plants grow, before grazing) is an exact outer bound: animals never move or send young
  into it and the fire never leaves it. Lightning: 40% of summers from year 2 (drought 25%). The board draws the burn plan,
  the zone (dashed), bone-dry soil (cracks) and, the season before, the bolt over the art plus next summer's plan if
  nothing more is played (clone + end twice: exact for that case). The panel's ✖/⚠ lines always show; a dead species
  gets one cause in the report (the death that finished it).
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
  load), and a link-opened run becomes the current saved run of its village. Glyphs never look alike: after
  generating, `glyphsAlike` (strokes moved/scaled to a unit box, ends unordered, ±0.15) redraws a later look-alike
  from its own seed stream (only that glyph changes; world and saves don't depend on shapes). The hash test pins
  `makeLanguage(seed, 1, false)` (the pre-fix language) and checks only look-alikes were redrawn.
- Hexhold runs are a seed + tick-stamped actions (`<tick>:B<cell>.<tower>`, `U`, `S`, `W`); enemies follow a
  flow field (src/hexhold/core/board.ts) rebuilt on every build/sell; `buildError` forbids sealing any portal. Flyers use `FLY_DIST`, burrowers
  `s.dig` (the tower-less field); `distFor` picks. ~1/3 of maps have two portals (`s.portals`). A burrower under a
  tower (`buried`) can only be hit by Mortar shells (rules v6: `hittable(…, deep)`), so a maze covering its whole line
  doesn't shield it. Known quirk, left as is: a Mortar beside a Bolt aims at flyers but its burst only hurts walkers
  (fixing it lifts the bot from median 27 / 7 wins to 30 / 13 of 32, so it needs its own tuning pass). Rules v6 also:
  start gold 230, waves 1-7 budget ×0.7/0.8/0.85/0.88/0.9/0.92/0.95, first Colossus `FIRST_BOSS` 0.7 hp. `stats.leaks`
  ({wave, id, n, lives, split}: Splitter runners apart) feeds the results card's "What got through". The page drops
  `s.fx` after rebuilding a run (start/reload/link), so only live play makes banners, sounds and buzzes.
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
- Ninefold (src/ninefold/core, rules v8): `makeHole(seed, n)` grows a corridor of 16-unit cells on a 6×9 grid (a
  self-avoiding walk in a 4-column band, never touching itself, plus side pockets), walls = the cells' outer edges,
  obstacles in route cells (never tee/cup). Shapes (`hole.shape`, from hole 3/4): ~1/4 `green` (the last 2-3 cells get
  twins beside them, cup out in the open), ~1/6 `split` (three straight cells get twins and a divider rail down the
  middle one, `hole.rails`, also in `walls`; sand in one lane 60%); twins may only touch route cells next to them (no
  shortcuts). Windmills turn 0.7-1.1 rad/s (v7: 1.1-1.7, a ~0.3 s window), `Mill.lane` = the run's direction; the page
  always draws the reach ring, a fan behind each bar end (sweep direction) and lane notches that glow green while the
  bar lies along the lane. `simulate` is a fixed 240 Hz step; shots are saved as `angle.power[.tick]` in thousandths,
  so `replay(seed, a)` is exact; roll on open grass = `rollShare(power)` (p^1.25) × MAX_ROLL, and the aim readout shows
  that share, not the pull. `ShotResult.met` lists what the ball met (sand/slope/water/wall/post/bumper/mill), so tips
  after a shot only cover what it touched (first-time tips at a hole's start may introduce what's on the hole). Preview:
  ≤ `PREVIEW_FRAMES` (45) or the first knock, never a sink: ✕ = a real knock, ring = it stops, fading tail = the
  preview ran out. Resting the finger 0.3 s turns on fine aim (aim follows the finger at 1/4, `FINE_*` in game.ts).
  Par = round(0.31·len + 0.16·obstacles on the route + 0.1·turns + 0.15 green − 0.15 split + 0.25), 2-5, refit by
  `fit.ts`: `NOISE=0.06 balance.ts 30` mean ≈ −3 (median −2…−4; old par let it go ~−5 on v8 holes), green/split play
  ~0.3 easier against par than corridors. Daily: `dailyCourseSeed(daySeed)` picks the most biting of `DAILY_PICK` (8)
  courses (`courseBite`: par rounded below its estimate, mills, ponds): `DAILY=1 balance.ts 30` mean ≈ −0.7. Daily card
  shows only daily stats (`dailyStats`: streak, daily aces, dailies under par) and copies a spoiler-free result (a
  square per hole vs par); the main profile counts rounds, best, `under` (rounds under par) and non-daily aces. Tools in
  scripts/ninefold: `show.ts <seed>` (ASCII + shapes), `shapes.ts N` (shape counts per hole), `balance.ts n` (search
  bot, NOISE=0.04 wobble, DAILY=1, SEED=), `fit.ts N base > rows.json` / `fit.ts solve *.json` (par refit), `trace.ts`,
  `botround.ts <seed> [holes]` (actions for `?seed=&a=`, optionally stopping after some holes).
- Summit (src/summit/core): 8 floors; each deal is a hand-drawn layout (layouts.ts: rows as strings in
  half-card steps, ≤ 8 cards across; a card is covered by the next row's cards at x±1) from a seeded 52-card
  deck, plus a draw pile. A card plays if uncovered and one rank from the waste (A-K wraps). Draws are a run-wide
  supply: each floor adds `DEAL_DRAWS[f]` (28, 16, 9, 9, 8, 8, 7, 7) to what's left, of which at most
  `TUNE.carry` (15) carry up; no plays and no draws = run over. Every draw goes through `drawStep`: it never
  turns up the waste's rank (`noRepeat`), and from the `MERCY`-th (3rd) draw in a row without a play it swaps in
  the nearest deeper card that fits an open card, a plain card before the Joker, else the next fitting card
  of the undealt rest of the deck (`reserve`, `o.deep`); `o.noLuck` when none can. `hopeless(r)` (exact: no
  open card fits the waste and no pile/deck card fits an open card) ends the floor at once (`o.dead`) unless a
  blast or undo is left (then `cornered` shows End run); Second Wind fires on it too.
  Spyglass shows `nextDraws(r, 3)` ({card, lucky}), which runs the same steps on a copy, so it's exact for draws
  in a row; ✨ marks a lucky one (gone if you play first). Long Stride discards the top card only when that card
  fits nothing open (`strideDiscards`, `TUNE.strideCost` 2).
  Undo keeps cards you have seen face up. Charm strengths live in `TUNE` (Mirror 2 / Long Stride 2 plays per
  deal, Flags 1 draw per peak top, Wind 12, carry 15); a test checks the charm texts quote them.
  Streaks score 10·n. 13 charms (charms.ts), one of three after each floor (`offersFor`, seeded per floor).
  Actions: `P<slot>`, `D`, `B<slot>` (Blasting Cap), `U` (Rewind: snapshots in `hist`), `C<charm>`, `X` give up;
  `replay(seed, a)`; `startAt(seed, floor, charms)` for tests. Tools in scripts/summit: `trace.ts <seed>`,
  `upto.ts <seed> <floor> [moves]` (bot actions for `?seed=&a=`), `show.ts <seed> <a>`, `curve.ts` (clear rate
  vs draws per floor). UI is DOM cards (game.ts), not canvas.
- Quarry (src/quarry/core): a 6×7 face of flat-top hexes in columns (odd columns half a row lower; cell = row·6+col,
  `NEIGHBORS` in board.ts). Drag through touching tiles for a word (3-8 letters, Qu is one tile); points = letter
  values × length bonus × word multiplier. Length bonus = letters − 2 plus Long Haul/Hot Seam; word multiplier =
  1 + golds + Chisel (3 letters +2, 4 letters +1)/Echo/Opening (+2)/Prospector (+1 if any letter worth 4+), which ADD
  (rules v2: they used to multiply and snowballed). Shakes move tiles with their gold/fuses (Tremor gilds one more);
  after a fuse is used or blows, `fuseCool` (FUSE_COOL = 2 words) passes before a new one can drop in. Blasts pay
  letter values ×2 (×3 Demolition), at most BLAST_CAP 40 a word; faces hold at most ROCK_CAP 6 rocks; depths 6-8 give 7 words. Tiles fall down their column (`settle`) and refill from
  the bag (`pickLetter` keeps 34-48% vowels, ≤ 1 of each J/Q/X/Z); every tile drawn uses its own
  `Rng(mixSeed(levelSeed, drawn++))`. 8 depths: `TARGETS` within `WORDS`, spare words pay 10·depth each, then one
  of three of 13 perks (perks.ts). Rocks crack when a word touches them (granite needs two), fuses (depth 3+) blast
  their neighbours when used and cost a word if they run out; a fuse that drops into a cramped spot passes to the
  nearest `fuseFriendly` tile (4+ open neighbours, 2+ of the other vowel/consonant kind); if no word is left the face
  is shaken for free.
  Actions `W<i.i.i>`, `S` shake, `X<i>` pickaxe, `P<perk>`, `Q`; `replay(seed, a, dict)` needs the `Dict`.
  Dictionary: src/quarry/core/words.ts is generated by `scripts/quarry/build-words.ts` (SCOWL sizes 10-50 via
  `wordlist-english`, blocklists `badwords-list` + `naughty-words` + its own list, an allow-list (pawn, poof…) and
  an INFORMAL list (yeah, okay, yay, phew…) and PARTICIPLES (mown, hewn, shorn, sawn) added as common, front-coded, ~46 KB gzipped,
  lazy-loaded by main.ts); bots use only the common part (SCOWL ≤ 35). `scripts/quarry/grep.ts '<regex>'` searches
  it; `upto.ts <seed> <depth>` prints bot actions for `?seed=&a=`. UI is DOM hexes (game.ts) with WAAPI falls.
- Sungrazer (src/sungrazer/core): a fixed 240 Hz sim. world.ts grows the sky lazily and in order from the seed
  (a spine of stars each ≤ MAX_LINK from the last, bonus stars, mote arcs in coronas, cinders clear of every corona
  and of the spine line; zones by altitude bring cinders 450, pulsars 1000, giants/drifters 1700…); no trig in the
  rules (a 16-direction table, `swing` ping-pong). sim.ts: holding grabs the nearest lit star within LOCK (one grab
  per press, not the star just left for REGRAB ticks); the tether eases to `goal` = the grab distance clamped to
  [`safeRadius` (a grab on a star you're about to hit catches you in its corona), `maxTether(alt)` (18 at the start,
  LOCK by altitude 250)], then the goal reels in (`reelAt`) at constant speed toward
  `speedAt`; letting go is ballistic (GRAVITY); walls bounce (and reverse an orbit) and drop the combo; the camera
  follows up and the void rises (`riseAt`, slow for the first ~100 units; `gravityAt` is lighter early too) — fall
  under it, touch a star (`burn` on the tether, `star` in free flight) or a cinder and the run ends. Spine stars are
  never stacked in a column (≥ 12 units across). The page marks a release path that hits something in red with an ✕ (in flight: a ~0.6 s look-ahead, as
  you're holding), yellow dashes if letting go up to 0.45 s later would, and pulses the tether red in the last 0.5 s
  before a burn (`burnIn`). A pulsar going dark clears `used`, so a finger still down reaches for the next star. Combo grows
  only from close shaves (NEAR, NEAR_CINDER; cinders hit at CINDER_HIT of their drawn size) and sungrazes (letting go < SUNGRAZE from the surface); links keep it alive for
  LINK_TICKS of free flight. A run is seed + mode + toggle ticks (`replay(seed, mode, inputs)`); `cloneRun` shares
  the world. The page shows a release preview by stepping a clone. `?seed=&m=&a=&t=` plays a recording back
  (`__game.seek(tick)` fast-forwards it); tools: `trace.ts <seed> [skill]`, `botrun.ts <seed> [skill]`, `bench.ts` (µs per
  sim tick). Frame budget: the sky is the stage's CSS gradient, stars/glows/void are cached sprites (render/draw.ts),
  the canvas is capped at 2× DPR, the HUD is written only on change, nothing redraws under a card, and the path
  look-ahead runs every 8 ticks (the yellow check every 16, looking 0.5 s ahead) — keep per-frame sims out of render.
- Kitbag (src/kitbag/core): gear.ts (19 gear cards: each has slots `{need, fx, mult, add, uses, perFight?, fuse?}` and
  an `up` version; 6 dice kinds with face lists), enemies.ts (hp + a cycle of intents `{atk, hits, block, hex, wither,
  poison, heal, buff, charge}`; the fight starts at a seeded step, never on a wind-up), run.ts. A turn: block resets,
  your poison ticks, dice roll (`rngFor(seed, T_ROLL, floor, turn)`: every stream goes through `rngFor`, which hashes each
  part in turn, because `mixSeed(a, b)` collides along a + b and v1 replayed whole roll sequences between fights), wither lowers them, hex locks the
  highest (always leaves one free). Placing applies at once (`applyPlace`; damage soaks enemy block first, `pierce`
  and the Keg skip it); two-dice slots (`pair`/`two`) hold the first die (`held`) until the partner lands; reroll/
  split/flip/bump push a die back into the pool (rerolls key on a per-turn counter that undo restores, so undo can't
  fish). `E`: enemy block resets, its poison ticks, then the intent (skipped if stunned). Wins open a `Choice`
  (reward: gear / upgrade-or-die / heal-or-more; elites `more: 1`; rests heal 35% or upgrade; shrines trade HP);
  a full kit (6) needs `C<k>.<replace>`; no heal is offered at full HP; dice are only offered while `diceRoom(r)` (dice the gear can spend a turn)
  exceeds your dice. Heals past full HP become block. `incomingOf(r)` = the hit past block + the poison that ticks
  next turn, `lethal` when it kills (red tag, info line, End-turn confirm). Rules v3: `foeStats(id, floor)` scales
  ordinary enemies and elites through each stage (+8% HP, +5% damage a floor into floors 1-4 / 5-8 / 9-11; the boss
  is fixed) and gives the map its HP and 💥 biggest-blow labels; fights open only on `openingSteps` (never a wind-up
  or the blow after it); block raised on the enemy's wind-up turn carries into its blow turn (`f.brace`); score =
  enemy HP (elites ×1.5) + `floorPoints(f)` = 40·(f+1) per floor done + 5 per HP taken off The House (`BOSS_PTS`,
  also when it wins) + boss 500 + win 1000 + 10·HP. Rules v4: The House plays one of three scripts per seed
  (`scripts` on its EnemyDef, `scriptFor(seed, id)`, `patternOf(id, pat)`, `Enemy.pat`; blows 30, 176 HP); the map's
  💥 is the hardest turn with one cycle of the enemy's own buffs; rewards skip gear and upgrades offered in the last
  two rewards (`r.offered`) and third copies, rares weigh 2, and from floor 6 a kit with one block card is offered a
  second one first. Map: 12 floors × 2 nodes, a free pick per
  floor (floors 1-2 fights, 6 rest|shrine, 11 rest|…, 12 The House; elites ≥ `ELITE_GAP` = 3 floors apart); walking
  into a rest/shrine completes the floor. Actions `M<k>`, `P<die>.<card>.<slot>`, `U`
  (undo within the turn, snapshots in `hist`), `E`, `C<k>[.<r>]`, `S`, `X`; `replay(seed, a)`; `previewPlace` runs a
  placement on a clone for the slot previews (never show a reroll's value). UI is DOM (game.ts): drag a die (pointer
  capture + ghost) or tap die then slot; kit grid bottom-aligned near the dice, the enemy panel takes the spare height
  (container queries grow the portrait). `KITBAG v… seed=… a=…` reports.
- Brink (src/brink/core): radius-3 hex island (37 cells, `NB`, `MIRROR`, `RING` in board.ts), six stones a side
  (`SETUPS[0]`, a V two rows apart, dark = light mirrored). A move is `from*64+to` to a neighbour: a step, or a shove
  of the line in front if it is ≤ 2 stones (either colour); the far stone goes off the edge or into a hole. From ply
  `TUNE.crumbleStart` (6) one tile falls after every ply (`crumbleOrder(seed)`: rim first, mirror pairs, seeded), taking
  any stone on it; `TUNE.target` (3) stones lost loses. Light = the player (bottom), `first` says who moves first.
  AI (ai.ts): negamax alpha-beta + TT + killers + knock-off quiescence, iterative deepening capped by NODES (never the
  clock), so levels are deterministic; Easy and Normal are depth 2, pick among moves within a seeded noise margin
  (200 / 70) that never includes a recent layout unless it is the best move, and search one ply shallower on a seeded
  share of moves (`slip` 0.2 / 0.25: two-move threats slip by); Hard ≤ 70k nodes. Odd fixed depths (3) skewed mirror games ~25/75 by side. `chooseMove(s, level, recent,
  seen)` takes the game's moves and `stoneKey`s (stones + side to move, holes ignored): recreating a layout from the
  last `REPEAT_PLIES` (8) costs the searching side `W.repeat` (500) at any depth, and `loopPenalty` taxes a straight
  shove-back at the root. Hints (rules.ts): `threatenedNext(s)` = your stones the reply could take once the tile after
  your move has fallen (shoved off, or onto/left on the tile after the reply), drawn as red rings; `chancesNow(s)` =
  enemy stones you can take now (green); a stone of yours on tile 1/2 pulses and the info/status lines warn. Puzzles
  (puzzle.ts): `winningMoves(s, n)` is an exact AND-OR search; `LESSONS` are hand-made (unique, tested);
  `POOL` (pool.ts, generated by `scripts/brink/puzzles.ts 400`) holds self-play win-in-2/3 positions with one winning
  first move, stored with the solver as light (`mirrored`); the daily walks it by `dayIndex(day)`. Tools:
  `trace.ts <seed> [lvL] [lvD]` (prints a game and its `a=`), `show.ts <pool index|lesson id>` (position + line).
  `?seed=&level=&first=you|ai&a=` replays a game, `?puzzle=<id>&a=` a puzzle (reports `BRINK v…`).
- Loomsong (src/loomsong/core): `makeSong(seed)` (song.ts) picks key, mode, BPM (90-140, even), a form from `FORMS` that
  lands in 90-120 s, a verse and a chorus progression (a diatonic chord a bar, voice-led pads), drum grooves with fills
  and crashes, bass, a chorus arpeggio and a motif-based lead (two-bar motifs riding the chord roots, strong beats on
  chord tones, cadences on the tonic); everything in 16th steps, one `rngFor(seed, part)` stream per part.
  `makeChart(song, level)` (chart.ts) merges onsets per step (lead > crash > snare > kick > bass > hats, by level), fills a
  per-bar budget (nps × section intensity) under the level's spacing, then long lead notes become holds, crashes on a
  bar start flicks (cleared around), two-source strong steps chords; lanes follow the melody contour (up = right),
  kicks lean left, snares right, with jack/run/flick-clear/one-hold-at-a-time rules (tests check them). judge.ts: Perfect
  ±45, Good ±100, a press up to ±140 uses a note up as a miss; flicks ±60/120 (stamped at touch-down, swipe ≥ 26 px
  within 220 ms); a hold let go more than 120 ms early (or never held) is one miss: one judgement per note (rules v2),
  so menu and results counts match. A play is seed + level + events (`d`/`u`/`f` + lane + song ms,
  already minus the calibrated offset); `judgePlay` sorts by time and recomputes; combo is counted in chart order, so
  the result never depends on frame timing (the live judge runs 50 ms behind the clock). Score = 900k × accuracy
  (Perfect 1, Good 0.75) + 100k × max combo share; grades S Silk ≥ 950k, A Linen 880k, B Cotton 760k, C Wool 600k, D.
  audio.ts schedules the song 0.3 s ahead on the AudioContext clock and maps pointer `timeStamp`s onto it (max of
  ctx − perf over 1.5 s); no Web Audio, sound off by choice, or a context that never starts → a silent perf clock.
  Calibration: 22 clicks every 0.6 s, taps after the 3rd, median error = `profile.offset`, clamped to −50..300 ms
  (`clampOffset`); an optional guide ring flashes at click + current offset; negative/huge/wide (spread > 60) results
  ask to retry; result cards' buttons stay disabled (dimmed) for `CALIB_GUARD` 1.5 s, since the thumb keeps tapping the
  beat; the prompt returns every visit (menu dot) until calibrated or "Don't ask again". The offset shifts only
  the SOUND against beads + judging (they always agree), so results offer a "Shift timing ±N ms" button (the one name,
  as in the help) by the mean error once, and not again if the last shift left the error unchanged (`profile.shift`: a
  sight-tapper). A resize or rotation mid-song pauses (the pause card asks a sideways phone to turn upright);
  judgement words sit under the pads (`L.popY`), off the beads' approach; the opening hint goes at the first note.
  The menu song persists (`profile.song`). Songs play out (~2 s fade) before results. `?song=CODE` (base-36 seed), `?seed=&lv=&a=` shows a recorded play rescored; `__game.auto = true`
  plays a bot (screenshots). Reports `LOOMSONG v… seed=… lv=… off=… a=…`.
- Simmer (src/simmer/core, rules v6): `TUNE.days` (20) nights. data.ts: 6 ingredients (`marketPrice(seed, day, ing)`: cheap
  18% / usual / dear 20%; `keeps` nights counting the night bought: fish 1, greens/berries 2, mushrooms 3, rice/flour 6; the
  cool box adds 1, also to stock on hand, and cold dishes are worth ×1.15 with it: `NightCtx.cool`), 10 dishes (one unit of each listed ingredient, `base` worth, `cook` minutes, tags; 3
  known, the rest learned for coins), 8 critter kinds (`SPECIES`: loves/dislikes one tag, purse range, patience, arrival
  window, renown to unlock 0/0/0/10/20/35/55/80, weather likes, badgers eat two), weather drifting warm → chilly
  (`makeWeather`, 40% repeats), festivals (two seeded + the last night), paydays every 5th night, 5 upgrades and a helper per
  night (+1 stove; `wageOf` = 12¢ + 1¢ per expected guest, so busy nights make the second stove worth buying). night.ts: `worthOf` = base × love 1.4 / dislike 0.6 × weather tag × festival sweets, rounded;
  `chooseFrom`: the most worth left over (worth − price) among dishes in stock, priced ≤ worth and ≤ purse, else why
  (soldout/pricey/worth/nolike); `simulate` is a minute-by-minute FIFO queue over the stoves (SERVE 2 + cook minutes per
  guest), walk-offs at their patience, closing at 240 (arrivals end at LAST_CALL 225). Delighted (`delights`) = a dish with
  the tag they love and ≥ 25% of its worth left; settling for a second choice or waiting > half their patience takes a step
  off. run.ts: renown 0-100 (`repChange`): + round(delighted × max(20% `gainFloor`, (100 − renown)%)) − `lossFor(letdowns)` = ceil(let-downs / 2),
  at most `TUNE.lossCap` 5 a night (v1 took a full ♥ each: festival queues cost testers ♥18-25 a night); each delighted guest brings a friend next night (≤ 10); street crowd = (8 + 0.25·renown) × weather × festival 1.6
  × lanterns 1.2 × ±15%; stock is used oldest first and batches on their last night are thrown out (ledger `wasted`); under
  `TUNE.safety` 30¢ after a night a neighbour tops it up to 30¢ (`giftFor`; `gifts` sums the coins; ledger `gift`, and its
  `coins` includes it). At full renown, hearts beyond 100 come back as regulars' tips
  (`TUNE.fullTip` 25¢ a ♥: ledger `overflow`/`tips`, so late delights still count). From night `TUNE.reqFrom`+1 (6) each
  night has a request (`requestOf`, `ctx.req`, seeded by `T_REQ`: a kind expected tonight asks for a dish it loves, known
  or not; never the same kind or dish as the night before, and each earlier ask halves a kind's weight (a dish's ×0.4)): worth ×1.4 to that kind, `TUNE.reqGuests` 3 more of them come for it (`askersOf`, `Guest.asked`), they take it
  whenever they can afford it (`chooseFrom`'s `prefer`, `preferOf`), and each served is delighted and tips 14¢
  (`Visit.tip`); the morning card prices it with `askPrice` (within their purses) and says how many will order it. One late
  non-festival night has a rival stall (`makeRival`; `ctx.rival` = `rivalDishes(seed)`, one starting dish + one other:
  passers-by ×0.8, and your dishes it also sells are worth ×0.75, so the counter-play is a menu without them; the scene
  draws its stall, the ledger says what it cost). Recipes cost
  `learnCost` = listed × `TUNE.learnMul` 2, upgrades `upCost` = listed × `TUNE.upMul` 1.8 (lanterns +15%), so buying
  everything no longer pays; a purchase that leaves less than tonight's Fill cost asks first. Score = coins + 10·renown; `STARS` 1200/2700/4000. forecast.ts:
  `forecast` (expected mix; never the real crowd) and `demand` (exact expectation over each kind's purses) feed the page's
  "~N orders", Fill to forecast (`fillNeed`, ×1.1) and the bots; `recipePreview` (orders tonight at the listed price, in
  place of the weakest dish when the board is full, who loves it), `upgradePayback` (¢ a night: profit diffs via `profitOf`,
  which drops orders past 85% of the stove minutes; stove via `helperPayback`; bench from last night's walk-offs; cool box
  from chilled cold dishes + past waste), `allocateStock` (expected orders interleaved, shared ingredients split; the menu's "stock covers" and stocked
  takings), `queuePreview` (8 typical evenings, with a likely range leaving out the calmest and busiest: crowds from their own `T_PREVIEW` stream,
  unlimited stock, the real `simulate`; average guests who give up or are turned away at closing) and `helperPayback`
  (let-downs with one cook more, each worth its profit + half a ♥) feed the menu's queue line, the open warning
  (`queueWarns`: ≥ `QUEUE_WARN` 2 let-downs expected, or a helper paying ≥ its wage + 10¢; otherwise only the menu's quiet
  line; says when one helper isn't enough and suggests the second stove only if you don't own it; its default hires only
  when that pays) and the bots. A recipe learned with a free menu line goes on the menu. Actions `b<ing>.<n>`, `l<dish>`, `u<k>`, `o[h]<dish>x<price>.…` (open
  the night; h = helper); `replay(seed, a)`. The morning is a draft (store `draft`) turned into actions on Open; recipes and
  upgrades apply at once, and this morning's (actions after the last `o`) can be undone by replaying without them. Open
  warns (one card) about short stock, a stove that can't keep up (with "Hire a helper and open") and prices below cost.
  Store `evening` = {seed, n, t} while a night plays, so a reload fast-forwards that evening to where it was (`Scene.seek`;
  `done` once it closed: a reload then goes on to the morning or the season's end);
  the ledger closes to the guest log (dock: Ledger / Night N ▶). After Fill to forecast the pantry folds to one line
  (`draft.filled`; Change unfolds) and refills itself when the menu, prices or helper change. UI: DOM morning (forecast with tappable crowd/kinds, menu with price steppers and who-orders sprites,
  pantry with spoil warnings, recipe/upgrade cards), canvas evening (scene.ts: original critter sprites, the red-panda keeper,
  weather; guests set off 16 sim minutes early so they reach the stall on time), a log and guest taps that spell out purse,
  worth factors and the reason, a ledger card per night, guest book (📖). `SIMMER v… seed=… a=…` reports.
- Gleam (src/gleam/core): N×N tiles (`kind`: floor, wall, socket, lamp, crystal); colours are R/G/B bits, added at
  crystals (`target` per cell, 0 = dark crystal). Codes per socket: 0 empty, 1-2 mirror / \, 3-4 splitter / \ (pass +
  turn), 5-7 R/G/B filter; `stock` per type (mirror, splitter, 3 filters) = the answer's pieces, givens included. Solved =
  every crystal exact, no dark crystal lit, every tray piece placed and lit (`status`). Solvers work on socket domains
  (bitmask of codes): `Ctx.check` = certain light (through decided sockets) must not over-light a crystal, possible light
  (union of options) must still reach every needed bit and every piece, tray counts must fit; used-up types narrow
  undecided sockets in place (repeated until stable: a socket narrowed to one piece counts as placed).
  `solveAll` branches on frontier sockets (exact, uniqueness); `deduce(p, depth)` eliminates codes whose assumption
  fails `check` (depth 1) or fails after depth-1 deductions (depth 2), and `nextHint` replays that log to the first
  ring pinned to a piece; `check` reports the most direct broken rule first (dark/wrong crystal, a piece left in the dark,
  a crystal cut off, tray counts) and `reasonText` words it as cause → effect ("the white lamp's red light" when only a white lamp gives it).
  Taps (`cycleCode(p, board, i, armed)`): with a tray piece armed, place it then only turn it; with none, an empty ring
  takes the first type left, a piece turns once, then comes off. A drag drops on the ring under the finger (the piece
  floats 0.45 cell above it, the ring is outlined). Generator (gen.ts): beam walk on fresh tiles, decoys, dark crystals, uniqueness fixes,
  `CHECK_LIMIT` per attempt; Small needs `trapped(p)` (some crystal's answer route bends more than its most direct
  route over the rings from a lamp of its colour), Medium a filter (white lamp always). v3 (`sizeDef(size, v)`, `V3`):
  no idle piece (taking it out, or a splitter made its mirror, changes no crystal's light), Large ≥ 3 depth-2
  eliminations, Small 2-3 lamps and 3-5 pieces. `generate(seed, size, v)` still builds v2 (v1 Large = v2; pinned by a
  hash test), saves carry `v`, and dailies use `dailyRules(day)` (v2 up to 2026-11-14) so a day's puzzle never changes; seeds hash `mixSeed(mixSeed(mixSeed(seed, tag), n), attempt)`. A run is seed + actions
  (`<sock b36><code>`, `H…` hint, `M<a><b>` swap, `U`, `R`); `replay(p, a)`. Reports `GLEAM v… seed=… size=… a=…`,
  `?seed=&size=&v=&a=`. Bump `RULES_VERSION` when the generator or rules change puzzles (keep the old path behind `v`).
  Dailies (streak.ts): `profile.dailies[day]` {ms, hints, onDay}; `streakOf` counts days solved on the day; ☰ → Past
  dailies plays the last 8 days (`?daily=YYYY-MM-DD`, only today counts); the win card copies a spoiler-free line
  (`shareText`). A wrong-piece hint asked again with no move in between is free (`hf` in the save); hint text stays ≤
  `HINT_MAX` 205 chars (#info is 4 lines at 360 px), clauses: left empty / as the other kind / flipped, merged when equal.
- Trestle (src/trestle/core): a 13×12 grid of build points (y down, `pt(x,y)`), rock as axis boxes (`Rock`: bank, wall,
  spire `rock`, `log` low over a gap, `floor` close under it, `clear` = a boat lane: no building (`geomWhy` says "Keep the boat lane clear"), no collisions), fixed
  anchors, optional `wind` (gusts across, `gust(step)`, and updraughts, `lift(step)` × `LIFT_K`, that lift whatever only
  hangs; each peg is pushed in proportion to the pieces it holds), a goal: `cross` (cart(s) from `startX` to past `goalX`,
  road from anchor `from` to `to`, `carts: 2` = a convoy 1.6 apart) or `reach` (a peg on every ring in `rings` holds its
  lantern within `RING_TOL` for the last 1.5 s of 4 s). Materials (build.ts `MATS`): plank = road (the cart only rolls on
  planks and rock tops), twig, twine (pulls only); reach 2.3 / 2.3 / 4.5 (shown ≤2.2 / ≤4.5), strength 80 / 60 / 45 (shown on
  the tray); cost = round(length × cost/unit). A build = actions (`P|T|R|D` + two 2-char base-36 points, `U`, `C`, `G` = a
  test run); members through a peg split there. sim.ts: XPBD at 480 Hz, 2 iterations, rigid distance constraints (ropes
  one-sided), force = λ/h² smoothed ~140 ms (`SMOOTH`), snap past strength (`firstBreak`/`firstBreakAt`). Pieces with a
  free end (`looseOf`: an end peg that holds nothing else, not an anchor or ring, pruned repeatedly) are left out of
  runs entirely (rules v4: a stub's peg mass and wind catch had let it rescue a failing build; the v3 par builds used the
  trick), drawn faded, counted in the cost line and ignored by `wobbly`. Carts: two light
  wheels (12% each) on plank segments and rock, a body on damped XPBD springs (~3 Hz), a motor along the contact tangent to
  `CART_SPEED` with `CART_ACC` 3.6 < g·sin 26.6°, so the beetle can't climb a 2-across-1-up plank: roads must be level or go
  down (that rules out dips/humps, which held as plank chains and arches and beat every truss; generated tilts only go down).
  Only + − × ÷ and sqrt, so runs are exact everywhere. Masses: pegs 0.06 + half of each member.
  solve.ts (the surveyor, `survey(l, effort, cap)` → members, cost, `ease` = share of its shapes that held): Warren trusses
  (both road alignments), braced bands over/under the road, roads on struts/hooks (with or without small triangles),
  cantilever rails and cord/strut Vs to each ring (several rings: best shapes per ring merged); keeps those that pass with
  nothing snapping, strips the cheapest few in several orders, swaps pulling twigs for twine, merges lone road pegs, local
  search, all within `cap` test runs. Roads also come stepping down near either bank (tilted levels), with a steep
  1-across-1-down step (rules v6: a chain hung from such a step can swing a little and hangs as a ribbon of planks with no
  supports, real physics, so the surveyor builds it), through any anchors on the road line (island tops), and bare (the
  plainest builds bound par); struts from the rock also come as planks (stronger; rules v5).
  Lantern shapes also include Warren arms and cable-stayed arms (a strut rail with cords
  from every anchor above), and a second ring hung off the first ring's arm. `polish(l, ms, iters, seed)` is a seeded local
  search (remove one or two pieces (not level road planks), maybe swap twig/twine/plank, add a piece between pegs or a new
  peg braced to two; keep when
  it still passes and costs no more, early steps may cost up to 14 more); live levels polish `LIVE_POLISH` (300) steps,
  the pool 3 × 5000. gen.ts: level types (`LEVEL_TYPES`: plain, hooks, arch = pegs only low on the faces
  and nothing above, boat = a lane under the road kept clear, convoy, island, spire; lanterns: wall brackets with one or two
  rings, gap = a lantern over the middle of a gap: from span 3 with the ring level with the banks early on; face pegs on
  both banks, one or none, sometimes a hook, later two lanterns; boat lanes 1 or 2 in from the banks, sometimes no face pegs
  or a hook), islands 2-3
  wide, off centre, sometimes a step low; spires off centre, varied height, sometimes two; hooks one to three, 2-5 above
  the road, over the middle, one bank only or spread; `layout(seed, d, t, type)`, wind (1.5 + 1.8d, p 0.2 + 0.4d,
  updraughts `LIFT_K` 2.4) from d 0.25, logs/floors
  as twists; tips are only the twists (short, so #info holds tip + star line at 360 px);
  `priceLevel` rejects lanterns straight under an anchor, builds of < 3 parts and (past d 0.1) crossings a bare plank road
  holds, sets par, parParts, budget = ceil(par ×
  (1.4 − 0.25d) / 10) × 10, `ref`, `diff` = `difficulty(ease, parts)` (0.65 × shapes that failed + 0.35 × parts).
  The trail (trail.ts): 6 tutorials (par = the obvious lesson build, `ref`), then `POOL` (pool.ts, generated by
  `scripts/trestle/pool.ts`: candidates of every type over d 0..1 re-surveyed at effort 4 for tight par, picked to rising
  difficulty targets (concave, `q(0.12 + 0.86 f^0.75)`, so the middle of the trail is already demanding) in a type
  rotation (playtest bias: arch +0.12, island −0.05, gap −0.15; near-twins by par/parts or by pegs/span/wind kept apart;
  hooks and spires at most 3 each in the first 30 picks, 5 in all; a candidate whose `solutionSig` (type + planks / twigs
  / twine / free pegs in its par build) matches a pick costs +1), then ordered
  easiest-first with no type repeated within two levels and every type within the first dozen, then each par build polished;
  unique `trailName`s; `tricksOf` finds relay (a free peg held only by twine, one from an anchor), fan (3+ cords from
  one anchor) and tie (a cord from a rock peg to a free peg) in par builds and the first level needing each gets `trick`,
  explained by a card on its first visit (store `tricks`)), then live levels in `ROTATION`: three candidates at d 0.75 / 0.9 / 1, the one nearest
  `liveTarget(k)` (from the pool's last difficulty, +0.004 a level, ≤ 0.95). Regenerate the pool after any physics/gen change (bump
  RULES_VERSION). Dailies (`seedLevel(..., daily)`): of two candidates, those whose `solutionSig` no pool level shares,
  the nearer to `DAILY_TARGET` 0.5, named with
  their own words for their kind (`dailyName`). Stars (`starsFor`): ★ within
  budget, ★★ cost ≤ par, ★★★ also parts ≤ parParts. diagnose.ts: `joined` (road bank to bank through planks and rock tops,
  rings tied to rock, loose pieces), `wobbly` (rigidity-matrix null space), `explain` in order: own weight (first snap
  < 0.3 s) → wobbly (counts the ringed pegs; names what then snapped) → too weak (names the first piece) → not joined →
  off the road / uphill (`uphill`: the climbing planks, which glow) / sag. Page: generated levels come from a module worker (gen.worker.ts) with a "Surveying…" card,
  the next trail level prefetched on idle, cached (`g<n>`, `gd<day>`); builds per level (`b<n>`); a failed run's note, the
  first-snapped piece's glow and ringed pegs per level (`f<n>`/`fd<day>`, while the build is unchanged). Drag from a peg
  (nearest grid point within reach; past reach a dashed circle + "max length" and the piece may only end on an existing
  peg or ring within 25° of the drag line, else nothing: never a silent free end; the 2× loupe looks at the landing point),
  tap a piece's middle to pick it (✕ Remove), again to remove; ⤢ zooms to the box around every anchor, peg and ring (never
  cutting one off), pinch zooms and pans. `buzz()` respects the vibration setting. `?lv=n&a=` / `?seed=&d=&a=` replay a
  build (not saved); reports `TRESTLE v… lv=…|seed=… d=… a=…`.
- Lull (src/lull/core): a sandbox garden, no fail state. x 0..999 = pitch (10 columns of the garden's major pentatonic,
  `colOf`, low left), y 0..35 rows = depth (8 lanes = which 8th of the bar it sings, `laneOf`, back row first); time is
  16th steps (84 BPM, `DAY` = 84 bars ≈ 4 min; dawn/day/dusk/night in sky.ts, weather in half-day spells `spellKind`,
  first morning clear). Six species (`SPECIES`: Chimebell bell, Harpfern pluck run, Pipereed reed (pond or shore; was Whistlereed),
  Moonlily glass (water only), Glowcap wood knock, Humwillow bass) with spacing radii, grow times, `every` bars, phrases;
  growth = (now − born) / grow, watering (`W`) moves `born` back by BOOST (growing) or sets `flourish` (grown: twice as
  often for 8 bars). `notesAt(g, step)` is pure (plant phrases, creature landings, breezy strums every 8 bars, rain drips),
  loudest first, ≤ 6 a step, all in the scale (notes above `TOP` fold an octave down). Creatures (`BEE`/`FLY`/`FROG`) hop on
  fixed schedules: `target(g, kind, k, hop)` picks from `eligible` plants with `Rng(mixSeed(seed^salt, k), hop)`, so the page
  draws them with `crittersAt(g, step)` and schedules their notes ahead. Plants stay sorted by (x, y) (creatures pick by
  index). A garden = seed + timestamped actions (`P<sp>`, `W`, `X` dig by exact x,y; `apply`/`replay`); `encode` writes the
  live plants as planting actions with ages (6 chars a plant; flourish is dropped), `decode` replays them, so saves
  (`lull.garden` {code, at}) and share links (`?g=CODE`, opened as a visit until "Keep") are the same thing; time away
  grows the garden on by up to half a day. Wishes (wishes.ts) are pure tests of the garden at its step, each with a
  `progress(g)` line ("2 of 3 notes on beat 3 (1 more growing) · missing so"). 10 milestones (`WISHES`, once per player, in
  the profile), each a deliberate act: one of each kind, pond song, all five notes on one beat or half-beat, Dusk chord
  (do-mi-so on one row, any of the 8, at dusk), three Glowcaps on one row at night, three flourishing, span, 24 plants, and
  two `event` ones the page grants (`Harp sweep`: 8 plants in one strum; `Gift`: sharing). Each garden's rotating wishes:
  3 active ids from a seeded order (`gardenWishAt(seed, n)`, weighted `KINDS`: mostly compositions and moments, e.g.
  `chord.<lane>`, `minor.<lane>`, `rise`, `fall`, `groove`, `offbeat.<sp>`, `beevisit.<sp>`, `flyvisit`, `frogvisit`; a
  single plant on a note (`sing`) is rare; the first is always `twin.<col>`; built by `gardenWish(id)`; old saved
  `duskchord` ids are dropped). Only plants ≥ half grown count. `fillWishes` never draws a wish that `tooEasy` finds true
  now, with every plant grown up, or grown up at six times over the next day (so waiting alone never grants one);
  `grantWishes` swaps met ones for the next; the `WishState` saves with the garden (`lull.garden.w`), not in codes. A
  visitor is granted garden wishes only after changing something, and never milestones. The daily wish
  (`dailyWishId(dailySeed('lull', day))`, a placement composition from `DAILY_KINDS`) counts only plants planted today in
  your own garden (`profile.daily` {day, keys, done}, `onlyPlants`; `dailyRun` {day, a: keys} marks it started for the
  hub); met → `recordDaily(store, streak, '✓ · 🔥 n')` and `profile.streak` {last, n}. `?daily` opens your garden with
  the wishes card. Notes have a colour per scale degree (`DEG_COLORS`: do red, re orange, mi yellow, so green, la blue): a
  dot under every plant (white centre = high octave, baked into the sprite), the ring when it sings, the planting label,
  the info line (`noteTag`) and note names floating up on a strum (`Scene.tag`, ≤ 10). The ★ count is written by an
  inline script in lull/index.html before the module loads. The pond's lobes are separate closed subpaths (a moveTo per
  ellipse) and the dashed shore is stroked per lobe then covered by refilling the union, so only the outer outline shows.
  Night darkens the land by 45% at most. Sun up t 0.97 → 0.57 (sets mid-dusk, fading), moon 0.56 → 0.97; dawn starts at light 0
  (stars fade by light 0.35), so the sky matches the label.
  A shared link (`?g=`) stays in the address while visiting and is rewritten with the visit's current code on save, until
  Keep / Back to my garden (a visitor with no garden of their own gets "Keep this garden" / "Start my own garden"). After a
  reload the sound needs a tap: 🔇 pulses and "Tap the garden to listen" shows until audio runs; that tap also does the
  tool's action. Plants keep clear of the edge beat chips (`Scene.edge()`): drawn narrowed (to 60%) then nudged in
  (`Scene.fit`; creatures, glows and strum use `baseX`). The beat: a bright added-light band on the current half-beat's
  lane, dark numbered chips on beats 1-4 and dots on the "and"s at both edges (the current one lit), and each plant pops
  (scale + ring at its base) when it sings. Meadow top at 44% / 40% / 33% of the stage (≥ 640 / ≥ 480 / shorter: 360×640
  gets ~34 px lanes). Lilies draw after all other plants; a willow in front of the pond overlapping it draws at 62%. Page: two canvases (#land: sky/hills/meadow/pond shaded for the light,
  re-drawn ≤ 2-3×/s; #board: transparent, cleared each frame), plants are cached sprites re-drawn per growth notch (1/48)
  and light notch (tone), swayed by a skew; audio.ts has six synth voices + reverb + rain/wind beds; the garden clock is the
  AudioContext clock once sound runs (perf clock before/without), notes scheduled 0.22 s ahead; `?seed=N` opens a fresh
  garden as a visit, `__game.fill(n)` / `__game.jump(step)` for screenshots. Bump `RULES_VERSION` if old codes would grow
  or sing differently.
- Tidings (src/tidings/core): data.ts (resources f/o/c/h/t, `TUNE`, 8 kinds of place with oil cost and notes, 8 companions,
  3 promises, 11 endings, `STARS`), cards.ts (~100 authored cards: `at` stop range, `where` kinds, `when` {flag, comp,
  promise, gap (default 2)}, `cb` callbacks dealt first, `must` (⚑ can't be passed; ≤ 1 a hand), `repeat`, `alts` tellings;
  choices are `ch(label, 'f+2 c-1', outcome, {need, join, set, clear, promise, breaks})` or `gam(label, odds, win, out, lose,
  out, {boost: [comp, +odds]})`; a gamble's `breaks` only applies when it's lost), run.ts. Map: rows 0 (Tarrow Bridge) …
  11 (Hollin), rows 1-10 two nodes of different kinds from the region (lowlands 0-3, hills 4-7, the Teeth 8-10). A stop
  deals 3 (`rngFor(seed, T_DEAL, stop)`: callbacks first, then weighted: matching `where` 4, anywhere 2, repeat 1,
  recruit cards (no `where`, stops 0-6) `TUNE.recruitW` 1.5 so every companion is offered ~50% of runs, must ×0.7); face
  2 (`P<h>.<c>`), then `M<k>` walks a leg: food 1 / 2 / 2 by region + `bandFood(n)` (+1 at `bandAt` 3 = a full band),
  oil by kind (heights 2; town/inn/river 0), heights and rivers −1 health, forest −1 trust; the last leg is free. Food,
  oil, health or trust at 0 ends it (coin can't go below 0: choices that cost more are blocked). At any time in a stop:
  `B` buys provisions at a village or inn (`canBuy`, once a stop, +2 food; rules v3 `buyPrice` = 2 + 1 per earlier buy in
  this region, `r.buys` = the stops bought at)
  and `L<compIndex>` parts with a companion (−1 trust, gone for good: `parted`, their recruit card never returns).
  `shortBy(r, k)` = per lethal resource, how much more the cheapest rest of the road needs beyond what you carry, + 1 (you
  must arrive with ≥ 1): the road buttons' "⚠ find 3 more 🍞, 1 more 🪔 to reach Hollin" and the dock line. A card whose
  `set` flags can no longer be `recallable` (no callback's stop + gap fits) deals at ×`TUNE.lateSetW` 0.3 and loses its
  "✦ may be remembered" tag. `Card.w` scales a card's deal weight (Rain 0.45 + a Hail telling; rules v4 trims the
  everywhere-cards: Hand in the Pack 0.4, Post Horn 0.35, Wedding Letter/Roof 0.5, Birthday/Letters/Night Visitors 0.6,
  …), so no card is dealt in more than ~80% of runs. `Run.recent` (newRun/replay's third argument) = cards dealt in the
  player's last 3 ordinary journeys (`profile.recent`), dealt at ×`TUNE.freshW` 0.25; saved with the run (`r`, card indices
  base 36) and in bug reports (`r=`, `?r=`); the daily uses none. `Cond.chance` = a seeded per-run roll (`T_CHANCE`): the
  Ring Thief comes in half the runs that carry the ring. Stop 10 has Bells, the Sledge Party and the Frozen Tarn beside the
  Switchback (0.6); companion stories have an alt telling each. The Moneylender's "can't pay" takes −3 🍞 −2 🪔 −1 🤝.
  The Hermit (stops 4-7, shrine/forest/river/inn, w 1.2: ~75% of runs) takes a practical answer (+2 🪔 now) or the other
  (+1 🤝, flag `hermit` → the Hermit's Word on the pass: soup worth +4). The
  Blizzard (⚑, stops 8-10, dealt in ~58-60% of runs that get there) is hinted, never promised: "❄ blizzard risk" on the
  strip, "may catch you … about half of crossings" on the route card/help, the Weatherwise Shepherd's "might be". Gambles roll
  `rngFor(seed, T_GAMBLE, stop, cardIndex)` against `oddsOf` (boosts, ≤ 95%); `act(r, a, force)` decides one for bots.
  Every card keeps a choice with no gate and no coin (test). Score at Hollin = f+o+h+t + ⌊c/2⌋ + 3/companion +
  5/promise kept. Endings by priority: thin (a resource ≤ 1), full (3 companions), beloved (trust ≥ 9), rich (coin ≥ 14),
  alone, plain; the ring kept adds wedding alongside (`End.also`, shown as "And: …" on the end card, journaled too; each
  ending gets its own NEW badge). `projectedScore(r)` = score minus each resource's cheapest remaining legs: the band
  row's "≈N ★★☆" chip (tap: breakdown, stars at 28/36, how to climb).
  The page records a finished journey once: key = mode (`r` / `d<day>`) + seed + `t` (when it began, saved with the run;
  0 for `?seed=` links) + actions, the last 40 kept in `recordedRuns`. The page is DOM: resource pills, a journey strip (SVG + emoji nodes, tap = route
  card with every leg's cost), hand rows (SVG landscape art per card from art.ts: sky by `sky`, ground by region, emoji
  figures), a focus card with choices (chips for every number, ☠ when it would empty a resource, odds and boosts,
  upkeep a recruit adds, promises, "✦ may be remembered"), a flip to the outcome, then the road buttons. Boosts always read
  "🏹 Ysolde: +30% (with you, counted)" / "(not with you)". Stops read "Stop N of 11" (Tarrow Bridge = setting out,
  Hollin = stop 11). Journal (`profile`: cards faced, companions met, endings) survives runs; cards are filed by type
  (companions, remembered, ⚑ trouble, everyday, encounters, Teeth-only), unfound endings show their `hint`. Reports
  `TIDINGS v… seed=… a=…`.
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
