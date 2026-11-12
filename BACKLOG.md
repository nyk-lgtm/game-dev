# Game Lab backlog

Claude works through this list on its own, a chunk at a time (a scheduled check-in
resumes the work every couple of hours). The owner can add, reorder or strike items
at any time; their word beats this list.

## How each work session goes
1. Read this file and CLAUDE.md. Pick the top unfinished item (or finish one in progress).
2. Do one meaningful, shippable chunk. Big items are split into milestones below.
3. `npm test && npm run build`, check it on a Pixel 7 screenshot, add a hub NEWS line if the owner
   would notice it, push the work branch,
   deploy to `main` only when it's finished and verified live.
4. Update this file: tick what's done, add what you learned or found, note the next step.
5. Tell the owner in a few lines what changed and what to try. Only ask a question if
   it truly needs their decision.

Ground rules: never break saves without bumping RULES_VERSION; never leave main red;
keep every change touch-friendly at 390 px; prefer depth and polish over sprawl.

## Now
- [ ] **Hexhold** (hex maze tower defense). Milestones:
  - [x] Core (src/hexhold/core): 9x11 hex board, flow-field pathing (never sealed), 30
        seeded waves with themes, 6 towers each gifting its neighbors, 8 enemies (flyers,
        armored brutes, menders, splitters, Colossus every 10th), replay, bot + 10 tests.
        Bot (scripts/hexhold/balance.ts) wins ~20/32 maps; losses are single-wave collapses
        to brute/flyer/splitter themes a human would see coming in the wave preview.
        Not done yet: tunnelers, tower specializations at level 3.
  - [x] Render + UI: build with a path preview, upgrade/sell, wave preview with the notable
        threat explained, 1-3x speed, saves mid-wave, results with damage by tower.
  - [x] Hub card, daily map, CLAUDE.md notes. Shipped.
  - [x] Level-3 specializations: each tower picks one of two forms (Longbow/Repeater,
        Siege/Cluster, Glacier/Hail, Storm/Overload, Inferno/Napalm, Banner/Lighthouse).
  - [x] Blind playtest and its fixes (rules v2): board no longer resizes under panels, tap
        guard after building, close buttons, warning when a build makes the path slip past
        towers, per-tower damage, Beacon/Frost stats, lives cost on wave chips, Colossus
        warning, gentler early waves + late-game hp growth, beacon levels matter, saves at
        wave end, softer hurt tint. Bot now median wave 27-28, ~1/4 wins.
  - [x] Burrowers (from wave 12, a few per wave: dig the straight route under towers, can't be
        hit while under one; their route shows as brown dots) and two-portal maps (~1/3 of seeds,
        +60 start gold, enemies alternate portals in small groups). Rules v3.
        `scripts/hexhold/probe.ts` shows where the bot dies by map shape.
  - [x] Frost checked: not weak (bot without Frost: median wave 20, 0 wins; with one: 27, 8 wins).
        It looked useless only because its value is the slow and the +30% shatter its neighbors get;
        stats now credit that bonus to Frost (11% share) and the results show enemy-seconds chilled.
  - [ ] Next ideas: a second blind playtest once owner feedback comes in.
- [x] **Blind playtests** for Rewild, Glyphwright, Telegraph, and their bug/UX fixes (shipped).
- [ ] **Design follow-ups from those playtests** (balance; need care, not quick fixes):
  - [x] Glyphwright gold sink (rules v2): **Empower** raises a rune a tier for gold (4×/10× its
    base cost, dearer than merging), rerolls cost 1,1,2,2,3… within a wave. Smart bot uses
    Empower; win rate unchanged (~32-35%). Then: the dps estimate counts extra targets at half
    (a crowd), the spell card also shows dps on a single foe, and row names never truncate (tags
    moved to the dps line).
  - [x] Telegraph: depths 2-3 get +2 enemy budget (depth 1 stays the tutorial; rules v4). Greedy bot
    median depth 8 → 7 (back on target), more of its runs end on depth 3. Still open: bomb badge
    tucked onto the player's hex reads like a status effect.
  - [x] Rewild (rules v3): species alive 4 seasons in a row are **settled** and pay +3 each season;
    dying out restarts the streak, so keeping wolves and deer balanced beats replanting. Stars
    rescaled to 900/1700/2400 (greedy bot 0/0/13/3 vs 0/2/11/3 before). Report and species list show
    it. Then (rules v4): goal targets retuned from 32 bot games (oaks 1/8 → 4/8, ponds 2/10 → 4/10;
    soil/species made a bit harder); winter wildflowers are straw-gold with pale seed-heads.
    (Done: goals show ⚑ in the header, stars are only score stars.)
- [x] **Unspoken art follow-ups**: held things (take/give/carry) sit beside the holder instead of
      over their body; an acting river is drawn as the river flooding its banks, not a sea wave.
      `.shots/us-gal.cjs '<frames json>' name` renders any frames side by side (needs `npx vite --port 5174`).
- [ ] **Triad** (procedural logic puzzle). Fire burns leaf, leaf drinks water, water douses
      fire; a number counts the neighbors a hex beats. Milestones:
  - [x] Core: generator (unique, guess-free via single-clue deductions), hints from the same
        deductions, broken-clue check, 8 tests, `scripts/triad/stats.ts`.
  - [x] UI: hex board, element pad, notes, undo, hints (+30 s), timer, 3 sizes, daily, hub card.
  - [x] Blind playtest: an agent solved Small and Medium by reasoning alone, no hints needed
        ("genuinely good"). Fixes: hints name every clue that forces the hex, moves save at once,
        the clock includes hint penalties, filled numbered hexes keep a visible icon, finished
        numbers fade.
  - [x] Levels: Easy (80%+ numbered, keeps givens), Normal (unchanged), Hard (a normal puzzle
        stripped further while a few "what if" trials finish it: 1-6 small, 2-8 medium, 2-10 large).
        Hints explain what-ifs and write them into notes; hints honour notes that allow the answer.
  - [x] Guided tutorial: a hand-made 7-hex puzzle taught in 3 steps (TUTORIAL / TUTORIAL_STEPS in
        core/puzzle.ts); offered from the first help card, the menu, and after it a Small puzzle.
  - [ ] Next ideas (old list follows): difficulty tiers
        (keep more clues for easy, allow two-clue deductions for hard), a short interactive
        tutorial puzzle, a second clue type (e.g. "beaten by" counts or edge marks).
- [ ] **Last Light** (tap-driven interactive fiction). Milestones:
  - [x] Core (src/lastlight/core/story.ts): 8 places, 9 items, Tomas (trust, follows, carries) and
        Ada (keys, rescue, remembers being left), clock (3 min/action, midnight = 40), tide closes the
        shore at 25, rain soaks matches without the coat, a broken window's draught. Endings with
        1-3 stars (light, Ada, Tomas). Best route lights it at 11:42. 6 tests incl. random play.
  - [x] UI: story log, grouped choices (people, here, carrying, go), sky strip with the ship
        approaching and the beam, saves/replays, ending card, hub card.
  - [x] Blind playtest (agent: 0 stars night 1, stranded by the tide; 3 stars night 2) and fixes:
        tide warning 24 min ahead on cliff/shore/boathouse, flooded exits hidden, "Wait out the night"
        when stranded, stale texts fixed, Tomas hints he's frozen (tea), "Damp matches", make tea from
        the stove, endings say where everyone is, story scrolls fully.
  - [ ] Maybe a second night (a different story on the same engine).

## Ideas (unscheduled)
- Unspoken: more story templates so the village tale varies; spoken pronunciation via
  speech synthesis; a harder "second village" with case markers or verb agreement.
- Hub: one shared settings panel (sound, vibration, reduced effects) used by every game.
- Afterglow: owner is happy with it — leave alone unless they report something.

## Done (recent)
- Hub "What's new" panel (src/hub/news.ts), marks changes since the last visit.
- Hexhold credits Frost; CI stuck-queue workaround noted in CLAUDE.md.
- Glyphwright honest dps figures and untruncated spell names.
- Triad guided tutorial.
- Rewild settled-species bonus; Telegraph depths 2-3 harder.
- Last Light shipped (interactive story, three endings-stars).
- Triad difficulty levels (Easy/Normal/Hard with what-if hints).
- Unspoken art fixes (held objects, flooding river).
- Glyphwright Empower + rising reroll cost; Rewild goals mark.
- Triad shipped (new logic puzzle game with daily).
- Blind playtest fixes: Telegraph (abandon confirm, hurting moves need the red button,
  auto-walk on cleared floors, stacked labels), Glyphwright (Reroll redraw bug, stale battle bar,
  false merge banner, merge warnings, what leaked), Rewild (saves on deal and after the end,
  species ± fixed, header and info panel room). Shared cards show a scroll hint.
- Hexhold: burrowers and two-portal maps.
- Hexhold blind playtest fixes (see above).
- Hexhold shipped: maze tower defense with neighbor gifts, 30 waves, daily map.
- Unspoken blind playtest (agent finished all 5 places: language "clicked" in ~2 minutes) and
  fixes: toast was a giant blank pill blocking taps (shell CSS order), category tabs crushed
  in busy sheets, new language on every reload, "one reading is off" hint, mural backdrop
  only for past scenes, riddles only use adjectives the art can show. RULES_VERSION 2.
- Unspoken shipped, then the journal-style UI refresh.
- Polish passes on Rewild, Glyphwright, Delve, Nightline, Telegraph, Grove, Lantern.
- Afterglow: death recap, Nights 1-5, weapon unions, Monoliths arena, mines/spitters fixes.
- Daily challenges for six games on the hub.
