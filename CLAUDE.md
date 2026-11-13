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
`simmer/` (cozy management sim: a night-market food stall for 20 nights, critter guests on a watchable evening).

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
  - Glyphwright: `npx vite-node scripts/glyph/balance.ts 100 smart,favor` (rules v3: smart bot ~37% wins, median wave 15;
    `favor` pushes it toward each caster). `scripts/glyph/probe.ts 2` ranks every caster × modifier build by real leaks
    with a per-caster best/top-10 line (`TWEAK='beam.dmg=17,MOD.pierceThrough=t'` tries numbers without editing rules).
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
  - Simmer: `npx vite-node scripts/simmer/balance.ts 100 [naive,lazy,lazyhelp,decent,clever,steady,cheap,premium,greedy,fame,hoard,builder,sweets,fishy,overstock,understock]`
    (bots plan from the forecast only, never the real crowd; rules v2, 100 seasons, stars 1200/2700/4000: naive (start menu,
    listed prices, 6 portions each, no shop) ~1880 = 1★ 100%; lazy (start menu, listed prices, Fill to forecast, no shop; the
    playtester's lazy run) ~2560, 2★ 10-19%; lazyhelp (lazy + a helper whenever the open warning says the stove is short)
    ~3210 = 2★ 100%; decent (menu lines kept full by expected orders, listed prices, Fill, helper when warned, recipes and
    upgrades by the page's payback lines) ~3650, 3★ 26-28%; clever (prices searched against the purses, renown valued,
    cheap-day stock-ups, payback shopping, helper when it pays) ~4140, 3★ 61-68%. Nothing single-minded beats clever (builder
    ~4030, fame ~3970, fishy ~3940, overstock ~3780, cheap ×0.8 ~3200, understock ~3170, greedy ~3010, steady (the v1 decent)
    ~2870, hoard ~2720, sweets ~1800, premium ×1.35 ~830). Clever ~1.2 s a season. `trace.ts <seed> [strat]` prints a season
    night by night, `upto.ts <seed> <nights> [strat]` gives `?seed=&a=`. Env RV/RD/COVER/PAD tune the clever bot, TUNE=k:v the rules.
  - Brink: `npx vite-node scripts/brink/selfplay.ts 40 [hard,hard normal,easy …]` (AI vs AI per pairing: wins, first-mover
    wins, plies, time per move, shove-backs a game and the longest run, repeated layouts (and "cheap" ones, re-searched
    exactly); rules v1, AI v4 (80 games Easy/Normal, 40 Hard): first mover 45% Easy, 49% Normal, ~42% Hard mirrors; Hard
    beats Normal 93%, Easy 100%; Normal beats Easy 81-89%; games 19-25 plies median; Hard ~160 ms/move (p90 ~190) on a
    laptop; shove-back runs ≤ 1-3, repeated layouts 0.1-0.3 a game. vite-node runs the search ~4x slower than the browser; for long probes bundle with esbuild and run node.
    `TUNE=crumbleStart:6,komi:1`, `W=threat:60`, `LV=normal.depth:3`, `SETUP=1` try other rules/weights/levels/starts.
  - Hexhold: `npx vite-node scripts/hexhold/balance.ts 32` (heuristic bot, rules v5: median wave ~27, ~7/32 wins);
    `scripts/hexhold/probe.ts 32` lists each loss with its wave and map shape (one or two portals) and the
    lives lost per band of waves (the difficulty curve: v5 is gentle to wave 10, steady pressure from 15 on,
    no spike at 27-30); `scripts/hexhold/waves.ts` shows wave sizes and the biggest pile of one kind.
  - Rewild: `npx vite-node scripts/rewild/balance.ts 16 greedy 1` (score, species, stars; compare
    with `random`; rules v6: greedy median ~2280 (32 games; random ~940), stars at 900/1700/2400, ~1/4 of bot games 3★),
    `scripts/rewild/upto.ts <seed> <n>` (a bot game's actions to season n, for `?seed=&a=`), `scripts/rewild/probe.ts` (plays and causes of death), `trace.ts <seed>`,
    `fire.ts 64 1 [random]` (per lightning summer: burns, the idle burn plan, whether the bot plays differently than in a
    drought, and the score vs the same game with lightning turned into drought; v6 greedy: something burns in ~29/64, mean −13).
- Delve rules v5 (src/delve/core/rules.ts): a sleeping monster spends the turn it notices you; cultists rest a turn
  (`cd`) after each firebolt; blocked hunters try another equally short step; `use` (HIT) hits ahead, then a front
  corner (`cornerFoe`), opens/shuts doors (never with a foe beside you or in the doorway), else "You swing at nothing"
  (no turn); `doorNoises` drives the "?" on doors; scrolls of seeing are carried (`player.scrolls`, action `read`, code `v`).
- ASCII games (Delve, Nightline) draw into a character `Grid` (src/shared/ascii.ts) painted
  with batched `fillText` runs; art lives in each game's `art.ts`.
- Daily challenges (src/shared/daily.ts): `<game>/?daily` plays today's seed (`dailySeed(game, day)`,
  local date); each game keeps its in-progress daily under `dailyRun` and today's best under `daily`.
  Wired for Afterglow, Rewild, Glyphwright, Delve, Nightline, Unspoken, Hexhold, Triad, Ninefold, Summit, Quarry, Sungrazer, Kitbag, Brink (a daily win-in-N puzzle), Loomsong (a daily song) and Simmer (a daily season); the hub's Daily section links them.
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
  (after grazing; rules v6): it catches in the nearest burnable cell within 3 of the strike (`NEAR3`) and leaps to burnable
  cells up to 2 away (`NEAR2`); burnable = grass/flowers/shrub at size ≥ 2 on moisture-0 ground, not cropped by a grazer
  this season (`cropped` in simulate); animals on burning cells die (bees/songbirds escape). The board draws the burn plan.
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
- Simmer (src/simmer/core, rules v2): `TUNE.days` (20) nights. data.ts: 6 ingredients (`marketPrice(seed, day, ing)`: cheap
  18% / usual / dear 20%; `keeps` nights counting the night bought: fish 1, greens/berries 2, mushrooms 3, rice/flour 6; the
  cool box adds 1, also to stock on hand, and cold dishes are worth ×1.15 with it: `NightCtx.cool`), 10 dishes (one unit of each listed ingredient, `base` worth, `cook` minutes, tags; 3
  known, the rest learned for coins), 8 critter kinds (`SPECIES`: loves/dislikes one tag, purse range, patience, arrival
  window, renown to unlock 0/0/0/10/20/35/55/80, weather likes, badgers eat two), weather drifting warm → chilly
  (`makeWeather`, 40% repeats), festivals (two seeded + the last night), paydays every 5th night, 5 upgrades and a 12¢
  helper per night (+1 stove). night.ts: `worthOf` = base × love 1.4 / dislike 0.6 × weather tag × festival sweets, rounded;
  `chooseFrom`: the most worth left over (worth − price) among dishes in stock, priced ≤ worth and ≤ purse, else why
  (soldout/pricey/worth/nolike); `simulate` is a minute-by-minute FIFO queue over the stoves (SERVE 2 + cook minutes per
  guest), walk-offs at their patience, closing at 240 (arrivals end at LAST_CALL 225). Delighted (`delights`) = a dish with
  the tag they love and ≥ 25% of its worth left; settling for a second choice or waiting > half their patience takes a step
  off. run.ts: renown 0-100 (`repChange`): + round(delighted × (100 − renown)%) − `lossFor(letdowns)` = ceil(let-downs / 2),
  at most `TUNE.lossCap` 5 a night (v1 took a full ♥ each: festival queues cost testers ♥18-25 a night); each delighted guest brings a friend next night (≤ 10); street crowd = (8 + 0.25·renown) × weather × festival 1.6
  × lanterns 1.2 × ±15%; stock is used oldest first and batches on their last night are thrown out (ledger `wasted`); under
  8¢ in the morning a neighbour gives 12¢ (`giftFor`). Score = coins + 10·renown; `STARS` 1200/2700/4000. forecast.ts:
  `forecast` (expected mix; never the real crowd) and `demand` (exact expectation over each kind's purses) feed the page's
  "~N orders", Fill to forecast (`fillNeed`, ×1.1) and the bots; `recipePreview` (orders tonight at the listed price, in
  place of the weakest dish when the board is full, who loves it), `upgradePayback` (¢ a night: profit diffs via `profitOf`,
  which drops orders past 85% of the stove minutes; bench from last night's walk-offs; cool box from chilled cold dishes +
  past waste) and `STOVE_WARN` (0.85) feed the shop cards, the open warning and the bots. Actions `b<ing>.<n>`, `l<dish>`, `u<k>`, `o[h]<dish>x<price>.…` (open
  the night; h = helper); `replay(seed, a)`. The morning is a draft (store `draft`) turned into actions on Open; recipes and
  upgrades apply at once, and this morning's (actions after the last `o`) can be undone by replaying without them. Open
  warns (one card) about short stock, a stove that can't keep up (with "Hire a helper and open") and prices below cost.
  Store `evening` = {seed, n} while a night plays, so a reload replays that evening; the ledger closes to the guest log
  (dock: Ledger / Night N ▶). UI: DOM morning (forecast with tappable crowd/kinds, menu with price steppers and who-orders sprites,
  pantry with spoil warnings, recipe/upgrade cards), canvas evening (scene.ts: original critter sprites, the red-panda keeper,
  weather; guests set off 16 sim minutes early so they reach the stall on time), a log and guest taps that spell out purse,
  worth factors and the reason, a ledger card per night, guest book (📖). `SIMMER v… seed=… a=…` reports.
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
