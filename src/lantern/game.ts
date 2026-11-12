// Lantern controller: tap to walk/fight/talk, auto-walk, dialogue, HUD.

import { closeOverlay, showCard } from '../shared/cards';
import { copyText, toast } from '../shared/debug';
import {
  ARMORS,
  MAPS,
  MONSTERS,
  NPC_NAMES,
  RULES_VERSION,
  WEAPONS,
  WORLD,
  XP_TABLE,
  MONSTER_HIT,
  applyAction,
  attackOf,
  damageRange,
  defenceOf,
  dialogue,
  encodeAction,
  fov,
  hitChance,
  isLegal,
  markerAt,
  monsterAt,
  newGame,
  passable,
  pathTo,
  planWalk,
  randomSeed,
  replay,
  samePos,
  type Action,
  type GameEvent,
  type GameState,
  type MapId,
  type Monster,
  type NpcId,
  type Pos,
} from './core';
import { DIRS8, addPos } from './core/world';
import { MONSTER_COLORS, camera, cellAtPx, draw, fitView, type Banner, type Fx, type View } from './render';
import { load, save } from './storage';

interface SavedGame {
  seed: number;
  actions: string;
  v: number;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const STEP_MS = 95;
const REST_MS = 40;
/** Walk-stopping events. */
const STOP_EVENTS = new Set(['hit', 'miss', 'kill', 'talk', 'read', 'loot', 'levelUp', 'enterMap', 'playerDown', 'win']);
const cheb = (a: Pos, b: Pos) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export class Game {
  private state!: GameState;
  private run!: SavedGame;
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private fx: Fx[] = [];
  private banner: Banner | null = null;
  private flash: { at: Pos; t: number; color: string } | null = null;
  /** Monsters already described in the log (UI only; later they stop a walk only when they come close). */
  private announced = new Set<number>();
  /** The monster announced by the last action, if a new one came into view. */
  private lastAnnounced: Monster | null = null;
  private talkNote = '';
  /**
   * Auto-walk: remaining steps and where they lead. `direct` walks go straight to the
   * target; the others head as close as known ground allows and re-plan every step.
   */
  private walk: { dirs: number[]; target: Pos; chase: number | null; direct: boolean; steps: number } | null = null;
  /** Resting: waiting turn after turn until healed or something shows up. */
  private rest: { from: number; turns: number } | null = null;
  /** The monster you last fought (shown in the info line). */
  private focus: number | null = null;
  private nextStepAt = 0;
  private last = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement!);
    this.resize();
    this.bindInput();
    $('waitBtn').onclick = () => {
      if (this.rest) return this.stopRest('You stop resting.');
      if (this.canRest()) {
        // Safe and hurt: rest until healed (stops if anything shows up).
        this.walk = null;
        this.rest = { from: this.state.player.hp, turns: 0 };
        this.refreshUi();
        return;
      }
      const hp = this.state.player.hp;
      this.act({ type: 'wait' });
      const gained = this.state.player.hp - hp;
      this.say(gained > 0 ? `You catch your breath. +${gained} HP.` : 'You wait a moment.');
    };
    $('potionBtn').onclick = () => this.act({ type: 'potion' });
    $('packBtn').onclick = () => this.showPack();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------- lifecycle ----------

  start(seed: number, actions = ''): void {
    let s: GameState;
    try {
      s = replay(seed, actions);
    } catch {
      actions = '';
      s = newGame(seed);
    }
    this.run = { seed, actions, v: RULES_VERSION };
    this.state = s;
    this.walk = null;
    this.rest = null;
    this.focus = null;
    this.banner = null;
    this.fx = [];
    this.announced = new Set(this.visibleMonsters().map((mo) => mo.id));
    this.persist();
    this.refreshUi();
  }

  newGame(): void {
    closeOverlay();
    this.start(randomSeed());
  }

  private persist(): void {
    save('game', this.run);
    if (this.state.quest === 'won') {
      const best = load<number | null>('bestTurns', null);
      if (best === null || this.state.turn < best) save('bestTurns', this.state.turn);
    }
  }

  // ---------- input ----------

  private bindInput(): void {
    let down: { x: number; y: number; id: number } | null = null;
    this.canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY, id: e.pointerId }));
    this.canvas.addEventListener('pointerup', (e) => {
      if (!down || down.id !== e.pointerId) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 16) return;
      const r = this.canvas.getBoundingClientRect();
      this.tap(e.clientX - r.left, e.clientY - r.top);
    });
    this.canvas.addEventListener('pointercancel', () => (down = null));
  }

  private view(): View {
    const m = WORLD[this.state.player.map];
    return camera(fitView(this.w, this.h, m.w, m.h), this.state);
  }

  private tap(px: number, py: number): void {
    if (!$('overlay').hidden) return;
    if (this.rest) return this.stopRest('You stop resting.');
    const target = cellAtPx(this.view(), px, py);
    if (samePos(target, this.state.player.pos)) {
      // Tap yourself to stop.
      if (this.walk) {
        this.walk = null;
        this.say('You stop.');
      }
      return;
    }
    // A tap while walking just picks a new destination.
    this.startWalk(target);
  }

  private startWalk(target: Pos): void {
    const s = this.state;
    const m = WORLD[s.player.map];
    const foe = s.monsters.find((mo) => mo.hp > 0 && mo.map === s.player.map && samePos(mo.pos, target) && this.canSee(mo.pos));
    const plan = planWalk(s, target);
    const what = foe ? `the ${MONSTERS[foe.kind].name}` : 'there';
    // Something you'd stand on or use (not a wall or tree you tapped "that way").
    const place = !!foe || ((passable(m, target) || !!markerAt(m, target)) && this.known(target));
    if (!plan) {
      this.walk = null;
      this.say(place ? `Can't reach ${what} from here.` : 'No way closer from here.');
      return;
    }
    if (!plan.direct && place) this.say(`Can't reach ${what} from here; heading as close as you can.`);
    this.walk = { dirs: plan.dirs, target, chase: foe && plan.direct ? foe.id : null, direct: plan.direct, steps: 0 };
    this.nextStepAt = 0;
  }

  /** One auto-walk step. A walk only stops on arrival, an event, or a monster showing up, and says why. */
  private walkStep(): void {
    const w = this.walk!;
    const s = this.state;
    const stop = (msg?: string) => {
      this.walk = null;
      if (msg) this.say(msg);
    };
    if (w.chase !== null) {
      // Follow a moving monster.
      const foe = s.monsters.find((m) => m.id === w.chase && m.hp > 0 && m.map === s.player.map);
      if (!foe) return stop();
      const name = MONSTERS[foe.kind].name;
      if (!this.canSee(foe.pos)) return stop(`You lose sight of the ${name}.`);
      const dirs = pathTo(s, foe.pos);
      if (!dirs) return stop(`Can't reach the ${name} from here.`);
      w.target = foe.pos;
      w.dirs = dirs;
    } else if (!w.direct) {
      // Heading somewhere not yet reachable: re-plan as the lantern shows more.
      const plan = planWalk(s, w.target);
      if (!plan) return this.endToward();
      w.dirs = plan.dirs;
      w.direct = plan.direct;
    }
    const dir = w.dirs[0];
    if (dir === undefined) return stop();
    const next = addPos(s.player.pos, DIRS8[dir]);
    const blocker = monsterAt(s, s.player.map, next);
    if (blocker && blocker.id !== w.chase && !(w.dirs.length === 1 && samePos(next, w.target)))
      return stop(`The ${MONSTERS[blocker.kind].name} is in your way.`);
    if (!isLegal(s, { type: 'step', dir }) || ++w.steps > 500) return stop('Something blocks the way.');
    w.dirs.shift();
    const nearBefore = new Set(this.visibleMonsters().filter((mo) => cheb(mo.pos, s.player.pos) <= 3).map((mo) => mo.id));
    const events = this.act({ type: 'step', dir }, true);
    if (events.some((e) => STOP_EVENTS.has(e.type))) return stop();
    // A monster you haven't met stops you; act() has just described it.
    if (this.lastAnnounced) return stop();
    // One you've met only stops you when it comes close.
    const pp = this.state.player.pos;
    const close = this.visibleMonsters().find((mo) => mo.id !== w.chase && cheb(mo.pos, pp) <= 3 && !nearBefore.has(mo.id));
    if (close) return stop(`The ${MONSTERS[close.kind].name} comes close. You stop.`);
    if (w.direct && w.chase === null && w.dirs.length === 0) this.walk = null; // arrived
  }

  /** A walk toward an unreachable spot has got as close as it can. */
  private endToward(): void {
    const w = this.walk!;
    this.walk = null;
    if (cheb(this.state.player.pos, w.target) > 1) this.say('No way closer from here.');
  }

  /** One turn of resting. */
  private restStep(): void {
    const r = this.rest!;
    this.act({ type: 'wait' }, true);
    r.turns++;
    const p = this.state.player;
    const seen = this.visibleMonsters()[0];
    const gained = p.hp > r.from ? ` (+${p.hp - r.from} HP)` : '';
    if (this.lastAnnounced) this.stopRest(`You stop resting${gained}.`);
    else if (seen) this.stopRest(`The ${MONSTERS[seen.kind].name} is near. You stop resting${gained}.`);
    else if (p.hp >= p.maxHp) this.stopRest(`You rest until healed. +${p.hp - r.from} HP.`);
    else if (r.turns >= 400) this.stopRest(`You stop resting${gained}.`);
  }

  private stopRest(msg: string): void {
    this.rest = null;
    this.say(msg);
  }

  /** Hurt, and nothing in sight: Wait becomes Rest. */
  private canRest(): boolean {
    const p = this.state.player;
    return p.hp < p.maxHp && this.state.quest !== 'won' && this.visibleMonsters().length === 0;
  }

  private known(p: Pos): boolean {
    const s = this.state;
    if (!MAPS[s.player.map].dark) return true;
    const m = WORLD[s.player.map];
    return s.seen[s.player.map]?.[p.y * m.w + p.x] === '1';
  }

  /** In your light (dark maps) or close enough to notice (lit maps). */
  private canSee(p: Pos): boolean {
    const s = this.state;
    const m = WORLD[s.player.map];
    if (cheb(p, s.player.pos) > 8) return false;
    return !MAPS[s.player.map].dark || fov(m, s.player.pos).has(p.y * m.w + p.x);
  }

  private visibleMonsters() {
    const s = this.state;
    const m = WORLD[s.player.map];
    const lit = MAPS[s.player.map].dark ? fov(m, s.player.pos) : null;
    return s.monsters.filter(
      (mo) =>
        mo.hp > 0 &&
        mo.map === s.player.map &&
        Math.max(Math.abs(mo.pos.x - s.player.pos.x), Math.abs(mo.pos.y - s.player.pos.y)) <= 8 &&
        (!lit || lit.has(mo.pos.y * m.w + mo.pos.x)),
    );
  }

  /** Apply an action if legal; returns its events. */
  private act(a: Action, fromWalk = false): GameEvent[] {
    if (!fromWalk) {
      this.walk = null;
      this.rest = null;
    }
    this.lastAnnounced = null;
    if (!isLegal(this.state, a)) return [];
    const { state, events } = applyAction(this.state, a);
    this.run.actions += encodeAction(a);
    this.state = state;
    this.persist();
    this.react(events);
    this.announce();
    this.refreshUi();
    return events;
  }

  /** Describe monsters seen for the first time (once each). */
  private announce(): void {
    for (const mo of this.visibleMonsters()) {
      if (this.announced.has(mo.id)) continue;
      this.announced.add(mo.id);
      this.lastAnnounced ??= mo;
      const def = MONSTERS[mo.kind];
      this.state.log.push(`${/^[A-Z]/.test(def.name) ? 'The' : 'A'} ${def.name}! ${def.blurb}`);
    }
  }

  /** Add a floating number: older ones on the same cell vanish; ones from this same turn stack upward. */
  private addFx(text: string, color: string, at: Pos, life: number): void {
    const turn = this.state.turn;
    this.fx = this.fx.filter((f) => f.x !== at.x || f.y !== at.y || f.turn === turn);
    const stack = this.fx.filter((f) => f.x === at.x && f.y === at.y).length;
    this.fx.push({ text, color, x: at.x, y: at.y, age: 0, life, stack, turn });
  }

  private react(events: GameEvent[]): void {
    const s = this.state;
    const P = s.player.pos;
    for (const e of events) {
      switch (e.type) {
        case 'hit':
          this.addFx(`-${e.dmg}`, e.onPlayer ? '#ff5c5c' : '#ffffff', e.at, 800);
          this.flash = { at: e.at, t: 0, color: e.onPlayer ? '#ff3d5a' : '#ffffff' };
          if (e.onPlayer) navigator.vibrate?.(40);
          else this.focus = monsterAt(s, s.player.map, e.at)?.id ?? this.focus;
          break;
        case 'miss':
          if (samePos(e.at, P)) this.addFx('dodge', '#8fb8ff', e.at, 700);
          else {
            this.addFx('miss', '#b5b3bf', e.at, 700);
            this.focus = monsterAt(s, s.player.map, e.at)?.id ?? this.focus;
          }
          break;
        case 'levelUp':
          // A banner, not a floater, so it never sits on top of damage numbers.
          this.banner = { text: `LEVEL ${e.level}`, sub: e.level % 2 === 0 ? '+6 health, +1 attack, +1 defence' : '+6 health, +1 attack', color: '#ffd166', age: 0, life: 1800 };
          navigator.vibrate?.(30);
          break;
        case 'loot':
          if (e.text === 'The Ember')
            this.banner = { text: 'THE EMBER', sub: 'Take it home to the Lantern', color: '#ff9f43', age: 0, life: 2600 };
          else this.addFx('+loot', '#e7b84a', P, 1000);
          break;
        case 'heal':
          if (e.amount > 0) this.addFx(`+${e.amount}`, '#7bed9f', P, 800);
          break;
        case 'talk':
          setTimeout(() => this.showTalk(e.npc), 50);
          break;
        case 'win':
          setTimeout(() => this.showWin(), 400);
          break;
        case 'playerDown':
          setTimeout(
            () =>
              showCard(
                `<h2>You fall</h2><p>You wake by the cold Lantern in Emberwick. Half your gold is gone, but you keep everything else. The monsters you slew stay slain.</p>`,
                [{ label: 'Get up', primary: true, onClick: closeOverlay }],
                false,
              ),
            200,
          );
          break;
      }
    }
  }

  // ---------- UI ----------

  private say(text: string): void {
    this.state.log.push(text);
    this.refreshUi();
  }

  private refreshUi(): void {
    const s = this.state;
    const p = s.player;
    $('hpText').textContent = `${p.hp}/${p.maxHp}`;
    $('hpBar').style.width = `${(100 * p.hp) / p.maxHp}%`;
    const lo = XP_TABLE[p.level - 1] ?? 0;
    const hi = XP_TABLE[p.level] ?? null;
    $('xpText').textContent = hi === null ? `${p.xp} (max)` : `${p.xp}/${hi}`;
    $('xpBar').style.width = `${hi === null ? 100 : (100 * (p.xp - lo)) / (hi - lo)}%`;
    $('lvl').textContent = String(p.level);
    $('atkdef').textContent = `${attackOf(s)}/${defenceOf(s)}`;
    $('gold').textContent = String(p.gold);
    const pot = $<HTMLButtonElement>('potionBtn');
    pot.textContent = `Potion ×${p.potions}`;
    pot.disabled = !isLegal(s, { type: 'potion' });
    $('waitBtn').textContent = this.rest ? 'Stop' : this.canRest() ? 'Rest' : 'Wait';
    $('info').innerHTML = this.infoLine();
    $('log').innerHTML = s.log
      .slice(-3)
      .map((l) => `<div>${esc(l)}</div>`)
      .join('');
  }

  /**
   * The monster next to you (or the one you last fought): its health, then your chance to hit
   * and damage, then its. Else your goal.
   */
  private infoLine(): string {
    const s = this.state;
    const p = s.player;
    const vis = this.visibleMonsters();
    const adj = vis.filter((mo) => cheb(mo.pos, p.pos) === 1).sort((a, b) => a.hp - b.hp);
    const mo = adj.find((m) => m.id === this.focus) ?? adj[0] ?? vis.find((m) => m.id === this.focus);
    if (!mo) return `<span class="goal">${esc(this.goal())}</span>`;
    const def = MONSTERS[mo.kind];
    const [ylo, yhi] = damageRange(attackOf(s), def.def);
    const [tlo, thi] = damageRange(def.atk, defenceOf(s));
    const span = (a: number, b: number) => (a === b ? `${a}` : `${a}-${b}`);
    return (
      `<b style="color:${MONSTER_COLORS[mo.kind]}">${def.glyph} ${esc(cap(def.name))} ${mo.hp}/${def.hp}</b>` +
      ` · you ${Math.round(100 * hitChance(mo.kind))}%: ${span(ylo, yhi)} · it ${Math.round(100 * MONSTER_HIT)}%: ${span(tlo, thi)}`
    );
  }

  private goal(): string {
    const s = this.state;
    const map: MapId = s.player.map;
    switch (s.quest) {
      case 'none':
        return map === 'village' ? 'Goal: talk to Elder Wenna (top left).' : 'Goal: talk to Elder Wenna in Emberwick.';
      case 'started':
        return {
          village: 'Goal: the Hollow. Take the east road (>).',
          forest: 'Goal: the Hollow, in the rocks north-east.',
          cave1: 'Goal: find the way down (>).',
          cave2: 'Goal: the Hollow King, at the very bottom.',
        }[map];
      case 'ember':
        return map === 'village'
          ? 'Goal: set the Ember in the Lantern (¥).'
          : 'Goal: bring the Ember home (the < exits).';
      case 'won':
        return 'The Lantern burns. ☰ for a new game.';
    }
  }

  private showTalk(npc: NpcId): void {
    const d = dialogue(this.state, npc);
    const buttons = d.options.map((o) => ({
      label: o.label,
      primary: false,
      onClick: () => {
        if (!o.enabled) return;
        this.act(o.action);
        // Say what happened right in the dialog (the log is hidden behind it).
        this.talkNote = this.state.log[this.state.log.length - 1] ?? '';
        this.showTalk(npc);
        this.talkNote = '';
      },
    }));
    showCard(
      `<p class="speaker">${d.name}</p><p>${d.text}</p>${this.talkNote ? `<p class="said">${this.talkNote}</p>` : ''}<p>You have ${this.state.player.gold} gold.</p>`,
      [...buttons, { label: 'Goodbye', primary: true, onClick: closeOverlay }],
    );
    // Grey out options you can't afford.
    const btns = document.querySelectorAll<HTMLButtonElement>('#overlay .card button');
    d.options.forEach((o, i) => (btns[i].disabled = !o.enabled));
  }

  private showPack(): void {
    const s = this.state;
    const p = s.player;
    const next = XP_TABLE[p.level] ?? null;
    showCard(
      `<h2>Pack</h2>
      <table>
        <tr><td>Level</td><td>${p.level}</td></tr>
        <tr><td>XP</td><td>${p.xp}${next !== null ? ` / ${next}` : ''}</td></tr>
        <tr><td>Health</td><td>${p.hp} / ${p.maxHp}</td></tr>
        <tr><td>Weapon</td><td>${WEAPONS[p.weapon].name} (+${WEAPONS[p.weapon].atk})</td></tr>
        <tr><td>Armor</td><td>${ARMORS[p.armor].name} (+${ARMORS[p.armor].def})</td></tr>
        <tr><td>Attack / Defence</td><td>${attackOf(s)} / ${defenceOf(s)}</td></tr>
        <tr><td>Potions</td><td>${p.potions}</td></tr>
        <tr><td>Gold</td><td>${p.gold}</td></tr>
        <tr><td>Quest</td><td>${
          { none: 'Talk to the Elder', started: 'Find the Ember', ember: 'Bring the Ember home', won: 'Done!' }[s.quest]
        }</td></tr>
      </table>`,
      [{ label: 'Close', primary: true, onClick: closeOverlay }],
    );
  }

  showHelp(): void {
    showCard(
      `<h2>How to play Lantern</h2>
      <ul>
        <li><b>Tap anywhere</b> to walk there; tap somewhere else to change course, tap yourself to stop. A walk stops by itself only when a monster shows up or comes close, and the log says why.</li>
        <li><b>Tap a monster</b> (or just walk into it) to hit it. One tap, one attack (monsters hit back each turn). The line above the log shows its health, then your chance to hit it and your damage, then its (<i>you 90%: 2-4</i>).</li>
        <li><b>Tap a person</b> (coloured <b>@</b>) to talk and shop. <b>?</b> is a sign, <b>≡</b> a chest.</li>
        <li><b>Potion</b> heals 12. <b>Wait</b> passes a turn. You heal over time, quickly when no monster can see you: then Wait becomes <b>Rest</b>, which rests until you are healed (or something shows up).</li>
        <li>Level up by winning fights (XP bar at the top): the rats near the village are the safe first fights; goblins across the bridge hit hard at level 1. Bram sells steel, Mira heals and sells potions.</li>
        <li>Caves are dark: you see only what your lantern lights. Explored ground stays dimly remembered.</li>
        <li>If you fall, you wake in the village with half your gold. Slain monsters stay slain.</li>
      </ul>`,
      [{ label: 'Begin', primary: true, onClick: closeOverlay }],
    );
    save('seenHelp', true);
  }

  showMenu(): void {
    const s = this.state;
    showCard(
      `<h2>Lantern</h2><p>${MAPS[s.player.map].name} · Turn ${s.turn} · Falls ${s.deaths}</p>`,
      [
        { label: 'Resume', primary: true, onClick: closeOverlay },
        { label: 'How to play', onClick: () => this.showHelp() },
        { label: 'Copy bug report', onClick: () => this.copyReport() },
        { label: 'All games', onClick: () => (location.href = '../') },
        { label: 'Abandon & start over', onClick: () => this.newGame() },
      ],
    );
  }

  private showWin(): void {
    const s = this.state;
    showCard(
      `<h2>The Lantern burns again</h2><p>Light pours over Emberwick. ${NPC_NAMES.elder} weeps and laughs at once.</p>
      <p>Level ${s.player.level} · ${s.turn} turns · ${s.deaths} fall${s.deaths === 1 ? '' : 's'}</p>`,
      [
        { label: 'Walk the village', primary: true, onClick: closeOverlay },
        { label: 'New game', onClick: () => this.newGame() },
        { label: 'All games', onClick: () => (location.href = '../') },
      ],
    );
  }

  private async copyReport(): Promise<void> {
    const ua = navigator.userAgent.replace(/\s+/g, ' ');
    const text = `LANTERN build=${__BUILD_ID__} rules=${RULES_VERSION} seed=${this.run.seed} a=${this.run.actions || '-'} screen=${innerWidth}x${innerHeight}@${devicePixelRatio} ua="${ua}"`;
    toast((await copyText(text)) ? 'Bug report copied — paste it in chat' : 'Copy failed');
  }

  // ---------- rendering ----------

  private resize(): void {
    const parent = this.canvas.parentElement!;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.w = parent.clientWidth;
    this.h = parent.clientHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private frame(t: number): void {
    requestAnimationFrame((tt) => this.frame(tt));
    const dt = Math.min(50, t - (this.last || t));
    this.last = t;
    if (!this.state || this.w < 1 || this.h < 1) return;
    try {
      if (this.walk && $('overlay').hidden && t >= this.nextStepAt) {
        this.nextStepAt = t + STEP_MS;
        this.walkStep();
      } else if (this.rest && $('overlay').hidden && t >= this.nextStepAt) {
        this.nextStepAt = t + REST_MS;
        this.restStep();
      }
      for (const f of this.fx) f.age += dt;
      this.fx = this.fx.filter((f) => f.age < f.life);
      if (this.banner && (this.banner.age += dt) >= this.banner.life) this.banner = null;
      if (this.flash) {
        this.flash.t += dt / 250;
        if (this.flash.t >= 1) this.flash = null;
      }
      const v = this.view();
      const path: Pos[] = [];
      if (this.walk) {
        let cur = this.state.player.pos;
        for (const d of this.walk.dirs) {
          cur = addPos(cur, DIRS8[d]);
          path.push(cur);
        }
      }
      draw(this.ctx, this.w, this.h, v, this.state, this.fx, this.flash, path, t, this.banner, this.walk?.target ?? null);
    } catch (err) {
      this.walk = null;
      setTimeout(() => {
        throw err;
      });
    }
  }
}
