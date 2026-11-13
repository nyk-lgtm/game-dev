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

## Start here (summary, 2026-11-13)
19 games are live; every one has had at least two blind playtests and the fixes shipped. Open threads, in order:
1. Owner feedback first: anything the owner reports beats this list.
2. Loomsong: needs a real-phone check of sound and timing (headless has no audio); then a second playtest.
3. Third playtests where the last pass still found balance doubts: Summit (carry cap), Kitbag (Powder Keg/Lucky Coin,
   The House), Sungrazer (cinders after jittered grabs), Brink (can people beat Normal?), Quarry (late targets).
4. Hexhold gold sink (honing specialized towers) if hoarding persists; Glyphwright: refit the bot model (fit.ts),
   late Nova vs flyers; Delve: depth 5 ghouls; Rewild: is fire now too tame?
5. Grove: owner said keep it as is (board and balance); only bugs/clarity. Afterglow: leave alone unless asked.
6. New games are welcome when the queue is quiet (recent additions: Ninefold, Summit, Quarry, Sungrazer, Kitbag,
   Brink, Loomsong). Ideas: a creative/sandbox toy, a co-op-free social/daily puzzle, a cozy management sim.

## Now
- [ ] **Loomsong** (original rhythm game with procedurally generated music). Milestones:
  - [x] Core (src/loomsong/core, rules v1): seeded songs (key, mode, 90-140 BPM, verse/chorus progressions, a form
        sized to 90-120 s, drums with fills, bass, pads, chorus arpeggio, motif-based lead); charts from the song's own
        onsets per level (Easy ~1.2 notes/s with a few holds and flicks, Normal ~2.2 with chords, Hard ~3.7); judge with
        Perfect/Good windows, holds, flicks; plays recomputed from seed + level + events. 13 tests incl. a perfect bot
        (1,000,000) and live-vs-recompute agreement.
  - [x] UI: WebAudio synths scheduled on the audio clock, pointer timestamps mapped onto it; four warp threads, beads,
        yarn holds, chevron flicks, dashed chord threads, beat lines, shuttle bar with pads, bursts, popups, combo,
        live cloth; pause with a 3-2-1 count-in; results with grade (Silk…Frayed), stats, tapestry, "Shift timing";
        song menu (level, new / daily / recent songs, song codes and links, note speed, timing ±5 and calibration);
        calibration screen; first-visit help + calibration prompt; "needs sound" card (turn on / play silently);
        bug reports and `?seed=&lv=&a=`; hub card first + Daily link. Pixel 7 checked (headless: audio context runs).
  - [x] Blind playtest fixes (rules v2; visual timing was "excellent": tapping on sight gave 98-100% Perfect):
        calibration guide ring (optional), result card with delay/spread/taps and Keep/Retry, retry asked for
        negative, > 300 ms or wide results, overlay guarded against late taps (that is how −119 ms got saved),
        prompt re-offered each visit with a menu dot until calibrated or "Don't ask again"; offset clamped −50..300;
        "shift the sound" explained, not re-offered when the last shift didn't move the error, fixed-height box;
        ~2 s outro with a fade and "Woven…" before results; bigger judgement words, grey struck MISS, "DROPPED" only
        for holds you held, combo in the HUD; copy feedback on the buttons (no stacked toasts); one judgement per note
        (counts match the menu); the menu song persists; Good 0.75 and grade lines 950/880/760/600k (Good FC = B).
  - [ ] Next: owner playtest on the phone. Watch: is the default timing guess close before calibrating, is
        calibration steady (spread), do the charts feel on the music (especially Hard's kick/lead chords), are flicks
        detected reliably, are songs varied enough (forms, grooves, lead tones), is ~1.2 notes/s right for Easy.
- [ ] **Brink** (original two-player abstract: sumo on a crumbling hex island, vs an AI, plus puzzles). Milestones:
  - [x] Rules design by self-play (src/brink/core, rules v1): 37-tile hex island, six stones a side in a V two rows
        apart; step one tile, or shove the line in front if it is at most two stones (either colour; three won't
        budge); off the edge or into a hole = gone; from ply 6 one tile falls after every ply (seeded order, rim first,
        mirror pairs, shown as cracks), taking any stone on it; three lost loses. Tried and dropped: a rim wedge start
        with crumbling from ply 14 (both AIs shuffle for 14 plies; Hard mirror first mover 80%), a scrum start in contact
        (first mover 97%), "the tile you leave crumbles" (second player forced win at Normal), sliding stones (first
        mover wins in 5 plies). A komi lever (`TUNE.komi`: each pair's first tile falls on the starter's side) moves the
        first-mover rate ~-15 points; unused because the V start is already balanced.
  - [x] AI (ai.ts): negamax alpha-beta, TT, killers/history, knock-off quiescence, iterative deepening with a node cap
        (deterministic). Eval: stones ×1000, worst-line distance to the void, ring, doomed tiles, knock threats, braces.
        Easy depth 2 + seeded noise (160), Normal depth 3 / 8k nodes, Hard depth ≤12 / 90k nodes. Self-play (40 games
        each, scripts/brink/selfplay.ts): first mover 58% (Easy and Normal mirrors), 43% (Hard mirror); Hard–Normal
        63%, Hard–Easy 100%, Normal–Easy 95%; median 24 / 29 / 28 plies; Hard ~130 ms per move (p90 150, max 290) on a
        laptop in node, so ~0.5 s on a phone.
  - [x] Puzzles: exact `winningMoves` (AND-OR) search; five hand-made lessons (Shove, Two in a row, Holes, Crumble,
        Brace = win in 2), each with one winning move (tested); 400 daily puzzles (137 win-in-2, 263 win-in-3) from 875
        self-play games, each exactly N with a single winning first move (all 400 verified once, every 10th in tests).
  - [x] UI: canvas island with cliffs, cracks (1-3 plies), pulsing red next tile, stones slide / go over and drop /
        tiles fall away, shake (off with reduced effects), dots and arrows on selection (red = knocks a coral stone off,
        purple = your own), danger rings, last-move trail, drag or tap, hint (gold arrow), undo, AI "thinking" line,
        result card with won–lost per level and "Try Normal/Hard", new-game card (level, who starts: you / AI / take
        turns), puzzles card, help card with a shove diagram, synth sounds, bug report, `?daily`, hub card + Daily link.
        Pixel 7 checked: help, selection, mid-game, lesson, daily, result, new game.
  - [x] Blind playtest (lessons and daily first try; Easy 3-1 won / 2-3 lost; Normal lost 0-3, 1-3, 0-3; Hard lost
        2-3; "short and tactically rich") and fixes (AI v2, rules unchanged, replays unchanged): shoves with your own
        stone in front were unplayable (the press re-selected that stone) → a tap on any arrow target plays it; tiles
        falling next carry 1/2/3 badges, cracks scale with the order, a dashed ring marks a stone on one; targets turn
        red/purple when a falling tile takes a stone (Crumble lesson arrow is red); "Into the hole!", "Three in a row
        won't budge", trails for shoved stones, status cleared between games and fixed at one line (no board jump);
        Brace lesson defence moves the cornered stone. AI: side-aware doom penalties 6 plies ahead, edge exposure
        weighted by enemy distance, mobility; root `loopPenalty` against shove-backs (4.0-4.5 → 0.4-1.8 a game);
        Normal depth 3 → 2 (odd depth skewed mirror games: 23% first-mover wins at depth 3 with the new eval), Hard
        90k → 70k nodes. Self-play (80 games): Hard–Normal 63% → 80%, Hard–Easy 100%, Normal–Easy 95% → 90%; first
        mover Easy 39%, Normal 63%, Hard ~40% (was 58/58/43). Hard ~130-155 ms a move (p90 ~200) on a laptop.
        The daily pool was generated with the v1 Normal (still verified exact; regenerating would change it).
  - [x] Second blind pass (lost all four: Normal 1-3, 1-3, Hard 2-3, 2-3; badges and rings "clear") and fixes (AI v3,
        rules and replays unchanged): shove-back cycles survived the root penalty because the player's shove-back was
        forced → the search now taxes recreating any stone layout (stones + side to move, holes ignored, `stoneKey`)
        from the last 8 plies, at every depth, for the searching side (`W.repeat` 300); Normal gets Easy-style seeded
        noise (60) so it is a real middle step; red outlines on your stones the AI can shove off next; "The AI
        stepped"; the daily says "Win in N now" after a move; crumble countdowns all count moves of either side
        ("Tiles start falling in 7 moves", "First tile falls after the AI's reply", badges 1/2/3, help "after move 7").
        Self-play: Hard–Normal 80% → 90%, Normal–Easy 90% → 86%, Hard–Easy 100%; first mover Easy 50%, Normal 56%, Hard
        33%/50% on two seed sets (≈42%); shove-backs 0.4-1.1 a game with the longest run 1-3 (players saw 5-7).
  - [ ] Next: owner playtest. Watch: can a person now beat Normal? Is Hard's ~42% first-mover rate a side bias for
        people? Do the red threat outlines make the game too easy to read?
- [ ] **Kitbag** (dice-placement roguelite: roll dice, slot them into gear cards, 12 floors to The House). Milestones:
  - [x] Core (src/kitbag/core, rules v1): 19 gear cards with conditioned slots (any / even / odd / ≤2 / ≤3 / 2+ / 4+ /
        5+ / 6 / pair / any two) and effects (deal, pierce, block, spike, heal, poison, reroll, split, flip, +1/+2,
        stun, powder keg fuse), each with a "+" upgrade; 6 dice kinds (d6, d8, weighted, even, pebble, chance) and
        honing; 17 enemies + 3 elites + The House boss with telegraphed intent cycles (attack, multi-hit, block, hex,
        wither, poison, heal, strength, wind-up); 12-floor two-path map with campfires and shrines; rewards one of
        three (elites two picks), kit of 6, 5 dice. Undo within a turn, replay from seed + actions, 19 tests.
  - [x] Bot (scripts/kitbag/bot.ts): searches every way to spend the turn's dice (rerolls valued as an average roll,
        no peeking), scores damage vs the telegraphed hit, kills, poison, stuns; plays the first step and replans.
        500 runs: first two fights 100%, median floor 12, 25% wins (23% on SEED=9000), median 32 turns; losses: The
        House ~45% of runs, stage-3 entry (floors 9-10) ~20%, Iron Warden elite ~4%.
  - [x] UI: enemy portrait + HP/block/poison/strength tags + intent box (tap for words; tap the portrait for its whole
        cycle), gear grid with dashed slots that glow when the held die fits and show the exact result (Deal 7, Block
        5, Finishes it!, Pair of 4s: deal 14…), drag with a ghost die or tap-tap, roll tumble and fresh-die pop (off
        with reduced effects), hit shake, enemy lunge, floating numbers, red flash, haptics, synth sounds (rattle,
        seat click, thud, clank, boom), map card, reward/campfire/shrine cards with a replace-which flow, end card
        with stats, help, menu (kit, map, bug report), daily (`?daily`), hub card first + Daily link. Pixel 7 checked
        (help, map, fight, preview with a pair slot, drag, reward, end) and a tap-only playthrough without errors.
  - [x] Blind playtest (won run 1 with 15 HP in 35 turns / ~12 min; died floor 9 to the Mimic; daily died at The House;
        drag and previews "excellent") and fixes (rules v2): rolls repeated across fights (`mixSeed(floor, turn)`
        collided along floor + turn, so a fight opened with the last fight's next roll) → `rngFor` hashes every part;
        "you take X" counts poison and turns red "LETHAL" (tag, info line, End-turn confirm); a die in the wrong slot
        says what it needs ("needs 3 or less"); the map says the pick is free each floor and elites sit ≥ 3 floors
        apart; Salve ≤3 (heal past full HP blocks), Whetstone +2 (up: twice a turn), Buckler X+1 (up X+3); dice
        rewards only while the gear can spend another die (and say how many it can); bone dice named in help; the
        enemy's lingering block explained the first time; a pending "replace which?" survives a reload; used dice
        leave a gap in the tray; a bigger enemy panel with the intent in words. Enemies +5% HP on floors 5+, The House
        168. Bot (1000 + 500 runs): ~22% wins, first fights 100%.
  - [x] Second blind pass (lost to The House at 44/168, to the Mimic on floor 10, daily to the Iron Warden on floor 5;
        "fast and readable, good tension"; every death one big hit) and fixes (rules v3): enemies grow through each
        stage (+8% HP / +5% damage a floor), fights never open on a wind-up or its blow (Grave Knight's 24 or the
        Wyvern's 32 on turn 1), the map shows each foe's HP and biggest blow (💥) with its own icon (elites get a crown
        badge); block raised while the enemy winds up carries over to the blow (brace), with a hint; the info line
        nudges "a die could still block N"; never a heal at full HP; the boss name wraps; "The House awaits" on
        floor 12; score counts depth (40·floor per floor done), so a deeper run outscores a shallower one. The House
        176. Bot (1,500 runs): ~23% wins, first two fights 100%, deaths spread out (House 39%).
  - [x] Third blind pass (all three runs died to The House on its wind-up blow, 22-87 HP left on it; brace and map
        threat "genuinely useful") and fixes (rules v4): The House plays one of three scripts per seed (High Roller,
        Card Sharp, Pit Boss; blows 30 instead of 36, named on the map); 💥 on the map counts the enemy's own buffs,
        one style plus a legend; 5 points per HP taken off The House; rewards don't repeat gear or upgrades from the
        last two rewards or offer a third copy, rare cards come twice as often (Powder Keg), and a second block card
        is offered from floor 6; the enemy-block note is shorter and the info line scrolls; a lone last gear card
        spans the row. Bot (1,000 + 500 runs): before 24% / 22% (House killed 39% of runs, won 38% of its fights),
        after 28% / 24% (House kills 36%, wins ~57%; per script 40-49%).
  - [ ] Next: owner playtest. Watch: does The House feel fair now? Is the brace rule clear? Are Powder Keg and the
        Lucky Coin too strong? Do the tiny `≤3`/`pair` labels read at arm's length?
- [ ] **Sungrazer** (one-thumb arcade: hold to swing a comet round a star, let go to fling). Milestones:
  - [x] Core (src/sungrazer/core, rules v1): fixed 240 Hz sim, lazily grown seeded sky (spine stars ≤ 40 apart,
        bonus stars, motes, cinders from altitude 450, pulsars 1000, giants and drifting cinders 1700, sparser past
        2500), tether that reels in, ballistic flight, wall bounces, rising void; points for altitude, links ×combo,
        corona grazing, sungrazes and close shaves (only those two raise the combo). Runs replay from seed + mode +
        toggle ticks. Modes: Swift (score 2,500), Tight orbit (5,000), Meteor shower (8,000). 12 tests.
  - [x] Bot (scripts/sungrazer/bot.ts): reaction delay, timing jitter, a release planner that flies every candidate
        out and looks one orbit further. 30 runs each: novice median 17 s (alt 320), human 40 s (alt 620, score
        ~2,400), good 126 s (alt 2,400, score ~9,800, p90 163 s), perfect alive at the 10-minute cap on half the seeds.
        Tuned so a first run is ~30-60 s and a good one 2-3 minutes.
  - [x] UI: canvas sky tinted per zone, coronas, target ring (and a faint ring for the star coming into reach),
        tether + dotted release preview, tail, sparks, floaters, zone banners, void glow, combo clock ring,
        shake/flash (off with reduced effects), synth sounds incl. a corona sizzle, haptics; first-run help card
        with a diagram and coach lines; end card with stats, unlocks and mode chips; replays (last run, best run,
        bug-report links), daily sky, hub card first + Daily link. Pixel 7 screenshots checked.
  - [x] Blind playtest (27 runs by a ~200 ms screenshot bot: first runs 77-102, best 5,172; "good juice") and fixes
        (rules v2): ~70% of deaths were free-flight flings into the next star, so the path preview (and a free-flight
        check) turns red with an ✕ on a collision course, those deaths say "Flew into a star", and spine stars are
        never stacked in a column; friendlier opening (void rises from 0.6 u/s, lighter gravity and faster orbits
        early, tighter early gaps); close shaves count from 4.5 units (was 2.6) with a green shave ring that lights
        up, explained in help; the first star is ringed and the coach line only mentions a ring when there is one;
        zone banners are a slim strip under the HUD for 1.8 s; popups and pills stay on screen and stack; the end
        card comes back after "Watch replay"; Sound on/off in the menu; slightly fewer, smaller cinders.
        Bot (40 runs): novice 18 s, human 48 s (alt 715), good 95 s (alt 1,800).
  - [x] Second blind pass (28 runs: best 1,897; 13 of the last 20 deaths flew into a star, 8 runs died in the first
        1-4 s on the long first swing) and fixes (rules v3): grabbing a star you're about to hit catches you at the
        edge of its corona (`safeRadius`), and a coach line says so in early runs; the release line turns amber when
        letting go up to 0.25 s later would hit; the first tether is at most 18 long (LOCK by altitude 250), the
        start is slower (orbit speed 56) and the second star sits ≥ 24 to the side; coach pills moved to the strip
        under the HUD; ☰ hidden while a card is open; close shaves from 5.5 (cinders 6.5), cinders hit at 75% of their
        drawn size; sungrazes count from 3 units (were 2.2); unlocks at 4,000 / 9,000 / 15,000. Bot (40 runs): novice
        22 s, human ~50-70 s, good 117 s (p75 158 s).
  - [ ] Next: owner playtest. Watch: is the opening friendly enough now? Are pulsars readable? Is the release preview
        too generous? Good-bot deaths are mostly cinders brushed right after a grab: maybe fewer cinders near stars.
- [ ] **Quarry** (word roguelite on a hex letter wall). Milestones:
  - [x] Dictionary: SCOWL sizes 10-50 (npm `wordlist-english`, MIT; SCOWL's own permissive licence), 3-8 letters
        a-z with a vowel, minus `badwords-list` (MIT), `naughty-words` en (CC-BY-4.0) and a hand list of slurs, with
        a short allow-list (pawn, escort, balls…). 34,315 words (24,597 common = SCOWL ≤ 35), front-coded into
        src/quarry/core/words.ts (103 KB, 46 KB gzipped), its own lazy chunk. `scripts/quarry/build-words.ts` rebuilds it.
  - [x] Core: 6×7 flat-top hex face, gravity per column, seeded bag (vowel balance, rare-letter caps, Qu tile),
        letter values × (length − 2), gold ×2, rocks/granite that crack beside words, fuses (depth 3+: use within 3
        words to blast neighbours for points, else they blow and cost a word), free reshuffle if no word is left,
        1 shake per depth, 8 depths (targets 90…340 in 7,7,6… words), spare words pay, 13 perks one-of-three.
        Replay from seed + actions, 16 tests.
  - [x] Bots (scripts/quarry/bot.ts): `human` spots 8% of the common words ≤ 6 letters (a fixed hash per turn):
        300 runs median depth 6, 28% wins, ~28 words/run (~8-10 minutes for a person); SEEN=0.05 6% wins;
        `best` (every common word) wins 100% with a median word of 88. Targets are tuned on `human`.
  - [x] UI: drag trail with live word, score and goal-bar preview, green/amber tiles, miss shake, tiles lift away and
        fall in (WAAPI), blasts and crumbling rocks, sounds, depth banner, perk card, end card with depth strip and
        best/longest word, help, menu, bug report, daily (`?daily`), hub card first + Daily link. Pixel 7 checked
        (touch drag via CDP touch events works).
  - [x] Blind playtest (agent: won 3,157 with Chisel/Gold Rush/Prospector/Opening Strike, lost on depth 5 with Long
        Haul/Hot Seam/Echo/Wild Stone; dragging precise, no errors) and fixes (rules v2): word multipliers add
        (two golds + Opening Strike +2 = ×5; Echo, Chisel and Prospector stack the same way, never multiplied together), Prospector is +1 multiplier per letter worth 4+ (◆ on tiles), Long Haul +1 per
        letter past four, Hot Seam (5+ letters) +1/+2/+3, Echo any repeated letter, Chisel/Opening +2, Stonebreaker
        rocks 10 (was 20), Demolition an extra fuse, Pickaxe twice, Wild Stone two blanks; granite from depth 5;
        targets 90…475 (late depths steeper). Perk bar folds into "+n"; one-line breakdown chips naming every
        modifier; the last word shown big; help explains the multipliers, granite and the spare-word bonus; fuses
        avoid cramped spots. Bot (300 runs): v1 28% wins / median depth 6 → v2 32% / 7; weakest perks 17%;
        favoring any single perk 18-33% (v1 the perk mattered far more: Hot Seam alone 69% under the additive
        draft before its nerf).
  - [x] Second blind playtest (agent won both runs, 3,095 and 2,721; "scoring fully predictable", "targets fair")
        and fixes (rules v3): score chips wrap to up to three rows that fit 360 px; the multiplier chip spells the
        sum ("×6 = 1 + gold + Echo + Prospector + 2 Opening"); a "granite cracked" chip; POOF and other informal
        words (yay, phew, yikes, oof, nah…) added; shakes keep gold and fuses (checked: core and DOM both keep
        them) and say so; a new fuse waits 2 words after one is used or blows (Demolition skips the wait); Chisel
        +2 on 3-letter / +1 on 4-letter words; Prospector +1 per word (was +1 per rare letter); utility perks
        got teeth: Tremor gilds a tile per shake, Pickaxe's replacement tile is gold, Wild Stone's blanks are gold.
        Bot (300 runs, targets unchanged): smart picks 45% wins / median depth 8 (perk order re-ranked from the
        table), weakest picks 22% / 6, SEEN=0.05 20%, per-perk table 19-36%.
  - [x] Third blind playtest (won 2,652 and 3,025; "chips excellent") and fixes (rules v4): blasts ×2 letter values
        (Demolition ×3, was ×6), capped at 40 a word, with a "blast 4 tiles +12" chip; at most 6 rocks on a face (late
        faces had 8-9) and 6/7/8 rocks → 5/5/6 at the start of depths 6-8; 7 words at depths 6-8 (targets unchanged);
        Wild Stone: one of its two blanks is gold; the "+n perks" button now measures after the pickaxe button
        appears (it used to be clipped off the bar, so the tester never saw it) and is labelled; MOWN, HEWN, SHORN, SAWN;
        Hot Seam text says a new depth resets it; the end card's longest word is the best-scoring of the longest; depth
        banners sit over the word box (never the face) and vanish when you start tracing. Bot (300 runs): smart picks
        40% → 44% (median depth 8), weakest picks 16% → 25%, Demolition-first 21%, SEEN=0.05 14%.
  - [ ] Next: owner playtest. Watch: are 7-8 letter words findable on a phone? Do fuses feel fair? A hint button?
- [ ] **Summit** (peaks-solitaire roguelite). Milestones:
  - [x] Core (src/summit/core): 8 floors of hand-drawn peak layouts (3 rows of 16-18 cards, then 4 rows of
        20-24, then 24-27 in 4-5 rows), more face-down cards per floor (0 → 100% of covered cards), a run-wide
        draw supply (each floor adds 40, 20, 12, 10, 8, 6, 4, 3; unused draws carry), streaks 10·n, 13 charms
        (Joker, Deep Pockets, Rewind, Spyglass, Flush, Mirror, Blasting Cap, High Stakes, Lantern, Second Wind,
        Long Stride, Peak Flags, Momentum), replay, 23 tests. Per-deal draws were far too swingy (a 16-card deal
        with 34 draws still failed 6%), hence the carried supply. Long Stride first won every bot run that took it;
        now each stride play burns a draw.
  - [x] Bot (scripts/summit/bot.ts: plays the first card of its best visible chain, values reveals, blasts when
        stuck): 1000 runs: floor 1 98%, floor 2 95%, median floor 5, 19% win (16-17% on other seed ranges),
        median score ~3,100. It never uses Rewind/Spyglass/Lantern well, so those look weak in its numbers.
  - [x] UI: DOM cards with gold edge on playable ones, fly-to-waste, streak meter, floating points, shake +
        hint on a wrong tap, spyglass peek, undo/blast tools, End run when cornered, charm pick card, end card
        with the climb strip, help, menu with charms, bug report, daily (`?daily`), hub card first + Daily link.
  - [x] Blind playtest (floors 3, 8 (lost on the last card), 5, 3; "planning a 7-9 card chain is the best part")
        and fixes (rules v2): draws 40,20,12,10,8,6,4,3 → 34,13,9,8,9,8,8,7; piles never deal two of a rank
        back to back, and the 3rd plays-free draw in a row always fits if the pile has a fitting card ("lucky
        draw"); Mirror 2 / Long Stride 3 plays per deal (were unlimited) with their own edge colours (violet =,
        blue ↷), named in the hint line, charges on the charm chips; Stride says "discards the top card of the
        pile"; High Stakes −2 → −1 draw; Lantern now +1 draw instead of −1; Second Wind 6 → 12 draws and it now
        fires even with an undo or blast left (it never did); Flush counts cards of one suit played in a row
        (was: plays onto the same suit); peak tops marked 🚩 with Peak Flags; points float above the charms, not
        over the hint line; floor banner hides once the streak meter shows; out-of-moves text names only what
        you own; End-run confirm has End first. Bot (1000 runs): floor 1 98%, floor 2 95%, median floor 5,
        14% wins (was 19%). Charms compared with `CHARM=` (each run starts holding it; 15% with none): Flags 46%,
        Pockets 42%, Mirror 39% (was 79%), Joker/Blast 37%, Lantern/Momentum 31%, Wind 27%, Stride 25% (was 80%),
        Flush 19%, Spyglass 17%, Rewind 16%, Stakes 7% (the bot can't use info or undos, so those read low).
        Peak Flags is the bot's strongest but felt weak to the tester; kept at 1 draw per peak, now marked.
  - [x] Second blind playtest (floors 4, 4, 7; "crisp", floors 5-7 "tense in a good way", lucky draw "fair")
        and fixes (rules v3): draws 34,13,9,8,9,8,8,7 → 34,14,11,11,10,9,8,8 with at most 15 unused draws
        carried (floor 4 was a cliff after big banks from floors 1-2); a draw never repeats the waste's rank
        (a 3♣ then 3♥ slipped through refunds/swaps); the lucky draw prefers a plain card over the Joker and
        says "No card left in the pile fits" when it can't fire; Spyglass shows the real next draws
        (`nextDraws` simulates the rules); undo keeps seen cards face up (Rewind could peek); texts fixed
        (Peak Flags gives 1 draw — at 2 the bot wins 61%, far above every other charm, so it stays 1; Mirror
        "twice per deal"; Stride "three times"; help on the lucky draw and the carry cap); the end card can't
        be dismissed by tapping beside it (☰ left a dead board), and menu/help "Back" return to a pending end
        or charm card; Rewind chip lost its duplicate count; the charm card splits floor draws into base +
        charms. Bot (1000 runs, two seed ranges): floor 1 98%, floor 2 93-95%, median floor 5, 14-17% wins;
        floor-4 losses 219 → 158-181 per 1000. 34 tests.
  - [x] Third blind pass (floors 2, 2, 3, then a 9,330 win; carry cap "fair", High Stakes "a score engine") and
        fixes (rules v4): dead floors (one 10 left, no 9/J in 15 draws) can't happen any more: the lucky draw
        falls back to the undealt rest of the deck, and `hopeless` (exact) ends a floor when nothing can ever fit;
        Spyglass marks lucky draws ✨ and edges only cards that fit an open card; the pile shows "✨ in 2/next";
        "Streak ended" and the fit hint show together; draws 34,14,11,11,10,9,8,8 → 28,16,9,9,8,8,7,7 (floor 1
        was loose, floor 2 a cliff); Long Stride twice per deal and it keeps the top card when that card fits
        something (was: 3 per deal, always discards; bot 27% → 43% with it). Bot (1000 runs, two seed sets):
        floor 1 100%, floor 2 98%, median floor 5, 14-15% wins. 35 tests.
  - [ ] Next: fourth playtest. Watch: does the deep lucky draw make late floors too soft for people; Spyglass's
        ✨ reading; High Stakes as a score charm.
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
  - [x] Holes keep to a 4-column band (taller, ~25% bigger on screen); par fitted to the bot with wobble
        (round(0.335·len + 0.284·obstacles + 0.1·turns), 2-5); bot NOISE=0.06 median −2 (rules v5).
  - [x] Second playtest (agent: ring "stops within ~5px", +11 with every lost stroke on windmill holes) and
        fixes (rules v6): windmills are single bars (arm 4.2, room at the walls) turning on a running hole
        clock; a putt records the tick (`angle.power.tick`), so you can watch and time it; a ball never
        rests inside a bar's reach (the bar flings it out); no water next to a windmill; hint bar fixed
        height (the course no longer shifts mid-drag); shorter minimum putt.
  - [x] Third playtest (−8/−4/−6 vs par: preview "too generous") and fixes (rules v7): preview shows ≤ 0.75 s
        of the roll up to the first knock and never whether it drops; SINK_SPEED 75 → 55, cup pull 90 → 60 within
        1.5·CUP_R; windmill arm 4.2 → 5.0 (no wall lane); power curve p^1.25; bogey punctuation; daily plays count.
  - [x] Aim preview runs the real physics (as the putt will be saved, windmill clock included) and draws
        the path to the first knock (a spark there) or a ring where the ball stops; slopes and sand show.
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
  - [x] Second blind playtest and fixes (rules v4): a build that moves the path away from towers
        shows a red alert, circles those towers on the board and needs a second tap ("Build anyway");
        build sheet shows damage/rate/range per tower (2 columns), build preview shows the tower's
        numbers on that cell; level-3 Sell sits beside the spec cards (fits 390×740); short "Gets:"
        gifts; Beacon panel/upgrade show the real +%; no leftover disabled spec button; results say
        "Held N of 30 waves" and "New best!"; Frost/Glacier both say "% slower"; burrower route is
        blue diamonds on a line. Balance: waves 1-4 budget ×0.7/0.8/0.9/0.95, start gold 210, Brute
        hp 190, first Colossus 80% hp, HP_GROWTH 0.098 plus 7%/wave from wave 11 (was 3.5% from 14);
        Mortar 30 dmg/2.0s (Siege ×1.7), Tesla 17/1.2s. Bot: median 27 → 28, wins 8 → 7/32; lives
        lost by waves (probe.ts) 1-3/4-7/8-10: 5/73/143 → 0/43/26, 15-25: 117 → 166, 26-30: 185 → 267.
  - [x] Third blind pass (two wins with 9 and 8 lives; coasted 11-26 with 800-2,000 gold, then mass-Brute
        spikes at 27-30) and fixes (rules v5): no kind but runners/grunts may take over 45% of a wave's
        budget (Mites 29%), so themes are mixes (max Brutes at wave 29: 33 → 17, Mites 345 → ~130; wave-4
        Mites 40 → 15, wave 6 60 → 20); late hp growth 10%/wave from wave 11 but only for 13 waves (more pressure 15-24, no
        extra climb 25-30); interest capped at 15 (was 25); Tesla range 2.6, Flame 22 dmg range 1.5, Bolt
        0.75 s. Bypass confirm is one tap on the red "Build anyway" (200 ms double-tap guard), "The path now
        avoids N towers"; towers out of reach of every path are dimmed with a badge and warned in the panel;
        "hits flyers thanks to the Bolt" / "ground only"; spec cards show numbers ("→ 51 dmg ×6 / 1.2s"),
        need two taps, Sell moved to the title row; banners expire in the frame loop and clear on a new map;
        "Wave 27 held · +gold · −10♥"; the preview explains the kind with the biggest share of the wave and
        what −2♥ means (help too). Bot: median 27, 7/32 wins; lives lost by band 15-20/21-25/26-30:
        76/90/267 → 83/171/210. `scripts/hexhold/waves.ts` shows wave sizes and the biggest piles per kind.
  - [ ] Next ideas: a gold sink if players still hoard (e.g. honing specialized towers); owner feedback.
- [x] **Blind playtests** for Rewild, Glyphwright, Telegraph, and their bug/UX fixes (shipped).
- [ ] **Design follow-ups from those playtests** (balance; need care, not quick fixes):
  - [x] Glyphwright gold sink (rules v2): **Empower** raises a rune a tier for gold (4×/10× its
    base cost, dearer than merging), rerolls cost 1,1,2,2,3… within a wave. Smart bot uses
    Empower; win rate unchanged (~32-35%). Then: the dps estimate counts extra targets at half
    (a crowd), the spell card also shows dps on a single foe, and row names never truncate (tags
    moved to the dps line).
  - [x] Glyphwright second blind playtest (rules v3). Fire's burn is a fraction of the finished hit, so
    Fire/Split/Heavy order no longer matters (Bolt III+Fire II+Haste+Split II was 299 vs 207 dps by
    order) and split bolts share the burn; the dps estimate counts a burn once per foe (renewed, not
    stacked; echoes add none) and the spell card gives its share and "~N against Drakes" when they
    can't burn. Casters: Beam 11→17 dmg, 2.3→2.2s; Rain 9→11, 2.4→2.2s; Orb 12→14; Nova 27→30;
    Pierce +10% dmg (was 15%) and passes t foes (was 1+t). Bounty paid ≤ 6 + wave/2 (Gild extra
    uncapped). Merges only take sets that include the rune an action placed; one that would empty a
    loom slot asks first (Merge / Keep them apart / Cancel; `k` suffix on B/M/E). Second tap
    deselects a shop rune; tier I/II/III stats in the tip, ★ line and Runes page; Frost shows
    "+X% longer in range"; names list both elements (last = the hits'); banner/end screen say what
    got through ("2 Drakes (−6)"); 44+ px tip buttons; shared cards close on a backdrop tap via
    pointer events and only hint "scroll for more" when real content is hidden. Bot (100 seeds):
    smart 41% → 37%; primary caster bolt/beam/nova/rain/orb 63/0/31/1/5 → 12/4/56/27/1; favor runs
    bolt 32→46, beam 36→43, nova 28→24, rain 42→35, orb 39→36%. probe.ts tier 2 (best/top-10 leak):
    bolt 42/58, beam 120/138, nova 55/64, rain 99/107, orb 67/74 → 54/73, 49/60, 54/62, 53/68,
    46/53; tier 3/2 waves 12,14: bolt 0/1, beam 97/112, nova 66/79, rain 67/76, orb 9/16 → 0/5,
    3/13, 61/75, 12/25, 0/3 (late Nova lags: it can't hit the flyers).
  - [ ] Next: does Bolt still feel dominant late? Nova is weak against late flyer-heavy waves in the
    probe, but buffing it (cd 1.6) made the bot lean on it and lose more; refit `W` (fit.ts) first.
  - [x] Telegraph: depths 2-3 get +2 enemy budget (depth 1 stays the tutorial; rules v4). Greedy bot
    median depth 8 → 7 (back on target), more of its runs end on depth 3. A bomb someone stands on
    is now drawn under them (a lit ring) with a "💣 n" fuse tag below, not a badge on top.
  - [x] Telegraph second blind playtest (rules v5; runs to depths 6, 11, 13, "fair but steep"). Bash
    gets the move's red "Bash (−n ♥)" button; a fatal move/bash says "Move — you die" and needs a second
    press ("Sure? You die"). Previews name who hits you (red rings, other threats fade) and, when safe,
    what takes aim at where you end up next (amber "!" and "Then in line for a Pylon's zap", from the
    simulated post-state), so a pylon that starts charging no longer reads as a lie. Tapping any other
    hex shows who threatens it (stairs: how many enemies are left). Guard shields: thicker arc with a dark
    rim plus a bright edge on the 3 front hex sides. Cleared floor with a bomb still ticking: auto-walk
    steps around the blast (or says to step clear) instead of silently refusing. Shared cards: a long
    card whose primary button starts below the fold pins it in a sticky footer (Telegraph/Glyphwright
    help). Balance: spawn budget past depth 8 grows +2 a floor (was +3), at most 11 enemies (was 12)
    and 4 brutes (were up to 8; 6+ on ~18% of deep floors); bombers never back away (close to lob range
    and hold). Greedy bot x150: median 7 → 7, mean 6.59 → 6.77, depth-3 deaths 23 → 23, max 12 → 15;
    deep floors d9-14 average 9.2-11.0 enemies (were 9.6-12.0). Bombs hit the bot more (60 → 78 of
    ~600 hits) since bombers hold their ground in range.
  - [ ] Next: owner feedback on depths 9+; if still steep, a heal source (e.g. a shrine every few floors).
  - [x] Rewild (rules v3): species alive 4 seasons in a row are **settled** and pay +3 each season;
    dying out restarts the streak, so keeping wolves and deer balanced beats replanting. Stars
    rescaled to 900/1700/2400 (greedy bot 0/0/13/3 vs 0/2/11/3 before). Report and species list show
    it. Then (rules v4): goal targets retuned from 32 bot games (oaks 1/8 → 4/8, ponds 2/10 → 4/10;
    soil/species made a bit harder); winter wildflowers are straw-gold with pale seed-heads.
    (Done: goals show ⚑ in the header, stars are only score stars.)
  - [x] Rewild second blind playtest (rules v5; 1731 and 2014 points, "forecasts are the best part"):
    wildfire comes at the end of a lightning summer, after grazing, and only full-grown grass, flowers
    and shrubs on bone-dry ground (moisture 0) burn; oaks never do (help, species texts and weather card
    agree). The island shows the burn plan (flames), the strike (bolt in a dashed hex, a line to where it
    catches) and next season's strike faintly; plants report "burnt in the wildfire". So grazers,
    ponds/marsh, oaks and gaps are firebreaks (one deer can save a meadow). Placement glow and cell
    readouts now both come from tracking the population through the exact trial (`track`, `feed`
    events): food is what it finds when it eats, fleeing/wandering is never green, no "food 6/1, move
    away" contradictions. "Nowhere to put it" names the real blocker ("Of 7 soil cells: 3 too poor,
    2 too dry…"); out-of-season plants and winter sleepers are judged once they get going. Died-out
    species share one wrapping line (no cap, no "deer hungry" beside "deer died out"); the report's
    forecast says it counts cards already placed. The panel is taller on tall phones and shows a
    "scroll" tag when text runs on. Deals weight cards with nowhere to go ×0.15 and a new hand halves
    the old cards (dead cards dealt 8.6% → 1.6%). Greedy x32: median 2080 → 2333 (stars 0/1/26/5 →
    0/2/21/9; ~+140 from fire counterplay, ~+110 from deals), fire burns 3.8 → 0.5 cells per lightning
    summer for the bot; random 787 → 890. Stars kept at 900/1700/2400 since 3★ felt out of reach.
  - [ ] Next ideas: watch whether fire is now too tame for players who graze; maybe a second strike in
    year 4-5, or a fire that jumps one gap.
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
  - [x] Links (second clue type): "Clues: Numbers / Numbers + links" in the new-puzzle sheet. A link
        ("=" across an edge) says both hexes match; generation starts from every number plus a link on
        every matching edge and strips both in one shuffled order (large normal: ~28 numbers + ~21 links,
        ~1.4 givens vs 37 numbers + 10 givens). Arrows ("this beats that") were tried and dropped: they
        reduce puzzles to chains of links (numbers-first stripping left a spanning tree, zero numbers).
        Propagation got a work queue (same fixpoint), so Hard large is ~40 ms (numbers) / ~70 ms (links).
        One-time tip card, help line, hints ("The link says these two match"), red broken links.
  - [x] Links blind playtest ("Hard links was the best puzzle of the session"; Normal links felt more
        mechanical than numbers) and fixes: tapping an empty selected/hinted hex no longer cycles it
        and pressing the element a hex holds no longer clears it (the hint → tap → element flow placed
        nothing); links are small pills along the edge with a light rim (red rim when broken);
        Easy/Normal links never touch givens and join at most 3 hexes (LINKS_VERSION 2; normal large:
        ~33 numbers + ~12 links + 4 givens, links settle ~17% of hexes vs ~35%); hints skip pure link
        copies; sheet says "one clue" in links mode and counts solves per level+mode; ＋ works in one
        tap over a card; the help card fits without scrolling.
  - [ ] Next ideas: a links daily, two-clue deductions for hard.
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
  - [x] Third pass (N1 blind 0★ cut off by the tide, "harsh"; N2 1★ blind, 3★ aimed, "fair and tight")
        and fixes: N1 cliff says when the tide covers the steps, coat can be put on off the hook, a
        warning when pocketing matches without it, the door points to Ada's keys, stranded endings say
        where and with whom (and Tomas always gets a line); N2 rules v3: Bassett's signal replies follow
        what he knows and he's asked again only when something changed, Nell comes for the horn without
        a promise and knows the moor herself, stale moor/fog/house lines fixed, blowlamp needs-a-match
        hints, Nell's payoff line; a "With you" line above the choices.

- [x] **Nightline fixes from its blind playtest** (agent reached the goal on run 3; no errors):
  steering ~120 px to full lock; HUD on backing panels, 11 px labels, brighter TIME UP; traffic drawn
  1:1; goals renamed "endings"; end screen shows stage progress; "SHARP LEFT · BRAKE" warning ~2 s
  before curves you can't hold at top speed (|curve| > 3.2); at a fork only x > 0.2 takes the hard
  road (the middle is gentle); start clock 65 → 70 s. Bot still finishes 10/10 left, 8/10 right.
- [x] **Nightline second blind playtest fixes** (rules v2; 4 races by a screenshot bot: out of time 75% into stage 2,
  97% into stage 3, 46%/92% on Pine Pass; 13-28 crashes a race; fork panels and curve warnings liked):
  traffic smaller than 2.5 rows is a bright tail-light badge (`farCar` in render.ts) out to the draw distance
  (was invisible past ~100 segments, mush below 3 rows) and a red `V` marks small cars in your lane; horizon
  0.42 → 0.32 of the rows with the camera raised in proportion (`camHeight`: road width at the car unchanged, so
  CAR_HIT_W still fits) so the far road spreads over ~23% more rows; steering slider thin, under the car;
  roadside props keep 45% of your speed and bounce you back toward the road (`push`, PROP_KEEP/PROP_BOUNCE;
  was a dead stop at 12%); Pine Pass rumble brighter; fork divider orange (no traffic colour), fork panels say
  "left/middle · gentle" / "far right · hard" on one line, help matches; "CHECKPOINT 850 m" under the clock below
  15 s (cyan if reachable at top speed, pink if not); curve warning sits in the sky above the horizon; bug report
  carries `rules=`. Bot (40 seeds) before → after: left 40/40 (median 38.4 s left) → 40/40 (42.8 s); right
  33/40 (16.1 s) → 38/40 (23.3 s); median crashes ~40/37 unchanged (it dodges with perfect information).
  Next: owner playtest; if humans still run out of time, consider a small clock bonus rather than more help.

## Ideas (unscheduled)
- Unspoken: more story templates so the village tale varies; (done: 🔊 speaks a word with the phone's
  voice, Italian when available; done: the second village, see Done).
- [x] Hub: shared Sound / Vibration switches (src/shared/settings.ts; audio never starts when off,
  navigator.vibrate becomes a no-op). Reduced effects done 2026-11-12: hub "Effects" switch (defaults to the
  phone's reduce-motion), `reducedFx()` gates shake (Telegraph, Glyphwright, Afterglow), Afterglow level flash,
  Hexhold hurt tint, Nightline streaks; html.reduced-fx makes CSS animations play once.
- Afterglow: owner is happy with it — leave alone unless they report something.
- Grove: owner wants it kept as is (no smaller board).

## Done (recent)
- Grove UI fixes (rules v2 unchanged, replays unchanged; owner: keep Grove as it is): #info is a fixed 60 px box
  (`#tray #info`), so the board no longer shifts ~9 px when the Place button and one-line preview replace the two-line
  idle help; a full board says what to do ("Board full: swap in your Bolt from the stash", stash pulses yellow, a tap
  on the board nudges it; with the Bolt in hand "zap a piece"); the rules already end the game when the board is
  full with no Bolt in hand or stash (new test tests/grove/fullboard.test.ts checks random games never leave a full
  board in play without one); a Bolt aimed at a Grove, Spirit Tree or Monolith (`isPrecious`) previews in red
  ("Destroys Grove", red hex, red Destroy button; still tap-to-preview, second tap to zap); a Bolt on an empty hex
  says "Fizzles: wasted"; help (fits a Pixel 7 card without scrolling) adds placement points, merge multipliers,
  stone values, wisps-move-then-trap, no trap points for a wisp dropped into a closed hole, crystals at any tier,
  and when the game really ends. Not done: a "couldn't load" retry screen (Grove has no lazy chunk; a 404 on the
  entry script runs no JS at all).
- Second technical QA sweep (360×640 and Pixel 7, UI only, no RULES_VERSION changes): shared cards take `pin: true`
  on a secondary button so a long card's sticky footer holds both main actions (Brink help: Play + Lessons; Triad help);
  Brink status bar wraps to two lines inside its 34 px at ≤380 px (board never moves); Kitbag foe grid column is
  `auto` on short screens (the fixed 62 px column let the container-query portrait overlap the name/HP) plus a
  narrow-width container rule (80 px portrait, slimmer intent); Last Light starts a new night scrolled to the top
  (resumed runs still jump to the latest beat); Glyphwright short screens: 44 px slots, tighter tip/bench/shop, hud
  via `body #hud` (shell.css comes later in the bundle), lane 128 → 193 px at 640; Afterglow pause has one Resume
  (top); Hexhold ✕ 44×44, footer buttons nowrap and 14.5 px at ≤380; hub chips share one row at ≤380 (wrap if more
  come); Triad `?daily` help = "Play the daily" + tutorial second, the tutorial saves under `tut` (reload resumes
  its step, any `start()` clears it) and its last card returns to today's daily when it came from there; Unspoken
  place tabs sit in `#placesBar` with ‹ › cues (`:has(.more-left/.more-right)`) over the faded edges.
- Telegraph second blind playtest fixes (rules v5; see Design follow-ups): Bash/fatal confirm buttons,
  threat sources ringed on tap, amber "then in line for…" on safe previews, bolder guard shields, bomb-aware
  auto-walk, gentler deep floors, bombers hold their ground. Shared cards pin a long card's primary button.
- Technical QA sweep fixes (360×640 and Pixel 7, no gameplay changes): Afterglow bug report uses `copyText` (every
  game's copy button now does), title fits short screens, evolution line "lv 1/8 + Multicast"; Telegraph in-play
  hints are `toast(..).classList.add('hint')` over the bottom panel, under the menu (z 5), taps pass through;
  Unspoken 44 px scene glyph tiles with aria-labels, 44 px place tabs with fade edges and the active one centered;
  Delve sizes its view to leave the deck ≥130 px (minimap scales down), lower pad on short screens; Ninefold #info
  fixed at four lines (70 px); shared short-screen card rule in shell.css (`max-height: 700px`: tighter gaps,
  44 px buttons) so every menu fits at 640; Nightline pause "Copy bug report" (seed, daily, stage, route, time:
  races are real-time, no replay); Summit badge inside the stock button, table cards `role=button` + "7 of hearts";
  hub Daily tile font 13 px at ≤380 px, first-ever visit shows the latest news without a count.
  Gotcha: `toast()` now returns its element.
- Unspoken second village (the mountain village): unlocked by finishing village 1 (ending button + menu › Villages).
  Fresh language per seed with case particles (doer / done-to, so doer and done-to swap order freely; the verb's place
  is fixed) and verb agreement (a mark under the action when many act). 5 places (Pass, Lake, Hamlet, Carvings,
  Terraces; new lake/hamlet/terraces backdrops), roles riddles write the done-to first and always offer the swapped
  scene, compose decoys include the wrong agreement, final question "who found the people?". Notebook grammar
  notes appear as their glyphs are proven. Village 1 byte-identical (hash test), no RULES_VERSION bump.
  Blind playtest (all 5 places, 15/15 riddles first try; "the Pass opener was the best moment") and fixes: scenes
  in a newly opened place clear at once (core; replay skips old re-guesses of glyphs that proves), no "some are off"
  line when nothing is off, bug links use opaque glyph codes, link-opened runs persist across refresh, seen
  mountains drawn behind and smaller, "new" is a white gleam with blue glints (not make's gold sparks), old fire
  burns low with smoke, village-2 riddles only use adjectives the art shows (adjShown2; village-2 save v3), one-line
  glyph labels, long places get a "3 / 17" counter strip, steady writing palette, toast at the top, the ending
  counts wrong readings. Not done: vaguer Grammar chip names ("doer"/"done-to"/"many do" give the meaning away).
- Unspoken village-1 blind pass (seed 2043983302: 46/46, 2 wrong readings) and fixes: look-alike glyphs (same strokes
  moved/resized, e.g. "before" and "what?" one arc a quarter box apart; ~12% of languages, mostly particles) are
  redrawn deterministically; the fisher is a clean-shaven man with a rod ("the fisher in the yellow hat"), not a
  second old man; carried animals are lifted into the arms (big ones drawn at half the carrier's height, adjective
  kept); a broken thing stays one cracked object; many carried things are a pile in the front carrier's arms; riddle
  hint "Each wrong scene changes one thing from the right one"; tab cues sit beside the strip; every place uses the
  counter strip; "Go to" never empty; the word bank only marks meanings already proven elsewhere (quiet ✓).
- Grove blind playtest (agent: 24,775, Spirit Tree, 209 turns; "too forgiving, too long") and fixes
  (rules v2): trapping pays 50 per wisp (×2 for 2+ at once); crystals 5% → 4.5%, bolts 6% → 4.5%,
  wisps 20% → 22% (bot: 276 → 248 turns, Spirit Tree 49/60 → 30/60); help says wisps never merge and
  what traps pay; brighter labels; empty stash is dashed and says so. Still long for one sitting —
  owner said keep the board as is (no smaller board).
- Delve second blind playtest (depth 7 to a cultist at a door, depth 8 between a wraith and a golem, daily depth 2)
  and fixes (rules v5): at most 1 golem (only on open ground, never corridors/dead ends), 2 wraiths, 2 cultists per
  floor; cultists gather flame a turn after each firebolt (logged, a tell); a sleeping monster spends the turn it
  notices you; "You hear something behind the door" + "?" on the door (view and maps); hunters blocked by another
  monster take an equally short step, so wraiths stop idling on diagonals; HIT strikes a front-corner foe (arrows
  say "(HIT)"), never shuts a door with a foe beside you or in the doorway, "You swing at nothing"; wall bumps say so
  and shake the view (not with reduced effects); scrolls of seeing are carried and read from the MAP card (MAP ?n);
  a/an and "(same as yours)"; spell menu in fixed order; player "@" with a facing notch on the maps; foes stay bright
  far off; the title offers "Continue daily descent". Warden HP 340 → 420 to keep the end hard. Bot (100 runs):
  v4 44% wins, deaths d6 11 / d7 7 / d8 6 / d10 17 (of 61), floor damage d6-7 ~170 → v5 58% wins, d6 5 / d7 1 /
  d8 3 / d10 20 (of 78), d6-7 ~118. Depth 5 (10 deaths, ghouls) is now the bump to watch. The bot test plays only
  to depth 6 (17 s locally).
- Lantern second blind playtest (finished at level 6, 804 turns, 0 falls) and fixes (rules v2): taps into the
  dark re-plan every step (`planWalk`) so a walk goes on until arrival; a walk stops only for a new monster, a met
  one coming within 3, a monster in the way or an event, and says why; tap elsewhere to re-route, tap yourself to
  stop; unreachable taps say so (a chase no longer silently drops). Floaters replace older ones on the same cell
  (same-turn ones stack), level-up and the Ember are banners, NPC labels flip below when you stand above them. HUD XP
  bar; an info line shows the adjacent/last-fought monster's HP and both sides' hit % and damage, else the goal;
  per-monster dodge (bat 30%, wolf/King 15%, others 10%) explained in the miss line; the Lantern and the way home are
  flagged with the Ember, and bumping the Lantern with it wins. Level 1 softer: attack 4 (was 3), 3 potions, heal
  1 HP / 3 turns when nothing sees you (10 otherwise) and Wait becomes Rest (until healed or something shows up).
  End tougher: King 70 HP / atk 10 / def 4 (was 45/9/3), reached only through Deep Hollow's long bottom tunnel and a
  skeleton guard. Completion bot 98% → 100%, king level median 7 → 8, falls median 0 (max 1 → 0). Duel probe
  (axe, 1 potion): L5 98% → 29%, L6 100% → 87%. Not done: rushers can still skip most of floor 1.
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
