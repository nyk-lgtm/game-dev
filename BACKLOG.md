# Game Lab backlog

Claude works through this list on its own, continuously, until the usage limit runs out (an hourly scheduled check-in
resumes it after a limit reset). The owner can add, reorder or strike items
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
- [ ] **Ninefold** (seeded mini-golf). Milestones:
  - [x] Core: corridor holes on a 6×9 grid, rails, posts, bumpers, sand, water (+1, replay the spot), slopes;
        240 Hz physics, exact replays, 8-stroke pick-up, formula par. Search bot sinks everything (noise-free
        it beats par by ~15, so par is for thumbs). 7 tests.
  - [x] UI: drag-anywhere slingshot aim with power arrow, playback with trail, bumper glow, splash, hole
        banners (Birdie! etc.), first-time tips per obstacle, scorecard, round card, daily, hub card.
  - [x] Sounds (src/ninefold/audio.ts) and windmills (rules v2: holes 4+, cross arms turning only while the
        ball rolls, same pose at every shot start, drawn turning on to that pose afterwards).
  - [x] Angled timber wedges in the outer corner of closed bends (rules v3).
  - [x] Blind playtest (agent: +6 and E over two rounds; no escapes or errors) and fixes (rules v4): pull
        length maps linearly to roll distance (power × MAX_ROLL 150 on open grass, `speedFor` inverts the
        friction law) and the aim shows a ring where the ball would stop; sand softer (70 + 1.3v) and at
        most half a lane wide; slopes 48 → 34; rail ends act 0.9 wide so grazing shots slip past corners;
        par counts obstacles on the route (+½ each, posts and mills too); picked-up holes dotted on the
        scorecard and the ball stays put; result line in the hint bar, longer banner; a toast when an
        update resets a round. Bot (NOISE=0.06) now median E.
  - [ ] Next: second playtest of the new aim; maybe bigger holes on screen (COLS 5?).
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
    median depth 8 → 7 (back on target), more of its runs end on depth 3. A bomb someone stands on
    is now drawn under them (a lit ring) with a "💣 n" fuse tag below, not a badge on top.
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
  - [x] Night 2, the fog (core/night2.ts): 8 places, 9 items, Bassett (trust: logbook, Nell, cocoa;
        forcing the hasp costs 2) and Nell (Bramble, gifts, a promise of the horn), Bramble guides on the
        moor, the hot-bulb engine heats 15 min, the fog shuts the moor at midnight (warned 18 min ahead;
        the wall always leads back). Best route sounds the horn at 12:36. Menu night picker, per-night
        saves/profile, fog sky.
  - [x] Night 2 blind playtest (2★, 2★, 3★, 1★ crowbar; clock tight but fair) and fixes (rules v2):
        "Tell him Nell's safe" counts like "missing", endings put Nell where she is, Bramble stays with
        Nell once found, Bassett reacts to the forced hasp, contradictions fixed, short text on repeat
        visits (both nights), people's lone actions keep the name, Go row pinned, "New" goes once started.

- [x] **Nightline fixes from its blind playtest** (agent reached the goal on run 3; no errors):
  steering ~120 px to full lock; HUD on backing panels, 11 px labels, brighter TIME UP; traffic drawn
  1:1; goals renamed "endings"; end screen shows stage progress; "SHARP LEFT · BRAKE" warning ~2 s
  before curves you can't hold at top speed (|curve| > 3.2); at a fork only x > 0.2 takes the hard
  road (the middle is gentle); start clock 65 → 70 s. Bot still finishes 10/10 left, 8/10 right.

## Ideas (unscheduled)
- Unspoken: more story templates so the village tale varies; (done: 🔊 speaks a word with the phone's
  voice, Italian when available); a harder "second village" with case markers or verb agreement.
- [x] Hub: shared Sound / Vibration switches (src/shared/settings.ts; audio never starts when off,
  navigator.vibrate becomes a no-op). Reduced effects done 2026-11-12: hub "Effects" switch (defaults to the
  phone's reduce-motion), `reducedFx()` gates shake (Telegraph, Glyphwright, Afterglow), Afterglow level flash,
  Hexhold hurt tint, Nightline streaks; html.reduced-fx makes CSS animations play once.
- Afterglow: owner is happy with it — leave alone unless they report something.
- Grove: owner wants it kept as is (no smaller board).

## Done (recent)
- Grove blind playtest (agent: 24,775, Spirit Tree, 209 turns; "too forgiving, too long") and fixes
  (rules v2): trapping pays 50 per wisp (×2 for 2+ at once); crystals 5% → 4.5%, bolts 6% → 4.5%,
  wisps 20% → 22% (bot: 276 → 248 turns, Spirit Tree 49/60 → 30/60); help says wisps never merge and
  what traps pay; brighter labels; empty stash is dashed and says so. Still long for one sitting —
  owner said keep the board as is (no smaller board).
- Lantern blind playtest (agent reached the Hollow at level 3) and fixes: a far/unexplored tap walks
  to the nearest reachable cell (pathToward) instead of refusing; a monster is announced once and
  later only stops a walk within 3 cells; Wait and shop actions say what happened (in the dialog);
  disabled options look disabled; help says walking into monsters attacks and rats are the safe
  first fights. Tried goblin def 1 → 0: completion bot fell 98% → 94%, reverted.
- Delve blind playtest (agent reached depth 2) and fixes (rules v4): floor 1 has 6 rooms not 9
  (bot floor-1 turns 199 → 155; win rate 58% → 52%, within noise); player marker cyan (stairs are amber);
  potions green (red is foes only); legend lists pillar and you; help explains swipe direction and
  doors; descending says how much HP it restores. Then: lit amber edges where the view's depth jumps
  (corners, side openings, corridor mouths) so turns stand out.
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
