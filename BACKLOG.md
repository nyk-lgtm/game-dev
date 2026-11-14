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

## Start here (summary, 2026-11-13 evening)
22 games are live (new today: Simmer, Gleam, Lull); every one has had at least two blind playtests and the fixes shipped
(Lull: one so far, second running). Open threads, in order:
1. Owner feedback first: anything the owner reports beats this list.
2. Real-phone checks only the owner can do: Loomsong sound/timing, Lull sound mix, Sungrazer smoothness.
3. Done and shipped today: third playtests (Summit v4, Kitbag v4, Sungrazer v4 + ~3x cheaper frames, Brink AI v4, Quarry v4),
   Loomsong second pass, Delve v6 (depth 5 eased), Rewild v7 (fire telegraphed a season ahead), Simmer v4 (three playtests),
   Gleam v2 (two playtests), Lull (one playtest; second running). Hexhold gold sink: not needed (gold stays spendable).
   Glyphwright bot refit: the refit bot wins ~83% (old 37% was a bot flaw); harder late waves/Lich only if the owner asks.
4. Next: Lull second-pass fixes; Simmer fourth playtest (watch "buy everything" dominating); Gleam third pass if wanted.
5. Grove: owner said keep it as is (board and balance); only bugs/clarity. Afterglow: leave alone unless asked.
6. New games are welcome when the queue is quiet (recent additions: Ninefold, Summit, Quarry, Sungrazer, Kitbag,
   Brink, Loomsong, Simmer, Gleam, Lull, Trestle). Ideas: a co-op-free social/daily puzzle. (The creative/sandbox toy is Lull.)
   Trestle (new physics builder): third playtest fixes done (rules v4: free ends left out, polished par, smoother pool); fourth blind playtest next.
7. Simmer: second blind playtest (see its item below). Gleam (new light puzzle): first blind playtest. Lull: first playtest fixes shipped;
   second blind playtest and a real-phone sound check next.
   Brink, Loomsong, Simmer). Ideas: a creative/sandbox toy, a co-op-free social/daily puzzle.
7. Simmer: fifth blind playtest (see its item below).
6. New games are welcome when the queue is quiet (recent: Ninefold, Summit, Quarry, Sungrazer, Kitbag, Brink, Loomsong,
   Simmer, Gleam, Lull). Ideas: a co-op-free social/daily puzzle, a short narrative roguelite, a physics builder.

## Now
- [ ] **Tidings** (original narrative roguelite: carry the winter post from Tarrow Bridge over the hills and the Teeth to
  Hollin; 11 stops, each deals 3 illustrated event cards, face 2; trade food/oil/coin/health/trust; companions gate choices,
  promises, callbacks; journal of events/companions/endings; daily). Milestones:
  - [x] Core (src/tidings/core, rules v1): ~100 authored cards (8 recruits, ~60 place cards, 8 anywhere, 13 callbacks, 8
        companion stories, text variants), seeded map of 2 nodes a row by region, deal with callbacks first and one ⚑ at
        most, gambles from the seed with shown odds, leg costs by region/kind/band, scoring, 11 endings. 21 tests.
        Balance (`balance.ts 400`): careful ~55% (51-56% by seed set), casual ~11%, random/safe/risky/greedy ~0%. Learned:
        one companion must be free to feed (pairs eat) or the bot never recruits; health/trust were free currencies until
        legs cost them (rivers/heights health, forest trust); the last leg is free (no deaths on Hollin's doorstep);
        hills/pass food 2 is the touchy knob (1 → ~85%).
  - [x] UI: resource pills (tap for rules, low ones pulse), journey strip (tap: route card with every leg cost), hand
        rows with SVG landscape art, focus card with every number as chips (☠, odds, boosts, upkeep, promises, ✦), flip to
        outcome, road buttons with costs, ending card with score table and a card-by-card recap, journal, help, menu, bug
        report, daily, hub card (Story + Strategy) + Daily link + NEWS. Pixel 7 and 360×640 checked; a touch play-through.
  - [ ] Next: first blind playtest. Watch: is it too hard for a thoughtful human (casual bot only ~11%; food is ~65% of
        deaths)? Do players find the ⚑ rule and companion upkeep clear? Are 2 callbacks a run enough to feel the "stranger
        returns"? Maybe: sound, a short intro vignette, more endings tied to companions, a gentler first journey.
- [ ] **Trestle** (original physics builder: planks, twigs and twine on a peg grid; carry the beetle's cart over a gap or
  hold a lantern at a ring; stars for matching the surveyor bot's cost and part count). Milestones:
  - [x] Core (src/trestle/core, rules v1): XPBD sim at 480 Hz (rigid members, one-sided twine, smoothed forces snap past
        strength, a 3-particle cart rolling on planks and rock, a lantern on a cord), builds as action strings with undo,
        6 hand-made tutorials (one idea each: first plank, prop, truss, hanging road, lantern, spire) and generated levels
        (crossings with face pegs/spires/hooks, lantern cantilevers from a cliff); the surveyor proves each within budget and
        sets par/parts. Probe (200 levels): first layout proven 74% (crossings ~79%, lanterns ~62%), always within ≤ 6
        layouts; par/budget median 0.72; gen median ~75 ms (max ~0.6 s, cached by the page); a test run ~2 ms. 12 tests.
        Learned: self-weight dominated at first (twigs 0.3/unit broke long trusses under their own weight) → densities
        plank 0.25 / twig 0.08 / twine 0.01; cantilevers carry ~4× a crossing's moment, so lanterns weigh 1.2-2.5 vs carts
        2.3-3.9; a 1-long tilt step in the road (45°) stalls the cart, so the surveyor tilts on a 2-long plank; impact
        spikes at slope changes needed ~85 ms force smoothing; rails merging before the ring left the tip on one pin.
  - [x] UI: dusk ravine canvas (sky, hills, pines, water, mossy banks, stone spires, branches with hooks), planks/twigs/
        twine with pegs, drag peg to peg with a 2× loupe above the finger, tap a piece's middle to remove, undo/clear,
        pinch and ⤢ zoom (pan when zoomed), live runs coloured by stress with snaps (stubs, splinters, sound), pieces that
        peaked ≥ 70% glow afterwards, result card with stars, levels card (the trail), daily (`?daily`), bug reports,
        hub card (Puzzle) + Daily link + NEWS. Pixel 7 and 360×640 checked (a mouse-driven build of level 2 gets ★★★).
  - [x] First blind playtest (real CDP touch, Pixel 7: ★★★ on most levels first try, often far under par; ★ only on
        tutorials 3 and 6 where the obvious truss at par collapsed or cost more; repetitive after ~8 levels) and fixes
        (rules v2): a much stronger surveyor (both road alignments, struts/hooks with small triangles, strut+cord Vs,
        several strip orders, twine swaps, plank merges, local search; `par.ts`: a 4× search beats its par on ~18% of
        levels, p90 9%); the ramp (spans to 8, face pegs 70%→10%, carts to 4.2, wind 27% of levels, twin lanterns, logs
        low over the gap and rock floors under it, islands; every third trail level a lantern; budgets ×1.4→1.15);
        tutorial par = the obvious lesson build (t3 all-twig Warren 122, t6 132, t2 two struts 62); the cart rides on
        damped springs with light wheels and forces are smoothed ~140 ms, so a heavy cart through a V road no longer snaps
        planks (`bumps.ts`: worst plank 1.03 → 0.29 at cart 4.5); failure notes name the cause (unjoined / own weight / wobbly, with
        swinging pegs ringed / too weak, naming the piece / off the road / sag) and stay with the glow after a reload;
        drags past reach show a dashed reach circle + "max length" and the loupe looks at the landing point; tray and
        help give reaches; "not joined yet" in the cost line; tap picks a piece (✕ Remove), second tap removes; header
        icon buttons 44 px at 360-390 (stars beside the level label); levels generated in a worker with a loading card,
        the next one prefetched; vibration guarded. 17 tests.
  - [x] Second blind playtest (v2 live: tutorials and 7-14 ★★★ in 1-2 tries, a 2-plank arch beat par on 9, a spike at 15,
        16-18 easy, 10/12/13/16 all fell to 3 planks + 2 twines from one hook, wind changed nothing, every lantern a wall
        bracket) and fixes (rules v3): island rock tops count as road in `joined`; failure notes name what snapped first and
        a swinging shape is "wobbly" (counting the ringed pegs) before "too weak"; only the first-snapped piece glows; ⤢
        zooms to the box of all anchors/pegs/rings (never cuts one off); dailies get their own name words; tray shows
        holds 80 / 60 / pull 45. Rules: the beetle can't haul up a 2-across-1-up plank (CART_ACC 3.6), which kills dips
        and humps (plank chains and arches held and beat every truss); wind adds updraughts (`lift`, LIFT_K 1.6) so hung
        builds lift (`wind.ts`: the calm par build fails in 15/18 windy versions, par +8%); convoys (two carts); level
        types (plain, hooks, arch, boat lane, convoy, island, spire, wall lantern, gap lantern) with tips. The trail is a
        picked pool (`pool.ts`): 9 types × 18 candidates re-surveyed at effort 4, difficulty = 0.65 × textbook shapes that
        failed + 0.35 × parts, chosen to rising targets in a type rotation, ordered easiest-first with no type twice within
        two levels: thirds 0.26 → 0.51 → 0.75, neighbour steps ≤ 0.08. 20 tests.
  - [x] Third blind playtest (v3 live: 7-11 ★★★ first try, arches 12/19/27 only ★, islands 15/18 near-identical 4-part
        freebies, wall-lantern par loose (L20 77/8 vs 93/15, L23 92/8 vs 125/18), 24-30 tight and good, live levels past
        the pool 0.30-0.96) and fixes (rules v4): a stub with a free end rescued a failing build (L24: plank 9-10 "pushed
        past 80" held once a loose twig stuck up from (9,7); the v3 par builds leaned on the same trick): its peg mass and
        wind catch at the joint changed the solve, so pieces with a free end (`looseOf`, pruned repeatedly) are now left out
        of runs, drawn faded and counted in the cost line, and `wobbly` ignores them; lantern shapes add Warren arms,
        cable-stayed arms and a second ring hung off the first ring's arm, and `polish` (seeded local search: drop pieces,
        swap twig/twine, add a piece or a braced new peg) tightens par (pool 3 × 5000 steps; on v3's L20 two-ring wall it found
        61 / 7 where the tester had 77 / 8 and v3 par was 93 / 15; v3's L23 only 111 / 16 vs the tester's 92 / 8); gap tip "from one bank or both" and gentle gaps early (span 3, the ring level
        with the banks); islands 2-3 wide, off centre, sometimes a step low; pool bias arch +0.12 / island −0.05 / gap
        −0.15, near-twins kept apart, every type by level 16 (gap at 14); live levels past the pool pick the nearer of two
        candidates to a rising target, without islands/spires (0.69-0.96 over 67-80); dailies pick the nearer of two to
        difficulty 0.5 and name words match the kind ("Lantern" left the daily words); past-reach drags end only on an
        existing peg or ring in line (else "Too far", nothing placed); a cart stuck uphill lights the climbing plank (and
        stalls are judged by progress, so rolling to and fro in a dip counts); plural "The lanterns hold!"; help in short
        sections with a row per material. 22 tests.
  - [ ] Next: fourth blind playtest. Watch: are polished pars beatable at all (★★★ rate)? Is the early sawtooth (14 gap
        0.28 → 15 hooks 0.07 → 16 arch 0.35) noticeable? Is the Moss-Hook-style two-ring wall still loose (its par stayed
        ~111-126 while the tester found 92)? Old watch items: does difficulty (shapes that fail) match how hard people find levels? Is
        "no climbing" clear (the stuck message says so)? Do boat lanes and arches feel fair? Is the late pool (diff ~0.9,
        par ~190) a wall? Old v2 watch items: is ★★★ now a real target (par from the stronger surveyor) without being
        impossible on some levels? Do wind and twin lanterns read clearly? Is two-finger pan at the fitted view missed
        (it only pans when zoomed)? Is the loading card ever seen after level 7 (prefetch)? Maybe: a "show the surveyor's build" after a few failed runs,
        springs, two-cart or moving-load levels, a ghost of the last run's sag.
- [ ] **Lull** (original musical garden sandbox: plant singing plants, no fail state, shareable as a link). Milestones:
  - [x] Core (src/lull/core, rules v1): seeded pond (2-3 ellipses), six species with terrain rules and spacing, growth from
        `born`, watering (boost / flourish), dig; x = pentatonic column, y = lane (8th of the bar); `notesAt` (≤ 6 a step,
        always in scale), bees/fireflies/frog on fixed hop schedules, day/night, weather spells (breezy strums, rain drips);
        codes = live plants as planting actions with ages (6 chars a plant), exact round trip; 9 wishes. 18 tests.
  - [x] UI: two-layer canvas (cached landscape shaded for the light; live layer with sprite plants, skew sway, creatures,
        glows, particles, rain/mist), the bar's light band sweeping back to front, planting ghost with note + beat label and
        a preview note per column, water (can + drops), strum (harp across plants), dig, undo by gesture, species row with
        icons drawn from the plant shapes, info line, wishes card, menu (share link / keep a visited garden / new garden /
        sound / bug report), help, hub card (new "Calm" filter) + NEWS. Synths: bell, pluck, reed, glass, wood, bass, reverb
        wetter at night and in mist, rain/wind beds; scheduled on the AudioContext clock. Pixel 7 + 360×640 checked.
        Perf (30 grown plants): 60 fps desktop; CPU ×4: ~30-36 fps at DPR 2, ~50 fps once it steps down to DPR 1.5.
  - [x] First blind playtest (no jank, "art lovely"; all 9 wishes done in ~15 min, several by accident) and fixes (rules
        v1 unchanged, codes unchanged): per-garden rotating wishes (3 active, seeded order, skip any already true; 9
        milestones stay), beat band brighter (added light) + numbered edge beat dots + plant pop/ring on each note (night
        and mist checked), strum trail + stronger pulses, "Tap the garden to listen" after a reload (first meadow tap only
        wakes audio; 🔇 until audio runs), `?g=` kept while visiting (rewritten with the visit's state), edge plants
        narrowed/nudged inside, dawn synced with the sky (moon sets, stars fade), HUD weather word in the small label, wish
        toasts on one line, plurals ("Moonlilies"), one name per plant everywhere (Whistlereed → Pipereed), sapling look for
        young Humwillows, a sandier dashed shore. Perf unchanged (60 fps desktop; ×4: ~30 fps DPR 2, ~50 at 1.5).
  - [x] Second blind playtest fixes (rules and codes unchanged): the tap that wakes the sound after a reload also acts
        (cue stays until audio runs); sun sets mid-dusk (never at night); garden wishes reworked: weighted toward
        compositions and moments (chords on a beat, rising/falling tunes, groove, offbeats, creature visits, dusk/night),
        only half-grown plants count, never drawn if true now / when grown / at any of 6 times over the next day
        (`tooEasy`), first wish an echo (`twin`); no-garden visitor wording; dark numbered beat chips (≥ 11 px) with plants
        kept clear of the edges; taller meadow on short screens (360×640: lanes ~34 px); lilies drawn last, willows over
        the pond at 62%. Perf: desktop 60 fps; ×4 throttled ~32 fps at DPR 2, ~55 after stepping down.
  - [x] Perf pass (profiled with a CDP trace + ablations, not guessed): sheared sprite draws → strip blits, beat band and
        mist built at device size (1:1 blits, no 'lighter'), unlit beat chips baked into the landscape layer, shadows
        baked into sprites, ≤ 3 glows a plant; DPR steps back up after a sustained good stretch (with backoff).
        ×4 throttled first measurement 45-48 fps at DPR 2 (was ~32), desktop 60.
  - [ ] Next: third blind playtest + owner's phone (sound!). Watch: is "left = note, back-to-front = beat" discoverable
        from the ghost label and the sweeping band? Is a full garden too busy (Harpfern runs dominate; MAX_PER_STEP 6)? Do
        seedlings read at the back rows? Is half a day of growth while away welcome? Does the DPR step-down ever fire on
        a real phone (it never steps back up)? Maybe: a gentle master volume, more species (a bass drone moss?), seasons.
- [ ] **Gleam** (original light-and-mirrors logic puzzle, daily). Milestones:
  - [x] Core (src/gleam/core, rules v1): N×N tiles (6/7/8); lamps on the rim shine R/G/B/white beams (bitmasks, added
        at crystals); pieces only go on brass rings (sockets): mirror / \, splitter / \ (pass + turn), R/G/B filter;
        every tray piece must be placed and lit; crystals swallow light and must get their exact colour, dark crystals
        (target 0) none; stone blocks. Generator walks the beams dropping pieces/crystals on fresh tiles, adds decoy
        rings and dark crystals beside turns, then the exact solver (frontier search with one-look pruning) adds a dark
        crystal where a second answer shines (or drops a decoy, or gives a piece) until unique; the deduction model
        (eliminate a code when assuming it fails the one-look check: certain light, possible light, tray counts; depth
        2 = after depth-1 deductions) must finish within the size's depth (Large needs a depth-2 step). Stats (200/size,
        laptop): gen median 0.4 / 1.9 / 14 ms, max 4 / 26 / 110 ms; unique 100%; depth-2 in 0% / 23% / 100%.
        Learned: narrowing used-up piece types inside the check must repeat until stable (a socket narrowed to one
        piece counts as placed), or the room count goes unsound; stress.ts found it from part-filled boards.
  - [x] UI: canvas board with additive beams (each colour bit stroked with 'lighter', so crossings mix), photons,
        lamp lenses, glass splitters, crystal pips per needed colour, dark crystals flare red when lit, unlit pieces
        dashed red; tap a ring to cycle (types with pieces left), tray tap arms a type, drag from the tray or between
        rings (swap), drag off to remove; undo/clear/hint (+30 s; names a wrong piece first, else places the model's
        next piece with why the ring can't stay empty / turn the other way, and rings the crystal it's about);
        tap tiles for what they need; saves as seed + actions; `?daily` (Medium), hub card (Puzzle) + Daily + NEWS.
        Pixel 7 and 360×640 checked.
  - [x] First blind playtest (Pixel 7) and fixes (rules v2): the daily is kept in the address (`?daily`) and as the
        saved mode, so a reload or discarded tab reopens it; #info is a fixed box (shell.css's flex: 1 let a 3-line hint
        push the board up 11 px); after a win Clear is disabled and Hint becomes Next (My puzzle from the daily); a fixed
        piece in the dark gets the red dashed ring; HUD reads "Lit 0/2"; help explains gold-ring pieces; crystal dots
        ~2x bigger (gem ×1.14, crown-only facets); light running both ways along a line is two strands, each shifted to
        the right of its travel; the ring under a dragged piece is outlined (red if fixed); hint reasons are cause →
        effect ("If it stays empty, green light would hit a dark crystal", "the fixed ⟍ mirror would sit in the dark"),
        identical reasons merge, and `check` reports the most direct broken rule first (a piece in the dark before a
        crystal cut off). Small was too easy (3 of 4 direct): it now needs `trapped` (some crystal's answer route
        bends more than its most direct route; was 9% of Small puzzles), Medium always has a white lamp and a filter
        (was 22%), menu says so. Large puzzles unchanged. Stats: gen median 2.6 / 3.2 / 14 ms, max 43 / 24 / 97 ms.
  - [x] Second blind playtest fixes (rules v2 unchanged): long hints were clipped (75 px text in a 58 px box) → #info is
        76 px (4 lines at 360 px, checked with `hints.ts longest` in Playwright at 360×640/780, 390, Pixel 7; board never
        moves) and hints are shorter ("A ⟍ mirror goes here. Left empty, … Flipped, …", no look-ahead note); a Large drag
        dropped one cell high (the piece floated ~1 cell above the finger and the drop used the piece's spot) → the drop
        is the ring under the finger, the piece floats 0.45 cell up, the ring is outlined; "New best!" only for a
        better time on the clock (whole seconds); taps: armed = place then only turn, unarmed = first type left → turned
        → empty (≤ 3 states); hint wording names the concrete cause ("the circled ring would need a piece but get no
        light", "a mirror would be left over, with no free ring in the light", "the white lamp's red light"); Small's menu
        says "two lamps, mostly mirrors" (splitters show up in ~30% of Small puzzles).
  - [ ] Next: third playtest. Watch: are hints followable now; is the unarmed tap (first type in the tray) a surprise
        when the tray has several kinds; photons' frame cost on the phone; is Small now the right first step?
- [ ] **Simmer** (cozy management sim: a night-market food stall for 20 nights, critter guests). Milestones:
  - [x] Core (src/simmer/core, rules v1): ingredients that spoil (fish 1 night … rice 6) with seeded cheap/dear market days,
        10 dishes (3 known, 7 to learn), 8 critter kinds with loves/dislikes, purses, patience, arrival windows and weather
        likes, unlocked by renown; worth = base × taste × weather; guests take the most worth left over within purse and
        stock; a minute-by-minute queue over 1-3 stoves; delight (loved dish, ≥ 25% of worth left) grows renown on a
        (100 − renown)% curve and brings a friend; sold out / gave up / closing cost a ♥; festivals, paydays, upgrades,
        a nightly helper; score coins + 10·renown. 16 tests (purity, choice rules, queue, spoilage, replay, bot order).
  - [x] Bots and tuning (scripts/simmer): naive 1★ 100%, decent 2★ 98%, clever 3★ ~27%, and none of cheap / premium /
        greedy / fame / hoard / builder / sweets / fishy / overstock / understock beats clever. Learned on the way: per-guest
        +1/+2 renown snowballed (rep 700+, 250 guests a night), fixed by the bounded curve and "delight needs a loved dish";
        cook times needed +2 min serving overhead or one stove fed 100 guests; the bot must keep tonight's stock money
        before shopping (it starved itself buying recipes).
  - [x] UI: morning planner (forecast with crowd breakdown, kinds with tastes and purses, menu price steppers with expected
        orders and who orders, pantry with spoil/short warnings and Fill to forecast, recipes, upgrades, helper), evening
        canvas (original critter art, red-panda keeper, lanterns, rain/fog/fireflies/leaves, bubbles, coins and hearts,
        Normal/Fast/Skip), guest log with "why" cards, nightly ledger, season end with stars, guest book, season ledger,
        help, bug report, `?daily`, hub card (Strategy filter) + Daily link + NEWS. Pixel 7 and 360×640 checked.
  - [x] First blind playtest (3,066★★ and 3,710★★ careful, 2,287★ lazy; festival queues cost ♥18-25 a night) and fixes
        (rules v2): a reload mid-evening replays that evening (it skipped to morning, no ledger); the ledger closes to the
        guest log (dock Ledger / Night N ▶); header ♥ and coins update when the night ends; no "friends tomorrow" on the
        last night; "1 order"; recipes/upgrades bought this morning can be undone (replay without them); dishes priced below
        cost say so; Open warns in one card about short stock, a stove that can't keep up (offers the helper) and below-cost
        prices; let-downs cost one ♥ per two, at most 5 a night; recipe cards show orders tonight, what they'd replace and who
        loves them, upgrade cards a ¢-a-night payback; the cool box is 35¢ and also chills cold dishes (×1.15), bought in
        ~55% of clever seasons (was ~0-8%); help says a long wait cancels a delight. Stars 1200/2700/4000. Bots (100
        seasons): naive 1★, lazy ~2560 (2★ 10-19%), lazy + helper when warned ~3210 (2★), decent ~3650 (3★ ~27%),
        clever ~4140 (3★ ~65%); nothing single-minded beats clever. The bots' lazy (~3290 under v1) scored ~1,000 above the
        tester's lazy run; unexplained (maybe Fill wasn't pressed every night).
  - [x] Second blind playtest (lazy 3,480 / 3,276 / 3,476 ★★ on seeds 777/2024/31 because the warning card's default hired
        the cheap helper every busy night; careful 4,110 ★★★, only ~600 above) and fixes (rules v3): the lazy bot now taps what
        a person taps (card default included); the queue warning plays 4 typical evenings with the real queue model
        (`queuePreview`), so it fires whenever guests would give up (it missed N8-N9 at 175-185 min and cried wolf at 208/240),
        says how many, what a helper saves and when one helper isn't enough; its default hires only when that pays; helpers
        cost 12¢ + 1¢ per expected guest (the second stove now pays: clever and decent buy it); a delight spreads at least
        20% of a ♥ at high renown; the cool box hint names its cold dishes; the end card's best night is net; the shared card
        hint no longer covers a last button that is in view; a reload mid-evening fast-forwards to where it was; the pantry
        folds to one line after Fill (morning ~1.2 screens); ingredient emojis don't wrap. Bots (100 seasons, two seed sets):
        naive ~1880 1★, lazy ~2860 (2★ 82-89%), decent ~3820 (3★ 30-34%), clever ~4150 (3★ 63-68%).
  - [x] Third blind playtest (lazy 2,887 ★★, middle = lanterns N4 + second stove N7 3,626 ★★, careful 3,727 ★★: careful
        beat two obvious upgrades by ~100; renown hit 100 by N14-15 and stopped mattering; N12-20 felt samey) and fixes
        (rules v4): requests from night 6 (a kind asks for a dish it loves: worth ×1.4, delighted, 14¢ tip each; the morning
        card learns it or puts it on the menu); hearts beyond full renown become regulars' tips (10¢ each, shown in the
        ledger and as "full" in the header); lanterns +15% for 90¢, stove 140¢; the queue line and warning show a likely
        range from 8 sample evenings ("0-2") and also warn when the busy end reaches 2; "half a ♥ each, rounded up";
        "stock covers ~N" and stocked takings split shared ingredients (`allocateStock`); the folded pantry says when coins
        ran short; the guest log is sorted by time; kind sheets say "~N orders from them". Stars 1200/3000/4400. Bots (100
        seasons): naive ~2030 1★, lazy ~3140 (2★ 69%), middle ~3960 (3★ 8%), careful ~4520 (3★ 59%), clever ~4250-4410, 3★ 44-51% (its price search over-prices now that requests pay: ~25% walk off as pricey).
  - [x] Fourth blind playtest (seed 446297413: careful 4,343 ★★, lazy 3,396 ★★, buy everything after stock 4,672 ★★★ =
        dominant; buy everything before stock → 0¢, sold out every night, renown 0, no recovery) and fixes (rules v5):
        recipes ×2 and upgrades ×1.8 in price so fit matters (buyall now ~4,540 vs careful ~5,080); a purchase that leaves
        less than tonight's stock asks first; a broke stall is topped up to 30¢; requests bring 3 guests of the asking
        kind, who take their dish whenever they can afford it, "Put it on" prices it within their purses and the card says
        how many order it and that other kinds want it too; a dish priced down for a request goes back to its listed price
        next morning; a rival stall night late in the season; regulars' tips 25¢ per ♥ past 100; "Same seed again" starts
        from the default menu; toasts sit above the dock; a reload after a night closed goes on to the morning/season end;
        help says a long wait cancels a request's delight; kind sheets give a likely range. Stars 1500/3400/5000. Bots (100
        seasons, two seed sets): naive ~2070 1★, lazy ~3520 (2★ ~64%), middle ~4440 (3★ ~10%), careful ~5080 (3★ ~58%),
        buyall ~4540 (3★ ~22%), clever ~5330 (3★ ~74%).
  - [ ] Next: fifth blind playtest. Watch: do the dearer recipes feel worth it when they fit? Does the rival night read?
        Is the 30¢ top-up enough to recover from a bad spree?

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
  - [x] Second blind playtest fixes (no rules change): calibration result buttons wake after 1.5 s (a beat-keeping
        thumb kept a bad offset); top bar fits "Daily · Normal" on one line and two-line song names at 390 px; resize or
        rotation mid-song pauses (sideways note on the pause card); one name "Shift timing" (a 44 px button, plainer
        note); judgement words under the pads (off the approach lane on Hard), hint hidden once notes arrive; help
        says Hold; tiles "13 early / 34 late", "160/365 max combo"; accuracy "—" until a hit; the live cloth stops
        short of the edge and fades its oldest rows.
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
  - [x] Third blind pass (Normal 0-3 for a careful first-timer; stones lost to overlooked dashed rings and to
        crumble combos the red rings missed) and fixes (AI v4, rules and replays unchanged): red rings now come from
        `threatenedNext` (the tile after your move falls first, then every reply with its own falling tile: shoved
        onto the next tile or into the new hole counts); green rings on coral stones you can take now (`chancesNow`);
        your stone on tile 1/2 pulses, the status bar says "⚠ your stone on 2" and the info line "falls after the AI's
        reply: move it off!"; header "First tile falls in N moves"; Normal noise 70 + 25% of moves searched a ply
        shallower, Easy noise 200 + 20%; noisy levels never pick a recent layout unless it is the best; `W.repeat`
        300 → 500. Self-play: Hard–Normal 93%, Normal–Easy 81-89%, Hard–Easy 100%; first mover Easy 45%, Normal 49%,
        Hard 35%/48%; longest shove-back run 1-3, repeated layouts 0.1-0.3 a game (Hard repeats only when it judges
        that worth half a stone or more, i.e. forced defences).
  - [ ] Next: owner playtest. Watch: can a person now beat Normal? Do the red/green rings make the game too easy to
        read (maybe an option to hide them)? Is Easy now too soft?
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
  - [x] Third blind pass (33 runs: best 5,495, longest 1:04; deaths void 12, star 10, burn 9; the rescue saved ~16
        runs) and fixes (rules v4): the in-flight warning looks ~0.6 s ahead (as you're holding), amber looks 0.45 s
        ahead and is now yellow dashes (not dots, so it never reads as a corona), the help explains red ✕ / yellow /
        burn pulse; the tether and the star's edge pulse red (plus a beep and buzz) in the last 0.5 s before a burn;
        a pulsar going dark lets a finger still down catch the next star; coach pills sit low over the void and fade
        when the comet comes near; plurals; the end card says what the next mode needs vs your best. Bot numbers as v3.
  - [x] Frame cost (4× CPU throttle, Pixel 7 profile, headless): mid-run frames were ~64-70 ms mean vs ~34 idle;
        now ~18-26 vs ~17 (sky as CSS, star/glow/void sprites, DPR ≤ 2, HUD writes on change only, no redraw under
        cards, look-ahead every 8/16 ticks, fewer allocations in `step`). The cost was raster, not the sims.
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
  - [x] Gold sink checked (2026-11-13): not needed, rules unchanged (v5). probe.ts now reports gold banked per wave
        band, open cells, upgrade gold left and gold unspent at the end (64 seeds). The bot banks a median 14-17 gold
        in every band (p90 ≤ 38) with ~10k of upgrades and 17-30 open cells still to buy at waves 21-30; it ends with
        ~590 at a win / ~200 at a loss, i.e. the last wave's bounties, earned after the last chance to spend. Hoarding
        only appears when a player stops building: `CAP=14` (14 towers, all maxed) banks median 1,800 (p90 2,800) at
        waves 26-30 and wins 1/64; `CAP=18` ~1,000, 15/64. That gold is not unspendable: 56-73 cells stay open, and
        `EXPAND=1` (build again once all are maxed+specialized) turns it into wins: CAP 14 1 → 29/64, CAP 18 15 → 26/64,
        vs the default bot 16/64. So the lesson for coasting players is "keep building", not a missing sink. Side
        finding: max-first-then-expand beats the bot's build-wide plan (~45% vs ~25% wins); if humans find it, waves
        26-30 may need more teeth, so watch playtests before touching numbers.
  - [ ] Next ideas: owner feedback; maybe a late-game hint when gold sits unspent (> ~500 with open cells).
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
  - [x] Bot model refit (2026-11-13, no rules change). fit.ts now also fits 1500 random whole looms on waves 10/12/14
    (counts half), and the loom value is a power mean over foe kinds (`W.cover` 0.15) with a second Nova row at
    `W.novaStack` 0.07; arcs use MOD.stormDmg. Spearman rho per set (rows t1/1, t2/1, t2/2, looms): 0.911/0.764/0.764/
    0.639 → 0.904/0.809/0.768/0.782; probe.ts 2 rho 0.913 → 0.895. Smart bot 37% → 83% wins (200 seeds 85%; seeds
    101-200 87%), median wave 15 → won, every loss at the Lich (was spread over waves 10-15); favor bolt/beam/nova/
    rain/orb 46/43/24/35/36 → 90/75/91/84/71%. Drake leaks in 100 runs 1212 → 51 HP: the old bot stacked Novas and
    Fire (Drakes are fire-immune flyers) and never covered them. New tools: looms.ts, leaks.ts, tweak.ts (TWEAK in
    balance.ts too, plus foes/BUDGET/WAVE_TIME), BOTW for bot weights. Each part alone gives ~74-76%.
  - [x] Late Nova vs flyers: not a real hole. probe.ts's tier 3/2 nova 61/75 is its setup (one row beside two tier-1
    bolts; Novas never hit flyers, by design). Whole looms (looms.ts 3/2 12,14): the best loom with one Nova leaks 0
    like every caster's; only all-Nova looms leak (72: Drakes 57, Wisps 15). At 2/2 waves 12,14,15 one Nova + two
    bolts leaks Drakes 3 (as the best loom), its gap is the Lich. smart+nova wins 91%. Rules unchanged.
  - [ ] Owner decision: Glyphwright is much easier than the 37% figure said. If it should be harder, the refit bot's
    only wall is the Lich (BUDGET.square 0.5 → 71%, 0.6 → 67%; perWave 7 → 82%): look at late HP growth or the Lich.
    Also re-run sweep.ts (economy knobs were tuned with the old model). Does Bolt feel dominant late (owner)?
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
  - [x] Rewild fire too tame? Yes (measured with new `scripts/rewild/fire.ts`, greedy x64, ~1 lightning summer a
    game): v5 burnt anything in 9/64 lightning summers (21 cells in 64 games, all grass, never an animal), would
    have burnt ≥ 3 cells if ignored in 2/64, and the whole game scored −2.3 on average vs lightning-as-drought
    (random bot +0.4). Wildflowers and shrubs could never burn: they need moisture 1, so on bone-dry ground they
    withered below full size before the fire came. The bot island has only ~1.4 burnable cells per summer and the
    strike rarely reached them. Rules v6: fire catches within 3 cells of the strike, leaps gaps of one cell
    (spreads up to 2 away), burns grass/flowers/shrubs from half size (seedlings don't) unless a grazer cropped
    them that summer (so one deer still saves the cells it eats from), and animals caught in it die (bees and
    songbirds fly off). Greedy x64: burns in 29/64 summers (1.39 cells avg, max 15), ≥ 3 cells if ignored in
    12/64, the bot plays differently than in a drought in 24/64 (was 11), game score −13.5 mean (worst −286);
    random −24.9 (worst −474). Balance x32: greedy median 2333 → 2278 (stars 0/2/21/9 unchanged), random 987 → 941.
    Tried and dropped: size ≥ 2 alone (grazing no longer protected anything), reach 3 alone, longer ash.
  - [x] Rewild v6 blind playtest (2461/1787/2180; 2 lightning summers in 60 seasons, one burnt 9; "fair but blunt,
    the warning a season ahead is nearly invisible"). Rules v7: the season before shows "⚡ Lightning next summer"
    in the panel and a →⚡ on the weather chip, the bolt is drawn over plants and animals on a dark disc, tapping it
    says so, dashed flames show next summer's burn if nothing more is played (exact for that case), and cracks
    mark bone-dry soil. In the fire summer the fire's reach (`fireZone`) is outlined; animals never move or send
    young into it (no more wolves walking into the fire). ✖/⚠ lines always show first (⚠ names the cause, fire
    included), summary lines wrap, a dead species gets one cause in the report. "New hand" greys out but says why
    when tapped. Lightning 27% → 40% of summers from year 2 (drought 28% → 25%): 1.00 → 1.58 a game, games
    with one 48 → 61 of 64. Greedy x32 median 2306 (v6 2278, v5 2333), stars 0/1/23/8; x64 2295, 3★ 18/64;
    fire costs greedy −7 a game, random −34 (worst −553).
  - [ ] Next: third playtest of the fire warning; a lightning-summer goal or a reason to want fire (ash enriches).
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
- Delve depth 5 spike (rules v6). The probe now prints damage per depth by kind, killers per depth, each floor's monster
  mix and (`DEATHS=1`) how each death went. Finding (400 seeds): floor damage went d4 ~50 → d5 ~135 → d6-9 ~100-125, a step
  not a ramp: wraiths and cultists both debut at depth 5 (1.4 each, ~80 of the 135), and d5 killed 37 runs (d6 20) though
  bots arrive at full HP with 6 potions (most d5 deaths: out of potions; a few bursts of 2 cultists + an archer in line).
  Threats are readable (minimap shows awake foes, red edge arrows, the cultist's tell), so it was numbers, not clarity.
  Fix: a capped kind's first depth holds at most one (`floorCap`), so d5 has one wraith and one cultist (mostly both);
  Warden HP 420 → 450 keeps the overall win rate. 400 seeds: wins 55.8% → 56.3% (seeds 1-100: 58% → 58%), d5 deaths
  37 → 23, d6 20 → 11, d5 floor damage ~135 → ~108, Warden deaths 84 → 113. Depth 5 is still the deadliest ordinary
  floor (the first with three heavy kinds); next lever if humans stall there is ghoul count, not caps.
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
