// Delve controller: input (buttons, swipes, keys), smooth step/turn animation,
// the ASCII view, minimap, HUD, menus and saving.

import { closeOverlay, showCard } from '../shared/cards';
import { copyText, toast } from '../shared/debug';
import { makeStore } from '../shared/storage';
import { DEATH_ART, LOGO, MONSTER_ART, ITEM_ART, VICTORY_ART } from './art';
import {
  ARMORS,
  MAX_DEPTH,
  RULES_VERSION,
  SIZE,
  SPELLS,
  WEAPONS,
  XP_TABLE,
  applyAction,
  attackOf,
  defenceOf,
  encodeAction,
  idx,
  isLegal,
  newGame,
  randomSeed,
  replay,
  type Action,
  type GameEvent,
  type GameState,
  type MonsterKind,
} from './core';
import { castView, makeGrid, paintGrid, type Grid, type Pose, type Sprite } from './view';

const store = makeStore('delve.');
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const MONSTER_LOOK: Record<MonsterKind, { hue: number; sat: number; scale: number; lift?: number }> = {
  rat: { hue: 30, sat: 30, scale: 0.32 },
  bat: { hue: 280, sat: 25, scale: 0.28, lift: 0.35 },
  slime: { hue: 110, sat: 60, scale: 0.42 },
  skeleton: { hue: 45, sat: 15, scale: 0.82 },
  archer: { hue: 45, sat: 22, scale: 0.82 },
  ghoul: { hue: 90, sat: 25, scale: 0.78 },
  wraith: { hue: 200, sat: 35, scale: 0.9, lift: 0.08 },
  mage: { hue: 0, sat: 55, scale: 0.85 },
  golem: { hue: 25, sat: 12, scale: 1.0 },
  warden: { hue: 280, sat: 30, scale: 1.25 },
};
const ITEM_HUE: Record<string, [number, number]> = { potion: [0, 70], ether: [215, 70], gold: [48, 90], weapon: [200, 15], armor: [200, 15] };

/** Minimap letters, one per monster kind. */
const MAP_GLYPH: Record<MonsterKind, string> = { rat: 'r', bat: 'b', slime: 'j', skeleton: 's', archer: 'a', ghoul: 'g', wraith: 'W', mage: 'c', golem: 'G', warden: 'X' };

const angleOf = (dir: number) => ((dir - 1) * Math.PI) / 2;

interface SavedRun {
  seed: number;
  actions: string;
  v: number;
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
  private last = 0;
  /** Viewing a ?seed=&a= replay link: never touches the saved run or records. */
  private replaying = false;
  /** Something changed that the idle (torch-rate) redraw wouldn't pick up soon enough. */
  private dirty = true;
  private lastTick = -1;

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
  start(seed: number, actions = '', replayLink = false): void {
    let s: GameState;
    let note = replayLink ? 'Replay: progress here is not saved' : '';
    try {
      s = replay(seed, actions);
    } catch (err) {
      note = `${replayLink ? 'Replay' : 'Saved run'} failed (${err instanceof Error ? err.message : String(err)}); seed ${seed} from the start`;
      actions = '';
      s = newGame(seed);
    }
    if (note) toast(note);
    this.replaying = replayLink;
    this.run = { seed, actions, v: RULES_VERSION };
    this.state = s;
    this.snapPose();
    this.resize();
    this.dirty = true;
    this.persist();
    this.refresh();
    if (s.status !== 'playing') this.showEnd();
  }

  private persist(): void {
    if (this.replaying) return;
    store.save('run', this.state.status === 'playing' ? this.run : null);
    const best = store.load<number>('best', 0);
    if (this.state.depth > best) store.save('best', this.state.depth);
    if (this.state.status === 'won') store.save('wins', store.load<number>('wins', 0) + 1);
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
        else this.act({ type: a } as Action);
      });
    }
    // Swipes on the view: up/down step, left/right turn, tap = use.
    let start: { x: number; y: number; t: number } | null = null;
    this.view.addEventListener('pointerdown', (e) => (start = { x: e.clientX, y: e.clientY, t: performance.now() }));
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
        ' ': 'use', enter: 'use', '.': 'wait', p: 'potion',
      };
      const t = map[e.key.toLowerCase()];
      if (t) this.act({ type: t } as Action);
      if (e.key.toLowerCase() === 'f') this.act({ type: 'cast', spell: 'fire' });
    });
  }

  act(a: Action): void {
    if (!$('overlay').hidden || !this.state) return;
    if (this.anim) {
      this.queued = a;
      return;
    }
    if (!isLegal(this.state, a)) {
      if (a.type === 'potion' || a.type === 'ether' || a.type === 'cast') toast(a.type === 'cast' ? 'Not enough MP' : 'Nothing to drink, or no need');
      return;
    }
    const before = this.state;
    const { state, events } = applyAction(before, a);
    this.run.actions += encodeAction(a);
    this.state = state;
    this.react(events);
    this.persist();
    this.refresh();
    this.dirty = true;
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
          break;
        case 'miss':
          this.swing = 1;
          break;
        case 'hurt':
          this.hurtFlash = 1;
          navigator.vibrate?.(30);
          break;
        case 'bump':
          this.bump = 1;
          break;
        case 'bolt':
          this.bolt = { t: 0, color: e.spell === 'fire' ? '#ff8a3d' : e.spell === 'frost' ? '#7fe3ff' : '#c9a6ff' };
          break;
        case 'levelUp':
          toast(`Level ${e.level}!`);
          navigator.vibrate?.(20);
          break;
        case 'descend':
          toast(e.depth === MAX_DEPTH ? 'The deepest hall' : `Depth ${e.depth}`);
          break;
        case 'death':
        case 'win':
          setTimeout(() => this.showEnd(), 600);
          break;
      }
    }
  }

  // ---------- screens ----------

  private showSpells(): void {
    const p = this.state.player;
    const opts = p.spells.map((id) => ({
      label: `${SPELLS[id].name} (${SPELLS[id].cost} MP) - ${SPELLS[id].desc}`,
      onClick: () => {
        closeOverlay();
        this.act({ type: 'cast', spell: id });
      },
    }));
    showCard(`<h2>Spells</h2><p>MP ${p.mp}/${p.maxMp}. New spells come with levels.</p>`, [...opts, { label: 'Cancel', onClick: closeOverlay }]);
    document.querySelectorAll<HTMLButtonElement>('#overlay .card button').forEach((b, i) => {
      const id = p.spells[i];
      if (id) b.disabled = !isLegal(this.state, { type: 'cast', spell: id });
    });
  }

  showTitle(): void {
    const best = store.load<number>('best', 0);
    const saved = store.load<SavedRun | null>('run', null);
    const canResume = saved && saved.v === RULES_VERSION;
    showCard(
      `<pre>${LOGO.join('\n')}</pre><p style="text-align:center">Ten floors down, the Warden waits.</p>${best ? `<p class="meta">Deepest: ${best}${store.load<number>('wins', 0) ? ` · Wins: ${store.load<number>('wins', 0)}` : ''}</p>` : ''}`,
      [
        ...(canResume ? [{ label: 'Continue', primary: true, onClick: () => (closeOverlay(), this.start(saved!.seed, saved!.actions)) }] : []),
        { label: 'New descent', primary: !canResume, onClick: () => (closeOverlay(), this.start(randomSeed())) },
        { label: 'How to play', onClick: () => this.showHelp() },
        { label: 'All games', onClick: () => (location.href = '../') },
      ],
      false,
    );
  }

  showHelp(): void {
    showCard(
      `<h2>How to play</h2><ul>
      <li><b>FWD / BACK / STEP</b> move one cell. <b>TURN</b> is free; everything else takes a turn.</li>
      <li>Or swipe on the view: up/down to step, left/right to turn, tap to hit or open doors.</li>
      <li>Walk into a monster (or press <b>HIT</b>) to attack. Walk into a door to open it.</li>
      <li><b>CAST</b> spells with MP: Firebolt from the start, more as you level.</li>
      <li>Monsters act only when you do. Archers and cultists shoot down straight corridors.</li>
      <li>Find the stairs (<b>&gt;</b> on the floor and the map) on each floor. Floor 10 holds the Warden.</li>
      <li>The map shows what you've seen. Red letters are monsters.</li></ul>`,
      [{ label: 'Back', primary: true, onClick: () => this.showTitle() }],
      false,
    );
  }

  showMenu(): void {
    const s = this.state;
    showCard(
      `<h2>Depth ${s.depth}</h2><p>Turn ${s.turn} · ${s.kills} kills · ${s.player.gold} gold</p>`,
      [
        { label: 'Resume', primary: true, onClick: closeOverlay },
        { label: 'How to play', onClick: () => this.showHelp() },
        { label: 'Copy bug report', onClick: () => this.copyReport() },
        { label: 'Abandon descent', onClick: () => (this.replaying || store.save('run', null), this.showTitle()) },
        { label: 'All games', onClick: () => (location.href = '../') },
      ],
    );
  }

  private showEnd(): void {
    const s = this.state;
    const won = s.status === 'won';
    showCard(
      `<pre>${(won ? VICTORY_ART : DEATH_ART).join('\n')}</pre><h2 style="text-align:center">${won ? 'The deep is quiet' : 'Lost in the dark'}</h2>
      <p style="text-align:center">Depth ${s.depth} · Level ${s.player.level} · ${s.kills} kills · ${s.turn} turns</p>`,
      [
        { label: 'New descent', primary: true, onClick: () => (closeOverlay(), this.start(randomSeed())) },
        { label: 'Title', onClick: () => this.showTitle() },
      ],
      false,
    );
  }

  private async copyReport(): Promise<void> {
    const text = `DELVE build=${__BUILD_ID__} rules=${RULES_VERSION} seed=${this.run.seed} a=${this.run.actions || '-'} ua="${navigator.userAgent}"`;
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
    const next = XP_TABLE[p.level];
    $('stats').innerHTML = `LV <b>${p.level}</b> XP ${p.xp}${next ? '/' + next : ''} · ATK <b>${attackOf(s)}</b> DEF <b>${defenceOf(s)}</b><br>${WEAPONS[p.weapon]} · ${ARMORS[p.armor]} · <b>${p.gold}</b>g`;
    $('log').innerHTML = s.log
      .slice(-4)
      .map((l) => `<div>${l.replace(/</g, '&lt;')}</div>`)
      .join('');
  }

  // ---------- rendering ----------

  private resize(): void {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = this.view.parentElement!.clientWidth;
    // The view takes most of the width as a 4:3 window.
    const h = Math.round(Math.min(w * 1.0, innerHeight * 0.5));
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
    const busy = !!this.anim || this.flash.size > 0 || this.hurtFlash > 0 || this.swing > 0 || this.bump > 0 || !!this.bolt;
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
    if (this.bolt) {
      this.bolt.t += dt * 4;
      if (this.bolt.t >= 1) this.bolt = null;
    }
    this.draw(t / 1000);
  }

  private sprites(): Sprite[] {
    const s = this.state;
    const out: Sprite[] = [];
    for (const m of s.monsters) {
      const look = MONSTER_LOOK[m.kind];
      out.push({ x: m.x + 0.5, y: m.y + 0.5, art: MONSTER_ART[m.kind], scale: look.scale, hue: look.hue, sat: look.sat, lift: look.lift, flash: this.flash.has(m.id), frozen: m.stun > 0 });
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
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.vw, this.vh);
    const x0 = Math.floor((this.vw - grid.cols * this.cw) / 2);
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

  private drawMap(): void {
    const ctx = this.mapCtx;
    const s = this.state;
    const p = s.player;
    const span = 11;
    const cell = 150 / span;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 150, 150);
    ctx.font = `700 ${Math.floor(cell * 1.05)}px ui-monospace, 'Droid Sans Mono', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const half = Math.floor(span / 2);
    for (let dy = -half; dy <= half; dy++)
      for (let dx = -half; dx <= half; dx++) {
        const x = p.x + dx;
        const y = p.y + dy;
        if (x < 0 || y < 0 || x >= SIZE || y >= SIZE || !s.level.seen[idx(x, y)]) continue;
        const t = s.level.tiles[idx(x, y)];
        const [ch, col] =
          t === 'wall' ? ['#', '#5c5446'] : t === 'pillar' ? ['O', '#7a705c'] : t === 'door' ? ['+', '#a8743a'] : t === 'open' ? ["'", '#a8743a'] : t === 'stairs' ? ['>', '#ffb347'] : ['.', '#3a352c'];
        ctx.fillStyle = col;
        ctx.fillText(ch, (dx + half + 0.5) * cell, (dy + half + 0.5) * cell);
      }
    for (const it of s.items) {
      const dx = it.x - p.x;
      const dy = it.y - p.y;
      if (Math.abs(dx) > half || Math.abs(dy) > half || !s.level.seen[idx(it.x, it.y)]) continue;
      ctx.fillStyle = '#ffd36b';
      ctx.fillText('!', (dx + half + 0.5) * cell, (dy + half + 0.5) * cell);
    }
    for (const m of s.monsters) {
      const dx = m.x - p.x;
      const dy = m.y - p.y;
      if (Math.abs(dx) > half || Math.abs(dy) > half || !m.awake) continue;
      ctx.fillStyle = '#ff4d4d';
      ctx.fillText(MAP_GLYPH[m.kind], (dx + half + 0.5) * cell, (dy + half + 0.5) * cell);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillText('^>v<'[p.dir], (half + 0.5) * cell, (half + 0.5) * cell);
  }
}
