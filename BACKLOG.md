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
  - [ ] Next: third playtest. Watch: does the 15-draw carry cap feel fair; High Stakes is weak for survival.
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
  - [ ] Next ideas: owner feedback on the new curve (is 15-25 tense now? is the end too hard?).
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

- [x] **Nightline fixes from its blind playtest** (agent reached the goal on run 3; no errors):
  steering ~120 px to full lock; HUD on backing panels, 11 px labels, brighter TIME UP; traffic drawn
  1:1; goals renamed "endings"; end screen shows stage progress; "SHARP LEFT · BRAKE" warning ~2 s
  before curves you can't hold at top speed (|curve| > 3.2); at a fork only x > 0.2 takes the hard
  road (the middle is gentle); start clock 65 → 70 s. Bot still finishes 10/10 left, 8/10 right.

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
