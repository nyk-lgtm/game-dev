// Delve controller: input (buttons, swipes, keys), smooth step/turn animation,
// the ASCII view, minimap, HUD, menus and saving.

import { closeOverlay, showCard } from '../shared/cards';
import { dailySeed, leaveDaily, loadDaily, prettyDay, recordDaily, todayKey } from '../shared/daily';
import { copyText, toast } from '../shared/debug';
import { reducedFx } from '../shared/settings';
import { makeStore } from '../shared/storage';
import { DEATH_ART, LOGO, MONSTER_ART, ITEM_ART, VICTORY_ART } from './art';
import {
  ARMORS,
  BOLT_RANGE,
  DX,
  DY,
  MAX_DEPTH,
  MONSTERS,
  PLUS_ATK,
  PLUS_HP,
  RULES_VERSION,
  SHOP_DEPTHS,
  SIGHT,
  SIZE,
  SPELLS,
  WEAPONS,
  XP_TABLE,
  applyAction,
  attackOf,
  blinkReach,
  boltTarget,
  canBuy,
  canRest,
  defenceOf,
  doorNoises,
  encodeAction,
  foesInSight,
  frostHolds,
  idx,
  inWave,
  inWaveAt,
  inside,
  isLegal,
  los,
  newGame,
  offerName,
  opaqueTile,
  randomSeed,
  regenCap,
  replay,
  runScore,
  tileAt,
  type Action,
  type GameEvent,
  type GameState,
  type Monster,
  type MonsterKind,
  type SpellId,
} from './core';
import { castView, makeGrid, paintGrid, type Grid, type Pose, type Sprite } from './view';

const store = makeStore('delve.');
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const MONSTER_LOOK: Record<MonsterKind, { hue: number; sat: number; scale: number; lift?: number }> = {
  rat: { hue: 30, sat: 30, scale: 0.32 },
  bat: { hue: 280, sat: 25, scale: 0.28, lift: 0.35 },
  slime: { hue: 110, sat: 60, scale: 0.42 },
  thief: { hue: 150, sat: 25, scale: 0.7 },
  skeleton: { hue: 45, sat: 15, scale: 0.82 },
  archer: { hue: 45, sat: 22, scale: 0.82 },
  ghoul: { hue: 90, sat: 25, scale: 0.78 },
  wraith: { hue: 200, sat: 35, scale: 0.9, lift: 0.08 },
  mage: { hue: 0, sat: 55, scale: 0.85 },
  golem: { hue: 25, sat: 12, scale: 1.0 },
  warden: { hue: 280, sat: 30, scale: 1.25 },
};
const ITEM_HUE: Record<string, [number, number]> = { potion: [0, 70], ether: [215, 70], gold: [48, 90], weapon: [200, 15], armor: [200, 15], map: [40, 45] };
/** Map glyph and color per item kind. */
// Red is only for foes on the maps.
const ITEM_GLYPH: Record<string, [string, string]> = { potion: ['!', '#7fe08a'], ether: ['~', '#5ab4ff'], gold: ['$', '#ffd36b'], weapon: [')', '#c9d4e0'], armor: ['[', '#c9d4e0'], map: ['?', '#e8d7a8'] };

/** Minimap letters, one per monster kind. */
const MAP_GLYPH: Record<MonsterKind, string> = { rat: 'r', bat: 'b', slime: 'j', thief: 't', skeleton: 's', archer: 'a', ghoul: 'g', wraith: 'W', mage: 'c', golem: 'G', warden: 'X' };

/** How far the 3D view shows a foe (sleeping ones are marked on the maps this far). */
const VIEW_RANGE = 12;
/** What Descent+ changes, for its buttons. */
const PLUS_TEXT = `foes +${Math.round((PLUS_HP - 1) * 100)}% HP, +${PLUS_ATK} damage`;

const angleOf = (dir: number) => ((dir - 1) * Math.PI) / 2;
/** The spell menu's fixed slots: each spell keeps its place, new ones are added below. */
const SPELL_ORDER: SpellId[] = ['fire', 'frost', 'heal', 'blink'];

interface SavedRun {
  seed: number;
  actions: string;
  v: number;
  /** The day (YYYY-MM-DD) when this is a daily descent. */
  day?: string | null;
  /** Depth reached, for the title screen (saves replaying the run to show it). */
  depth?: number;
  /** Descent+ (harder foes). */
  plus?: boolean;
}

/** Floating text over the view (damage numbers and the like). */
interface Popup {
  text: string;
  color: string;
  /** Anchor as a fraction of the view's rows / cols. */
  row: number;
  col: number;
  t: number;
}

export class Game {
  state!: GameState;
  private run!: SavedRun;
  private view: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private mapCtx: CanvasRenderingContext2D;
  private grid: Grid = makeGrid(1, 1);
  private font = '';
  private cw = 8;
  private chh = 13;
  private vw = 0;
  private vh = 0;
  private pose: Pose = { x: 0, y: 0, a: 0 };
  private anim: { from: Pose; to: Pose; t: number; dur: number } | null = null;
  private queued: Action | null = null;
  private flash = new Map<number, number>();
  private hurtFlash = 0;
  private swing = 0;
  private bolt: { t: number; color: string } | null = null;
  private bump = 0;
  /** A short sideways shake (bumping a wall), skipped with reduced effects. */
  private shake = 0;
  private last = 0;
  /** Viewing a ?seed=&a= replay link: never touches the saved run or records. */
  private replaying = false;
  /** Something changed that the idle (torch-rate) redraw wouldn't pick up soon enough. */
  private dirty = true;
  private lastTick = -1;
  private popups: Popup[] = [];
  /** The monster you last struck, kept on the foe bar for a moment. */
  private lastFoe: { id: number; t: number } | null = null;
  private dailyResult: ReturnType<typeof recordDaily> | null = null;

  constructor() {
    this.view = $<HTMLCanvasElement>('view');
    this.ctx = this.view.getContext('2d', { alpha: false })!;
    this.mapCtx = $<HTMLCanvasElement>('map').getContext('2d')!;
    addEventListener('resize', () => this.resize());
    this.bindInput();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------- lifecycle ----------

  /** Start (or restore) a run. With `replayLink`, the run is a bug-report replay and is never saved. */
  start(seed: number, actions = '', replayLink = false, day: string | null = null, plus = false): void {
    let s: GameState;
    let note = replayLink ? 'Replay: progress here is not saved' : '';
    if (day) plus = false;
    try {
      s = replay(seed, actions, plus);
    } catch (err) {
      note = `${replayLink ? 'Replay' : 'Saved run'} failed (${err instanceof Error ? err.message : String(err)}); seed ${seed} from the start`;
      actions = '';
      s = newGame(seed, plus);
    }
    if (note) toast(note);
    this.replaying = replayLink;
    this.run = { seed, actions, v: RULES_VERSION, day, ...(plus ? { plus } : {}) };
    this.dailyResult = null;
    this.popups = [];
    this.lastFoe = null;
    if (!day) leaveDaily();
    else if (!actions) toast(`Daily descent · ${prettyDay(day)}`);
    this.state = s;
    this.snapPose();
    this.resize();
    this.dirty = true;
    this.persist();
    this.refresh();
    if (s.status !== 'playing') this.showEnd();
    else if (s.shop) this.showShop();
  }

  /** Today's daily descent: resume it if started, else begin it. */
  playDaily(): void {
    closeOverlay();
    const day = todayKey();
    const saved = store.load<SavedRun | null>('dailyRun', null);
    if (saved && saved.day === day && saved.v === RULES_VERSION) this.start(saved.seed, saved.actions, false, day);
    else this.start(dailySeed('delve', day), '', false, day);
  }

  private persist(): void {
    if (this.replaying) return;
    this.run.depth = this.state.depth;
    store.save(this.run.day ? 'dailyRun' : 'run', this.state.status === 'playing' ? this.run : null);
    const best = store.load<number>('best', 0);
    if (this.state.depth > best) store.save('best', this.state.depth);
  }

  /** Records for a run that just ended (called once, when it ends). */
  private recordEnd(): { score: number; newBest: boolean } {
    const s = this.state;
    const score = runScore(s);
    if (this.replaying) return { score, newBest: false };
    if (s.status === 'won') store.save(s.plus ? 'winsPlus' : 'wins', store.load<number>(s.plus ? 'winsPlus' : 'wins', 0) + 1);
    const best = store.load<number>('bestScore', 0);
    if (score > best) store.save('bestScore', score);
    if (this.run.day) this.dailyResult = recordDaily(store, score, `${score} · ${s.status === 'won' ? 'won' : `depth ${s.depth}`}`, this.run.day);
    return { score, newBest: score > best };
  }

  private snapPose(): void {
    const p = this.state.player;
    this.pose = { x: p.x + 0.5, y: p.y + 0.5, a: angleOf(p.dir) };
    this.anim = null;
  }

  // ---------- input ----------

  private bindInput(): void {
    for (const b of document.querySelectorAll<HTMLButtonElement>('#pad button')) {
      b.addEventListener('click', () => {
        const a = b.dataset.a!;
        if (a === 'magic') this.showSpells();
        else if (a === 'map') this.showMap();
        else if (a === 'wait') this.waitOrRest();
        else this.act({ type: a } as Action);
      });
    }
    // Swipes on the view: up/down step, left/right turn, tap = use.
    let start: { x: number; y: number; t: number } | null = null;
    this.view.addEventListener('pointerdown', (e) => (start = { x: e.clientX, y: e.clientY, t: performance.now() }));
    this.view.addEventListener('pointercancel', () => (start = null));
    $('map').addEventListener('click', () => this.showMap());
    this.view.addEventListener('pointerup', (e) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      start = null;
      const m = Math.hypot(dx, dy);
      if (m < 18) return this.act({ type: 'use' });
      if (Math.abs(dx) > Math.abs(dy)) this.act({ type: dx < 0 ? 'right' : 'left' });
      else this.act({ type: dy < 0 ? 'forward' : 'back' });
    });
    addEventListener('keydown', (e) => {
      const map: Record<string, Action['type']> = {
        arrowup: 'forward', w: 'forward', arrowdown: 'back', s: 'back',
        arrowleft: 'left', arrowright: 'right', q: 'strafeL', e: 'strafeR', a: 'strafeL', d: 'strafeR',
        ' ': 'use', enter: 'use', '.': 'wait', p: 'potion', r: 'read',
      };
      const t = map[e.key.toLowerCase()];
      if (t === 'wait') this.waitOrRest();
      else if (t) this.act({ type: t } as Action);
      if (e.key.toLowerCase() === 'm' && $('overlay').hidden && this.state) this.showMap();
      if (e.key.toLowerCase() === 'f') this.act({ type: 'cast', spell: 'fire' });
    });
  }

  act(a: Action, fromCard = false): void {
    if ((!fromCard && !$('overlay').hidden) || !this.state) return;
    if (this.anim) {
      this.queued = a;
      return;
    }
    if (!isLegal(this.state, a)) {
      if (a.type === 'potion' || a.type === 'ether') toast(this.state.player[a.type === 'potion' ? 'potions' : 'ethers'] ? (a.type === 'potion' ? 'Already at full health' : 'MP is already full') : `No ${a.type}s left`);
      else if (a.type === 'cast') toast('Not enough MP');
      else if (a.type === 'read') toast(this.state.player.scrolls ? 'This floor is already mapped' : 'No scrolls of seeing');
      return;
    }
    // A bolt with nothing in reach, or a Blink with no room, costs nothing: say so here rather than record a no-op.
    if (a.type === 'cast' && (a.spell === 'fire' || a.spell === 'frost') && !boltTarget(this.state).m) {
      toast(`Nothing to hit within ${BOLT_RANGE} cells ahead (no MP spent)`);
      return;
    }
    const aim = boltTarget(this.state).m;
    if (a.type === 'cast' && a.spell === 'frost' && aim && !frostHolds(aim)) {
      toast(aim.charge ? "It's drawing in the cold: Frost won't hold it now (no MP spent)" : "Frost holds the Warden only once between waves (no MP spent)");
      return;
    }
    if (a.type === 'cast' && a.spell === 'blink' && !blinkReach(this.state)) {
      toast('No room to blink ahead (no MP spent)');
      return;
    }
    const before = this.state;
    const { state, events } = applyAction(before, a);
    // The stairs: ask before going down (there is no way back up), unless told not to.
    if (!fromCard && events.some((e) => e.type === 'descend') && !store.load<boolean>('noDescendAsk', false)) {
      const go = () => (closeOverlay(), this.commit(a, state, events));
      showCard(
        `<h2>Stairs down</h2><p>Go down to depth ${state.depth}? There is no way back up. You catch your breath on the stairs (+15% HP).</p>${
          state.depth === MAX_DEPTH
            ? '<p><b style="color:#ff8a6a">The Warden waits below.</b> Rest to full and keep your potions and MP for it. When it draws in the cold, step out of its row and column (or behind a pillar), then strike while it is spent.</p>'
            : ''
        }`,
        [
          { label: `Descend to depth ${state.depth}`, primary: true, onClick: go },
          { label: 'Not yet', onClick: closeOverlay },
          { label: 'Descend, and stop asking', onClick: () => (store.save('noDescendAsk', true), go()) },
        ],
      );
      return;
    }
    this.commit(a, state, events);
  }

  private commit(a: Action, state: GameState, events: GameEvent[]): void {
    this.run.actions += encodeAction(a);
    this.state = state;
    this.react(events);
    this.persist();
    this.refresh();
    this.dirty = true;
  }

  /** WAIT, or (with nothing awake in sight and something to gain) REST: wait turn after turn. */
  private waitOrRest(): void {
    if (!this.state || !$('overlay').hidden) return;
    if (this.anim || !canRest(this.state)) return this.act({ type: 'wait' });
    let s = this.state;
    const p0 = { hp: s.player.hp, mp: s.player.mp };
    const seen = new Set(s.monsters.filter((m) => this.inSight(m, s)).map((m) => m.id));
    let turns = 0;
    let why = '';
    let hurtEvents: GameEvent[] = [];
    while (canRest(s) && turns < 400) {
      const r = applyAction(s, { type: 'wait' });
      s = r.state;
      turns++;
      this.run.actions += 'w';
      const hurt = r.events.find((e): e is Extract<GameEvent, { type: 'hurt' }> => e.type === 'hurt');
      if (hurt) {
        why = `${MONSTERS[hurt.by].name} attacks!`;
        hurtEvents = r.events;
        break;
      }
      const foe = foesInSight(s)[0] ?? s.monsters.find((m) => !seen.has(m.id) && this.inSight(m, s));
      if (foe) {
        why = `${MONSTERS[foe.kind].name} ${foe.awake ? 'appears' : 'comes into view'}!`;
        break;
      }
    }
    this.state = s;
    if (hurtEvents.length) this.react(hurtEvents);
    const p = s.player;
    const gain = [p.hp > p0.hp ? `+${p.hp - p0.hp} HP` : '', p.mp > p0.mp ? `+${p.mp - p0.mp} MP` : ''].filter(Boolean).join(', ');
    const capped = !why && p.hp >= regenCap(s) && p.hp < p.maxHp ? ' Rest heals to half; potions and Mend do the rest.' : '';
    toast(why ? `Rest broken after ${turns} turns${gain ? ` (${gain})` : ''}: ${why}` : `Rested ${turns} turns${gain ? `: ${gain}` : ''}.${capped}`);
    // A line in the log too (shown only: the log is rebuilt from the run on reload).
    s.log.push(`You rest ${turns} turn${turns > 1 ? 's' : ''}${gain ? `: ${gain}` : ''}.${why ? ` ${why}` : ''}`);
    if (s.log.length > 30) s.log.splice(0, s.log.length - 30);
    this.persist();
    this.refresh();
    this.dirty = true;
  }

  private pop(text: string, color: string, row: number, col = 0.5): void {
    if (this.popups.length > 6) this.popups.shift();
    this.popups.push({ text, color, row, col, t: 0 });
  }

  private react(events: GameEvent[]): void {
    const s = this.state;
    const p = s.player;
    const descended = events.some((e) => e.type === 'descend');
    if (descended) this.snapPose();
    else {
      const to = { x: p.x + 0.5, y: p.y + 0.5, a: angleOf(p.dir) };
      // Turn the short way round.
      let da = to.a - this.pose.a;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      to.a = this.pose.a + da;
      const moved = to.x !== this.pose.x || to.y !== this.pose.y || Math.abs(da) > 1e-3;
      if (moved) this.anim = { from: { ...this.pose }, to, t: 0, dur: Math.abs(da) > 1e-3 ? 0.13 : 0.15 };
    }
    for (const e of events) {
      switch (e.type) {
        case 'hit':
          this.flash.set(e.target, 0.18);
          this.swing = 1;
          this.lastFoe = { id: e.target, t: 2.5 };
          this.pop(e.crit ? `CRIT ${e.dmg}!` : String(e.dmg), e.crit ? '#ffd23a' : '#ffffff', 0.3, 0.5 + (((e.target * 7 + s.turn) % 5) - 2) * 0.03);
          break;
        case 'miss':
          this.swing = 1;
          this.lastFoe = { id: e.target, t: 2.5 };
          this.pop('miss', '#9a9080', 0.3);
          break;
        case 'hurt':
          this.hurtFlash = 1;
          this.pop(`-${e.dmg}`, '#ff4d4d', 0.62, 0.5);
          navigator.vibrate?.(30);
          break;
        case 'stolen':
          this.pop(`-${e.gold} GOLD`, '#ffd36b', 0.5);
          toast('A cutpurse took your gold! Catch it before it gets away.');
          break;
        case 'kill':
          this.pop(e.kind === 'warden' ? 'THE WARDEN FALLS' : `${MONSTERS[e.kind].name.toUpperCase()} SLAIN`, '#ffb347', 0.18);
          break;
        case 'pickup':
          this.pop(`+ ${e.text.replace(/^(a|an) /, '').replace(/\..*$/, '').replace(/ \(.*\)$/, '')}`, '#ffe08a', 0.45);
          break;
        case 'shop':
          setTimeout(() => this.state.shop && this.showShop(), 350);
          break;
        case 'bump':
          if (e.what === 'air') this.swing = 1;
          else if (e.what === 'wall') {
            if (!reducedFx()) {
              this.bump = 1;
              this.shake = 1;
              navigator.vibrate?.(12);
            }
          }
          break;
        case 'reveal':
          toast('The floor unfolds in your mind');
          break;
        case 'bolt':
          if (e.spell === 'heal') break;
          this.bolt = { t: 0, color: e.spell === 'fire' ? '#ff8a3d' : e.spell === 'frost' ? '#7fe3ff' : '#c9a6ff' };
          break;
        case 'charge':
          navigator.vibrate?.([20, 40, 20]);
          break;
        case 'summon':
          // Low in the view, clear of the Warden's name and health bar.
          this.pop('THE DEAD RISE!', '#c9a6ff', 0.6);
          navigator.vibrate?.(40);
          break;
        case 'levelUp':
          toast(`Level ${e.level}!`);
          navigator.vibrate?.(20);
          break;
        case 'descend':
          toast(e.depth === MAX_DEPTH ? 'The deepest hall' : `Depth ${e.depth}`);
          break;
        case 'death':
        case 'win': {
          const rec = this.recordEnd();
          setTimeout(() => this.showEnd(rec.newBest), 700);
          break;
        }
      }
    }
  }

  // ---------- screens ----------

  private showSpells(): void {
    const p = this.state.player;
    const known = SPELL_ORDER.filter((id) => p.spells.includes(id));
    const target = boltTarget(this.state);
    const hop = blinkReach(this.state);
    const bolt = (id: SpellId) => id === 'fire' || id === 'frost';
    const note = (id: SpellId) => {
      if (id === 'blink') return hop ? ` Lands ${hop} cell${hop > 1 ? 's' : ''} ahead.` : ' Blocked: no room ahead.';
      if (!bolt(id)) return '';
      if (!target.m) return ' Nothing in reach.';
      if (id === 'frost' && !frostHolds(target.m)) return target.m.charge ? " Won't hold the Warden while it draws in the cold." : ' Already used on the Warden since its last wave.';
      return ` Target: ${MONSTERS[target.m.kind].name}, ${target.dist} ahead.`;
    };
    const opts = known.map((id) => ({
      label: `${SPELLS[id].name} (${SPELLS[id].cost} MP) - ${SPELLS[id].desc}${note(id)}`,
      onClick: () => {
        closeOverlay();
        this.act({ type: 'cast', spell: id });
      },
    }));
    showCard(`<h2>Spells</h2><p>MP ${p.mp}/${p.maxMp}. New spells come with levels. Bolts reach ${BOLT_RANGE} cells ahead and cost nothing when there is nothing to hit.</p>`, [...opts, { label: 'Cancel', onClick: closeOverlay }]);
    document.querySelectorAll<HTMLButtonElement>('#overlay .card button').forEach((b, i) => {
      const id = known[i];
      if (id) b.disabled = !isLegal(this.state, { type: 'cast', spell: id }) || (bolt(id) && !target.m) || (id === 'frost' && !!target.m && !frostHolds(target.m)) || (id === 'blink' && !hop);
    });
  }

  showTitle(): void {
    leaveDaily();
    const best = store.load<number>('best', 0);
    const bestScore = store.load<number>('bestScore', 0);
    const wins = store.load<number>('wins', 0);
    const winsPlus = store.load<number>('winsPlus', 0);
    const saved = store.load<SavedRun | null>('run', null);
    const canResume = saved && saved.v === RULES_VERSION;
    const daily = loadDaily(store);
    const dailyRun = store.load<SavedRun | null>('dailyRun', null);
    const dailyOn = dailyRun && dailyRun.day === todayKey() && dailyRun.v === RULES_VERSION;
    const records = [best ? `Deepest: ${best}` : '', bestScore ? `Best score: ${bestScore}` : '', wins ? `Wins: ${wins}` : '', winsPlus ? `Descent+ wins: ${winsPlus}` : ''].filter(Boolean).join(' · ');
    showCard(
      `<pre>${LOGO.join('\n')}</pre><p style="text-align:center">Ten floors down, the Warden waits.</p>${records ? `<p class="meta">${records}</p>` : ''}`,
      [
        ...(canResume ? [{ label: `Continue${saved!.plus ? ' Descent+' : ''}${saved!.depth ? ` (depth ${saved!.depth})` : ''}`, primary: true, onClick: () => (closeOverlay(), this.start(saved!.seed, saved!.actions, false, null, !!saved!.plus)) }] : []),
        { label: 'New descent', primary: !canResume, onClick: () => (closeOverlay(), this.start(randomSeed())) },
        // A win unlocks Descent+: the same deep with tougher foes.
        ...(wins || winsPlus ? [{ label: `New Descent+ (${PLUS_TEXT})`, onClick: () => (closeOverlay(), this.start(randomSeed(), '', false, null, true)) }] : []),
        { label: dailyOn ? `Continue daily descent (depth ${dailyRun!.depth ?? 1})` : `Daily descent · ${daily ? `best ${daily.label}` : 'not played'}`, onClick: () => this.playDaily() },
        { label: 'How to play', onClick: () => this.showHelp() },
        { label: 'All games', onClick: () => (location.href = '../') },
      ],
      false,
    );
  }

  showHelp(fromMenu = false): void {
    showCard(
      `<h2>How to play</h2><ul>
      <li><b>FWD / BACK / STEP</b> move one cell. <b>TURN</b> is free; everything else takes a turn.</li>
      <li>Or swipe on the view: up/down to step; swipe left/right to turn, as if dragging the view (swipe left to look right); tap to hit or open doors.</li>
      <li>Bumping a door opens it without stepping through, so you can look before you go in. Descending the stairs restores a little HP.</li>
      <li>Walk into a monster (or press <b>HIT</b>) to attack. The bar at the top of the view shows the foe in front of you.</li>
      <li>Red arrows at the edges of the view warn of foes beside or behind you: turn to face them. Monsters only strike from straight beside you, and lose a turn when they first notice you.</li>
      <li>A <b style="color:#ffb347">?</b> on a door means you hear something behind it. Cultists are spent for a turn after each firebolt: close in or step out of line. Sleeping foes show <b style="color:#8fb8ff">zZ</b>.</li>
      <li><b>CAST</b> spells with MP (it slowly comes back): Firebolt from the start, Frost at level 3, Mend at 5, Blink at 7. Bolts reach ${BOLT_RANGE} cells.</li>
      <li>With nothing awake in sight, wounds slowly close, up to half your health. <b>WAIT</b> turns into <b>REST</b> then: it waits until you're healed and your MP is full, or something shows up.</li>
      <li>The Warden draws in the cold before each wave, which rolls down its row and column: step out of line, or behind a pillar. After a wave it is spent for a turn.</li>
      <li>Monsters act only when you do. Archers and cultists shoot down straight corridors.</li>
      <li>Find the stairs (<b>&gt;</b>) on each floor. Floor 10 holds the Warden.</li>
      <li>Gather gold: a merchant waits on floors ${SHOP_DEPTHS.join(' and ')} with potions, gear and vigor.</li>
      <li><b>MAP</b> (or tap the minimap) shows the whole floor you've seen. Scrolls of seeing are kept: read one from the map to reveal the floor.</li></ul>`,
      [{ label: 'Back', primary: true, onClick: () => (fromMenu ? this.showMenu() : this.showTitle()) }],
      false,
    );
  }

  showMenu(): void {
    const s = this.state;
    if (!s) return;
    showCard(
      `<h2>Depth ${s.depth}${this.run.day ? ' · daily' : s.plus ? ' · Descent+' : ''}</h2><p>Turn ${s.turn} · ${s.kills} kills · ${s.player.gold} gold · score ${runScore(s)}</p>`,
      [
        { label: 'Resume', primary: true, onClick: closeOverlay },
        { label: 'How to play', onClick: () => this.showHelp(true) },
        { label: 'Copy bug report', onClick: () => this.copyReport() },
        { label: 'Abandon descent', onClick: () => (this.replaying || store.save(this.run.day ? 'dailyRun' : 'run', null), this.showTitle()) },
        { label: 'All games', onClick: () => (location.href = '../') },
      ],
    );
  }

  private showEnd(newBest = false): void {
    const s = this.state;
    const won = s.status === 'won';
    const score = runScore(s);
    const cause = won ? 'You struck down the Warden.' : s.killer ? `Slain by ${MONSTERS[s.killer].name.startsWith('The ') ? MONSTERS[s.killer].name.toLowerCase() : `a ${MONSTERS[s.killer].name.toLowerCase()}`} on depth ${s.depth}.` : `Fell on depth ${s.depth}.`;
    const day = this.run.day;
    const dailyLine = day ? `<p style="text-align:center"><b>Daily descent · ${prettyDay(day)}</b><br>${this.dailyResult?.improved ? 'New best for today!' : `Today's best: ${loadDaily(store, day)?.score ?? score}`}</p>` : '';
    showCard(
      `<pre>${(won ? VICTORY_ART : DEATH_ART).join('\n')}</pre><h2 style="text-align:center">${won ? 'The deep is quiet' : 'Lost in the dark'}</h2>
      <p style="text-align:center">${cause}</p>
      <p style="text-align:center">Score <b>${score}</b>${newBest ? ' · <b>new best!</b>' : ''}</p>
      <p style="text-align:center">Level ${s.player.level} · ${s.kills} kills · ${s.player.gold} gold · ${s.turn} turns${s.plus ? ' · Descent+' : ''}</p>${won && !s.plus && !this.replaying ? '<p style="text-align:center">Descent+ is open: the same deep with tougher foes.</p>' : ''}${dailyLine}`,
      [
        { label: s.plus ? 'New Descent+' : 'New descent', primary: true, onClick: () => (closeOverlay(), this.start(randomSeed(), '', false, null, !!s.plus)) },
        ...(won && !s.plus && !this.replaying ? [{ label: `Try Descent+ (${PLUS_TEXT})`, onClick: () => (closeOverlay(), this.start(randomSeed(), '', false, null, true)) }] : []),
        ...(day && !this.replaying ? [{ label: 'Retry today’s descent', onClick: () => (closeOverlay(), this.start(dailySeed('delve', day), '', false, day)) }] : []),
        { label: 'Title', onClick: () => this.showTitle() },
      ],
      false,
    );
  }

  /** The merchant's stall: buy what you can afford, then move on. */
  private showShop(): void {
    const s = this.state;
    if (!s.shop) return;
    const p = s.player;
    const owned = (kind: string, v: number) => (kind === 'weapon' && v <= p.weapon) || (kind === 'armor' && v <= p.armor);
    const opts = s.shop.map((o, i) => ({
      label: o.sold ? `${offerName(o)} - sold` : `${offerName(o)} - ${o.price}g${owned(o.kind, o.value) ? ' (you have as good)' : ''}`,
      onClick: () => {
        this.act({ type: 'buy', slot: i }, true);
        navigator.vibrate?.(15);
        this.showShop();
      },
    }));
    showCard(
      `<h2>The merchant</h2><p>"Coin for comfort, delver." You have <b>${p.gold}</b> gold.</p><p class="meta">ATK ${attackOf(s)} · DEF ${defenceOf(s)} · HP ${p.hp}/${p.maxHp} · ${p.potions} potion${p.potions === 1 ? '' : 's'} · ${p.ethers} ether${p.ethers === 1 ? '' : 's'}</p>`,
      [...opts, { label: 'Move on', primary: true, onClick: () => (this.act({ type: 'leave' }, true), closeOverlay()) }],
      false,
    );
    document.querySelectorAll<HTMLButtonElement>('#overlay .card button').forEach((b, i) => {
      if (i < s.shop!.length) b.disabled = !canBuy(s, s.shop![i]);
    });
  }

  /** The whole floor as far as you've seen it. */
  private showMap(): void {
    const s = this.state;
    if (!s || s.shop) return;
    const scrolls = s.player.scrolls;
    const canRead = isLegal(s, { type: 'read' });
    showCard(
      `<h2>Depth ${s.depth}</h2><canvas id="fullMap" style="width:100%;aspect-ratio:1;display:block"></canvas><p class="meta"><b style="color:#5ee7ff">@</b> you (the notch shows your facing) · <b style="color:#ffb347">&gt;</b> stairs · + door (<b style="color:#ffb347">?</b> something behind it) · O pillar · <b style="color:#7fe08a">!</b> potion · <b style="color:#5ab4ff">~</b> ether · $ gold · ) [ gear · ? scroll · <b style="color:#ff4d4d">red letters</b>: foes in sight (<b style="color:#b07a88">dim</b>: asleep)</p>`,
      [
        ...(scrolls ? [{ label: canRead ? `Read a scroll of seeing (${scrolls})` : `Scrolls of seeing: ${scrolls} (this floor is mapped)`, onClick: () => (closeOverlay(), this.act({ type: 'read' })) }] : []),
        { label: 'Close', primary: true, onClick: closeOverlay },
      ],
    );
    if (scrolls && !canRead) (document.querySelector('#overlay .card button') as HTMLButtonElement).disabled = true;
    const c = $<HTMLCanvasElement>('fullMap');
    const css = c.clientWidth || 300;
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = Math.round(css * dpr);
    c.height = Math.round(css * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Frame what you've seen (at least 13 cells across) so early floors aren't specks.
    let x0 = SIZE, y0 = SIZE, x1 = 0, y1 = 0;
    for (let k = 0; k < SIZE * SIZE; k++)
      if (s.level.seen[k]) {
        const x = k % SIZE;
        const y = (k / SIZE) | 0;
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    const span = Math.min(SIZE, Math.max(13, x1 - x0 + 3, y1 - y0 + 3));
    const cx = Math.round((x0 + x1) / 2 - span / 2);
    const cy = Math.round((y0 + y1) / 2 - span / 2);
    this.paintMap(ctx, css, cx, cy, span, true);
  }

  private async copyReport(): Promise<void> {
    const text = `DELVE build=${__BUILD_ID__} rules=${RULES_VERSION} seed=${this.run.seed}${this.run.plus ? ' plus=1' : ''} a=${this.run.actions || '-'} ua="${navigator.userAgent}"`;
    toast((await copyText(text)) ? 'Bug report copied' : 'Copy failed');
  }

  // ---------- HUD ----------

  private refresh(): void {
    const s = this.state;
    const p = s.player;
    $('hpFill').style.width = `${(100 * p.hp) / p.maxHp}%`;
    $('hpText').textContent = `HP ${p.hp}/${p.maxHp}`;
    $('mpFill').style.width = `${(100 * p.mp) / p.maxMp}%`;
    $('mpText').textContent = `MP ${p.mp}/${p.maxMp}`;
    $('depth').textContent = `D${s.depth}`;
    $('potCount').textContent = String(p.potions);
    $('ethCount').textContent = String(p.ethers);
    // Two-digit counts get a narrower label so the button never wraps.
    document.querySelector('#pad [data-a=potion]')!.classList.toggle('tight', p.potions > 9);
    document.querySelector('#pad [data-a=ether]')!.classList.toggle('tight', p.ethers > 9);
    $('scrollCount').textContent = p.scrolls ? ` ?${p.scrolls}` : '';
    $('hpFill').parentElement!.classList.toggle('low', p.hp < p.maxHp * 0.3);
    // The Warden's wave is coming and you're in its line: the whole view pulses.
    const wave = s.status === 'playing' ? s.monsters.find((m) => m.kind === 'warden' && m.charge) : undefined;
    $('viewBox').classList.toggle('wave', !!wave && inWave(s, wave));
    $('viewBox').classList.toggle('calm', reducedFx());
    document.querySelector('#pad [data-a=potion]')!.classList.toggle('dim', !isLegal(s, { type: 'potion' }));
    document.querySelector('#pad [data-a=ether]')!.classList.toggle('dim', !isLegal(s, { type: 'ether' }));
    document.querySelector('#pad [data-a=magic]')!.classList.toggle('dim', !s.player.spells.some((id) => isLegal(s, { type: 'cast', spell: id })));
    const rest = canRest(s);
    const waitBtn = document.querySelector<HTMLButtonElement>('#pad [data-a=wait]')!;
    waitBtn.textContent = rest ? 'REST' : 'WAIT';
    waitBtn.classList.toggle('rest', rest);
    this.refreshFoe();
    const next = XP_TABLE[p.level];
    $('stats').innerHTML = `LV <b>${p.level}</b> XP ${p.xp}${next ? '/' + next : ''} · ATK <b>${attackOf(s)}</b> DEF <b>${defenceOf(s)}</b><br>${WEAPONS[p.weapon]} · ${ARMORS[p.armor]} · <b>${p.gold}</b>g${p.scrolls ? ` · ${p.scrolls} scroll${p.scrolls > 1 ? 's' : ''}` : ''}`;
    $('log').innerHTML = s.log
      .slice(-4)
      .map((l) => `<div>${l.replace(/</g, '&lt;')}</div>`)
      .join('');
  }

  /** The monster straight ahead in sight (or the one you just struck). */
  private foe(): Monster | null {
    const s = this.state;
    const p = s.player;
    for (let d = 1; d <= VIEW_RANGE; d++) {
      const x = p.x + DX[p.dir] * d;
      const y = p.y + DY[p.dir] * d;
      const m = s.monsters.find((o) => o.hp > 0 && o.x === x && o.y === y);
      if (m) return m;
      if (opaqueTile(tileAt(s, x, y))) break;
    }
    if (this.lastFoe) return s.monsters.find((o) => o.id === this.lastFoe!.id && o.hp > 0) ?? null;
    return null;
  }

  private foeKey = '';
  private refreshFoe(): void {
    const m = this.state.status === 'playing' ? this.foe() : null;
    const key = m ? `${m.id}:${m.hp}:${m.awake}:${m.stun}:${m.charge ?? 0}:${m.cd ?? 0}:${this.state.player.x},${this.state.player.y}` : '';
    if (key === this.foeKey) return;
    this.foeKey = key;
    const el = $('foe');
    el.hidden = !m;
    if (!m) return;
    const def = MONSTERS[m.kind];
    const tags = [m.stun > 0 ? `frozen ${m.stun}` : '', def.range ? 'ranged' : '', def.ghost ? 'walks through walls' : '', def.slow ? 'slow' : ''].filter(Boolean).join(' · ');
    $('foeName').textContent = def.name;
    $('foeZ').hidden = m.awake;
    $('foeHp').textContent = `${Math.max(0, m.hp)}/${m.maxHp}`;
    $('foeFill').style.width = `${(100 * Math.max(0, m.hp)) / m.maxHp}%`;
    // The Warden's tells come first: they decide your next move.
    const warn = m.charge ? (inWave(this.state, m) ? 'DRAWING IN THE COLD: get out of its row and column!' : 'Drawing in the cold: stay out of its row and column.') : m.cd ? 'Spent: strike now, or heal.' : '';
    const note = $('foeNote');
    note.textContent = warn || (tags ? `(${tags}) ${def.blurb}` : def.blurb);
    note.classList.toggle('warn', !!warn);
  }

  // ---------- rendering ----------

  private resize(): void {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = this.view.parentElement!.clientWidth;
    // The view takes most of the width as a 4:3 window, leaving the deck (minimap
    // and log) at least DECK_MIN px on short screens.
    const DECK_MIN = 130;
    const room = $('pad').getBoundingClientRect().top - this.view.parentElement!.getBoundingClientRect().top;
    const h = Math.round(Math.max(120, Math.min(w * 1.0, innerHeight * 0.5, room - DECK_MIN)));
    this.vw = w;
    this.vh = h;
    this.view.style.height = `${h}px`;
    this.view.width = Math.round(w * dpr);
    this.view.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // ~60 columns of text across.
    this.chh = Math.max(8, Math.floor(w / 60 / 0.6));
    this.font = `700 ${this.chh}px ui-monospace, 'Cascadia Mono', 'Roboto Mono', 'Droid Sans Mono', 'DejaVu Sans Mono', Menlo, monospace`;
    this.ctx.font = this.font;
    this.cw = this.ctx.measureText('M').width;
    this.grid = makeGrid(Math.floor(w / this.cw), Math.floor(h / this.chh));
    const mc = $<HTMLCanvasElement>('map');
    mc.width = Math.round(150 * dpr);
    mc.height = Math.round(150 * dpr);
    // Drawn at 150 px; shown smaller when the deck is short, so it's never cut off.
    const ms = Math.max(90, Math.min(150, room - h - 16));
    mc.style.width = mc.style.height = `${ms}px`;
    this.mapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dirty = true;
  }

  private frame(t: number): void {
    requestAnimationFrame((tt) => this.frame(tt));
    const dt = Math.min(0.1, (t - (this.last || t)) / 1000);
    this.last = t;
    if (!this.state) return;
    // Redraw every frame only while something moves; otherwise at the torch's
    // flicker rate (10 Hz), which is all an idle view changes by.
    const busy = !!this.anim || this.flash.size > 0 || this.hurtFlash > 0 || this.swing > 0 || this.bump > 0 || this.shake > 0 || !!this.bolt || this.popups.length > 0;
    if (this.lastFoe && (this.lastFoe.t -= dt) <= 0) {
      this.lastFoe = null;
      this.refreshFoe();
    }
    const tick = Math.floor(t / 100);
    if (!busy && !this.dirty && tick === this.lastTick) return;
    this.lastTick = tick;
    this.dirty = false;
    if (this.anim) {
      const a = this.anim;
      a.t += dt / a.dur;
      const k = Math.min(1, a.t);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      this.pose = { x: a.from.x + (a.to.x - a.from.x) * e, y: a.from.y + (a.to.y - a.from.y) * e, a: a.from.a + (a.to.a - a.from.a) * e };
      if (k >= 1) {
        this.anim = null;
        this.snapPose();
        const q = this.queued;
        this.queued = null;
        if (q) this.act(q);
      }
    }
    for (const [id, v] of this.flash) {
      if (v - dt <= 0) this.flash.delete(id);
      else this.flash.set(id, v - dt);
    }
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3);
    this.swing = Math.max(0, this.swing - dt * 5);
    this.bump = Math.max(0, this.bump - dt * 6);
    this.shake = Math.max(0, this.shake - dt * 4);
    if (this.bolt) {
      this.bolt.t += dt * 4;
      if (this.bolt.t >= 1) this.bolt = null;
    }
    for (const p of this.popups) p.t += dt;
    if (this.popups.length && this.popups[0].t > 0.9) this.popups = this.popups.filter((p) => p.t <= 0.9);
    this.draw(t / 1000);
  }

  private sprites(): Sprite[] {
    const s = this.state;
    const out: Sprite[] = [];
    for (const m of s.monsters) {
      const look = MONSTER_LOOK[m.kind];
      out.push({ x: m.x + 0.5, y: m.y + 0.5, art: MONSTER_ART[m.kind], scale: look.scale, hue: look.hue, sat: look.sat, lift: look.lift, flash: this.flash.has(m.id), frozen: m.stun > 0, foe: true, asleep: !m.awake });
    }
    for (const it of s.items) {
      const [hue, sat] = ITEM_HUE[it.kind] ?? [0, 0];
      out.push({ x: it.x + 0.5, y: it.y + 0.5, art: ITEM_ART[it.kind as keyof typeof ITEM_ART], scale: 0.24, hue, sat });
    }
    return out;
  }

  private draw(time: number): void {
    const { ctx, grid } = this;
    const flicker = 1 + 0.05 * Math.sin(time * 9) + 0.03 * Math.sin(time * 23);
    const pose = { ...this.pose };
    if (this.bump > 0) {
      pose.x += Math.cos(pose.a) * 0.06 * this.bump;
      pose.y += Math.sin(pose.a) * 0.06 * this.bump;
    }
    castView(grid, this.state, pose, this.cw / this.chh, flicker, this.sprites());
    this.overlayHands(time);
    this.overlayThreats(time);
    this.overlayNoise(time);
    this.overlayWave(time);
    this.overlayPopups();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.vw, this.vh);
    // A wall bump: a quick sideways shake that dies out.
    const jolt = this.shake > 0 ? Math.round(Math.sin(this.shake * 28) * 4 * this.shake) : 0;
    const x0 = Math.floor((this.vw - grid.cols * this.cw) / 2) + jolt;
    paintGrid(ctx, grid, x0, 0, this.cw, this.chh, this.font);
    if (this.hurtFlash > 0) {
      ctx.fillStyle = `rgba(160,0,0,${0.35 * this.hurtFlash})`;
      ctx.fillRect(0, 0, this.vw, this.vh);
    }
    this.drawMap();
  }

  /** The torch in your left hand and the weapon in your right, drawn into the grid. */
  private overlayHands(time: number): void {
    const g = this.grid;
    const put = (r: number, c: number, ch: string, color: string) => {
      if (r < 0 || c < 0 || r >= g.rows || c >= g.cols || ch === ' ') return;
      g.ch[r * g.cols + c] = ch;
      g.color[r * g.cols + c] = color;
    };
    const flame = ['(  )', ' )( ', '(  )'];
    const f = Math.floor(time * 10) % 3;
    const torch = [f === 0 ? ' ,* ' : f === 1 ? ' *, ' : ' ** ', flame[f], ' \\/ ', ' || ', ' || '];
    torch.forEach((row, i) => [...row].forEach((ch, j) => put(g.rows - torch.length + i, 2 + j, ch, i < 2 ? (i === 0 ? '#ffe08a' : '#ff9a3d') : '#7a5230')));
    const sw = this.swing;
    const blade = ['     /', '    / ', '   /  ', '\\_/   ', '/ \\   '];
    const lift = Math.round(sw * 3);
    const shift = Math.round(sw * 6);
    blade.forEach((row, i) => [...row].forEach((ch, j) => put(g.rows - blade.length + i - lift, g.cols - 9 + j - shift, ch, i < 3 ? '#c9d4e0' : '#8a6a40')));
    if (this.bolt) {
      // A streak of the spell's color down the middle of the view.
      const t = this.bolt.t;
      const r = Math.round(g.rows * (0.75 - 0.25 * t));
      const c = Math.round(g.cols / 2);
      for (let k = -1; k <= 1; k++) put(r, c + k, k ? '~' : '*', this.bolt.color);
    }
  }

  /** Foes beside or behind you (which the view can't show): arrows on its edges. */
  private overlayThreats(time: number): void {
    const s = this.state;
    if (s.status !== 'playing') return;
    const g = this.grid;
    const p = s.player;
    const fx = DX[p.dir];
    const fy = DY[p.dir];
    const rx = DX[(p.dir + 1) % 4];
    const ry = DY[(p.dir + 1) % 4];
    let left = '';
    let right = '';
    let back = '';
    for (const m of s.monsters) {
      if (m.hp <= 0 || !m.awake) continue;
      const dx = m.x - p.x;
      const dy = m.y - p.y;
      const f = dx * fx + dy * fy;
      const r = dx * rx + dy * ry;
      if (f > 0 && Math.abs(r) <= f * 0.6) continue; // in view
      const d = Math.abs(dx) + Math.abs(dy);
      const def = MONSTERS[m.kind];
      const aimed = def.range > 0 && (dx === 0 || dy === 0) && d <= def.range;
      if (d > 2 && !aimed) continue;
      const name = def.name.replace(/^(Giant|Cave|Bone|Stone|The) /, '').toUpperCase();
      if (f > 0 || Math.abs(r) > Math.abs(f)) {
        if (r < 0) left ||= name;
        else right ||= name;
      } else back ||= name;
    }
    if (!left && !right && !back) return;
    const on = Math.floor(time * 4) % 2 === 0;
    const col = on ? '#ff4d4d' : '#b02a2a';
    // Each label sits on a cleared patch so it reads over busy wall textures.
    const put = (r: number, c: number, str: string) => {
      for (let i = -1; i <= str.length; i++) {
        const cc = c + i;
        if (r < 0 || r >= g.rows || cc < 0 || cc >= g.cols) continue;
        const ch = str[i] ?? ' ';
        g.ch[r * g.cols + cc] = ch;
        g.color[r * g.cols + cc] = col;
      }
    };
    const mid = Math.floor(g.rows * 0.45);
    if (left) {
      const w = left.length + 3;
      put(mid - 1, 0, '<<'.padEnd(w));
      put(mid, 0, '<< ' + left);
      put(mid + 1, 0, '<<'.padEnd(w));
    }
    if (right) {
      const w = right.length + 3;
      put(mid - 1, g.cols - w, '>>'.padStart(w));
      put(mid, g.cols - w, right + ' >>');
      put(mid + 1, g.cols - w, '>>'.padStart(w));
    }
    if (back) {
      const label = `vv ${back} BEHIND vv`;
      put(g.rows - 7, Math.floor((g.cols - label.length) / 2), label);
    }
  }

  /** A closed door straight ahead with something behind it: a "?" on the door. */
  private overlayNoise(time: number): void {
    const s = this.state;
    if (s.status !== 'playing' || this.anim) return;
    const p = s.player;
    const ahead = doorNoises(s).some((d) => d.x === p.x + DX[p.dir] && d.y === p.y + DY[p.dir]);
    if (!ahead) return;
    const g = this.grid;
    const col = Math.floor(time * 3) % 2 ? '#ffb347' : '#ffd9a0';
    const label = ' ? SOMETHING BEHIND ? ';
    const r = Math.floor(g.rows * 0.42);
    const c = Math.floor((g.cols - label.length) / 2);
    for (const rr of [r - 1, r, r + 1])
      for (let i = 0; i < label.length; i++) {
        const cc = c + i;
        if (rr < 0 || rr >= g.rows || cc < 0 || cc >= g.cols) continue;
        g.ch[rr * g.cols + cc] = rr === r ? label[i] : ' ';
        g.color[rr * g.cols + cc] = col;
      }
  }

  /** The Warden drawing in the cold with you in its line: a flashing banner. */
  private overlayWave(time: number): void {
    const s = this.state;
    if (s.status !== 'playing') return;
    const w = s.monsters.find((m) => m.kind === 'warden' && m.charge);
    if (!w || !inWave(s, w)) return;
    const g = this.grid;
    const on = Math.floor(time * 5) % 2 === 0;
    // A full-width band: wave rows above and below, the warning in the middle.
    const r = Math.floor(g.rows * 0.74);
    const label = ' !! GET OUT OF ITS LINE !! ';
    const c0 = Math.floor((g.cols - label.length) / 2);
    for (let rr = r - 2; rr <= r + 2; rr++) {
      if (rr < 0 || rr >= g.rows) continue;
      for (let cc = 0; cc < g.cols; cc++) {
        const i = rr * g.cols + cc;
        if (rr === r) {
          const k = cc - c0;
          g.ch[i] = k >= 0 && k < label.length ? label[k] : ' ';
          g.color[i] = on ? '#ffffff' : '#7fe3ff';
        } else if (Math.abs(rr - r) === 2) {
          g.ch[i] = (cc + Math.floor(time * 8)) % 4 < 2 ? '~' : ' ';
          g.color[i] = on ? '#7fe3ff' : '#3a8aa8';
        } else g.ch[i] = ' ';
      }
    }
  }

  private overlayPopups(): void {
    const g = this.grid;
    for (const p of this.popups) {
      const r = Math.round(g.rows * p.row - p.t * 4);
      const c = Math.round(g.cols * p.col - p.text.length / 2);
      if (r < 0 || r >= g.rows) continue;
      for (let i = 0; i < p.text.length; i++) {
        const cc = c + i;
        if (cc < 0 || cc >= g.cols) continue;
        g.ch[r * g.cols + cc] = p.text[i];
        g.color[r * g.cols + cc] = p.color;
      }
      // A dark band behind the text so it reads over walls.
      for (const rr of [r - 1, r + 1])
        if (rr >= 0 && rr < g.rows)
          for (let i = -1; i <= p.text.length; i++) {
            const cc = c + i;
            if (cc >= 0 && cc < g.cols && g.color[rr * g.cols + cc] !== p.color) g.ch[rr * g.cols + cc] = ' ';
          }
    }
  }

  private drawMap(): void {
    const ctx = this.mapCtx;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 150, 150);
    const span = 13;
    const p = this.state.player;
    this.paintMap(ctx, 150, p.x - (span >> 1), p.y - (span >> 1), span, false);
  }

  /** Draw the seen map: `span` cells from (x0, y0) into a square of `px` CSS pixels. */
  private paintMap(ctx: CanvasRenderingContext2D, px: number, x0: number, y0: number, span: number, whole: boolean): void {
    const s = this.state;
    const p = s.player;
    const cell = px / span;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, px, px);
    ctx.font = `700 ${Math.floor(cell * 1.1)}px ui-monospace, 'Droid Sans Mono', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const at = (x: number, y: number): [number, number] => [(x - x0 + 0.5) * cell, (y - y0 + 0.5) * cell];
    const within = (x: number, y: number) => x >= x0 && y >= y0 && x < x0 + span && y < y0 + span;
    for (let y = y0; y < y0 + span; y++)
      for (let x = x0; x < x0 + span; x++) {
        if (x < 0 || y < 0 || x >= SIZE || y >= SIZE || !s.level.seen[idx(x, y)]) continue;
        const t = s.level.tiles[idx(x, y)];
        const [ch, col] =
          t === 'wall' ? ['#', '#5c5446'] : t === 'pillar' ? ['O', '#7a705c'] : t === 'door' ? ['+', '#c0843a'] : t === 'open' ? ["'", '#a8743a'] : t === 'stairs' ? ['>', '#ffb347'] : ['.', '#4a4438'];
        if (t === 'stairs') {
          ctx.fillStyle = '#4a2d08';
          ctx.fillRect((x - x0) * cell, (y - y0) * cell, cell, cell);
        }
        ctx.fillStyle = col;
        ctx.fillText(ch, ...at(x, y));
      }
    // Doors with something heard behind them.
    for (const d of s.status === 'playing' ? doorNoises(s) : []) {
      if (!within(d.x, d.y)) continue;
      ctx.fillStyle = '#4a2d08';
      ctx.fillRect((d.x - x0) * cell, (d.y - y0) * cell, cell, cell);
      ctx.fillStyle = '#ffb347';
      ctx.fillText('?', ...at(d.x, d.y));
    }
    // The Warden's coming wave: its row and column, as far as it reaches.
    const wave = s.status === 'playing' ? s.monsters.find((m) => m.kind === 'warden' && m.charge) : undefined;
    if (wave) {
      ctx.fillStyle = 'rgba(127,227,255,0.28)';
      for (let y = y0; y < y0 + span; y++)
        for (let x = x0; x < x0 + span; x++) if (inside(x, y) && !opaqueTile(s.level.tiles[idx(x, y)]) && inWaveAt(s, wave, x, y)) ctx.fillRect((x - x0) * cell, (y - y0) * cell, cell, cell);
    }
    for (const it of s.items) {
      if (!within(it.x, it.y) || !s.level.seen[idx(it.x, it.y)]) continue;
      const [ch, col] = ITEM_GLYPH[it.kind] ?? ['*', '#ffd36b'];
      ctx.fillStyle = col;
      ctx.fillText(ch, ...at(it.x, it.y));
    }
    for (const m of s.monsters) {
      if (!within(m.x, m.y)) continue;
      // Awake foes: only what you can actually see on the full map (the minimap keeps the old "awake" rule).
      // Sleeping ones show, dim, while the view could show them (a sleeper nearer than SIGHT wakes on its next turn).
      if (m.awake ? whole && !this.inSight(m) : !this.inSight(m, this.state, VIEW_RANGE)) continue;
      ctx.fillStyle = m.awake ? '#ff4d4d' : '#b07a88';
      ctx.fillText(MAP_GLYPH[m.kind], ...at(m.x, m.y));
    }
    // You: a cyan "@" (never ">", which is the stairs) with a notch on the side you face.
    const [px0, py0] = at(p.x, p.y);
    ctx.fillStyle = '#062a33';
    ctx.fillRect(px0 - cell / 2 + 0.5, py0 - cell / 2 + 0.5, cell - 1, cell - 1);
    ctx.fillStyle = '#5ee7ff';
    ctx.fillText('@', px0, py0);
    const fx = DX[p.dir];
    const fy = DY[p.dir];
    const tipX = px0 + fx * cell * 0.85;
    const tipY = py0 + fy * cell * 0.85;
    const baseX = px0 + fx * cell * 0.5;
    const baseY = py0 + fy * cell * 0.5;
    const w = cell * 0.32;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(baseX - fy * w, baseY + fx * w);
    ctx.lineTo(baseX + fy * w, baseY - fx * w);
    ctx.closePath();
    ctx.fill();
  }

  private inSight(m: Monster, s = this.state, range = SIGHT): boolean {
    const p = s.player;
    const dx = m.x - p.x;
    const dy = m.y - p.y;
    return dx * dx + dy * dy <= range * range + 2 && los(s, p.x, p.y, m.x, m.y);
  }
}
