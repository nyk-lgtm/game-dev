// Hexhold controller: the run (seed + tick-stamped actions), the frame loop,
// touch input on the board, and the bottom panel (wave preview, tower
// palette with a build preview, tower details).

import { Sfx } from '../afterglow/audio';
import { closeOverlay, showCard } from '../shared/cards';
import { dailySeed, leaveDaily, loadDaily, prettyDay, recordDaily, todayKey } from '../shared/daily';
import { copyText, toast } from '../shared/debug';
import { pxToHex } from '../shared/hexlayout';
import { makeStore } from '../shared/storage';
import {
  ADJ,
  BEACON_BOOST,
  ENEMIES,
  HEXES,
  LEVEL_DMG,
  MAX_LEVEL,
  POS,
  RULES_VERSION,
  SELL_BACK,
  SPECS,
  TICK,
  TOWERS,
  TOWER_IDS,
  WAVES,
  act,
  blockedSet,
  buildError,
  encode,
  flowField,
  newGame,
  replay,
  specCost,
  specOf,
  step,
  towerStats,
  upgradeCost,
  wavePlan,
  WAVE_COST,
  FLY_DIST,
  type Action,
  type EnemyId,
  type State,
  type Tower,
  type TowerId,
  type TowerStats,
} from './core';
import { drawBoard, drawTowerIcon, layout, pathCells, type Effect, type View } from './render/draw';

export const store = makeStore('hexhold.');
const $ = (id: string) => document.getElementById(id)!;

interface Profile {
  best: number;
  wins: number;
  runs: number;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

/** A tower that isn't built yet, to ask what it would do on a cell. */
const probe = (cell: number, id: TowerId): Tower => ({ cell, id, level: 1, cd: 0, spent: 0, hits: 0, spec: -1, dealt: 0 });
const cells = (r: number) => (r / Math.sqrt(3)).toFixed(1);
const secs = (r: number) => `${+r.toFixed(2)}s`;

/** A tower's numbers in one line (for the tower panel and the build preview). */
function statLine(t: Tower, st: TowerStats): string {
  const sp = specOf(t);
  if (t.id === 'beacon') return `Neighbors deal <b>+${Math.round(((sp?.boost ?? BEACON_BOOST[t.level]) - 1) * 100)}%</b> damage${sp?.reach ? ' and reach a cell further' : ''}.`;
  const air = st.air ? (TOWERS[t.id].air ? ' · hits flyers' : ' · hits flyers thanks to the Bolt') : ' · ground only';
  const range = ` · range <b>${cells(st.range)}</b>`;
  switch (t.id) {
    case 'frost':
      return `Chills within <b>${cells(st.range)}</b>: <b>${sp?.deep ? 60 : 40}%</b> slower · <b>${Math.round(st.dmg)}</b> damage/s${air}`;
    case 'flame':
      return `<b>${Math.round(st.dmg)}</b> damage/s to all${range}`;
    case 'tesla':
      return `<b>${Math.round(st.dmg)}</b> damage, leaps to ${3 + (sp?.chain ?? 0)}, every ${secs(st.rate)}${range}${air}`;
    case 'mortar':
      return `<b>${Math.round(st.dmg)}</b> splash damage every ${secs(st.rate)}${range}${air}`;
    default:
      return `<b>${Math.round(st.dmg)}</b> damage every ${secs(st.rate)}${range}${air}`;
  }
}

/** The same numbers squeezed onto two short lines, for the build palette. */
function paletteStats(t: Tower, st: TowerStats): string {
  const d = Math.round(st.dmg);
  const r = `range ${cells(st.range)}${st.air ? ' · air' : ''}`;
  switch (t.id) {
    case 'beacon':
      return `+${Math.round((BEACON_BOOST[1] - 1) * 100)}% damage<br>to neighbors`;
    case 'frost':
      return `40% slow · ${d}/s<br>${r}`;
    case 'flame':
      return `${d} dmg/s, all<br>${r}`;
    case 'tesla':
      return `${d} dmg ×3 / ${secs(st.rate)}<br>${r}`;
    case 'mortar':
      return `${d} splash / ${secs(st.rate)}<br>${r}`;
    default:
      return `${d} dmg / ${secs(st.rate)}<br>${r}`;
  }
}

/** What a specialization would leave the tower doing, in a few words. */
function specPreview(t: Tower, st: TowerStats, rangeBefore: number): string {
  const sp = specOf(t);
  const d = Math.round(st.dmg);
  // Range only when the form changes it.
  const r = Math.abs(st.range - rangeBefore) > 0.01 ? ` · range ${cells(st.range)}` : '';
  switch (t.id) {
    case 'beacon':
      return `+${Math.round(((sp?.boost ?? 1) - 1) * 100)}% to neighbors${sp?.reach ? ', +1 range' : ''}`;
    case 'frost':
      return `${sp?.deep ? 60 : 40}% slow · ${d}/s${r}`;
    case 'flame':
      return `${d} dmg/s${r}`;
    case 'tesla':
      return `${d} dmg ×${3 + (sp?.chain ?? 0)} / ${secs(st.rate)}${r}`;
    default:
      return `${d} dmg / ${secs(st.rate)}${r}`;
  }
}

/** What a neighbor gives, in a few words. */
function giftShort(n: Tower): string {
  const sp = specOf(n);
  switch (n.id) {
    case 'bolt':
      return 'hits flyers';
    case 'mortar':
      return '+½ range';
    case 'frost':
      return '+30% vs chilled';
    case 'tesla':
      return 'every 4th hit stuns';
    case 'flame':
      return 'sets enemies alight';
    case 'beacon':
      return `+${Math.round(((sp?.boost ?? BEACON_BOOST[n.level]) - 1) * 100)}% damage${sp?.reach ? ', +1 range' : ''}`;
  }
}

function iconCanvas(id: TowerId, css: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  c.width = c.height = Math.round(css * dpr);
  c.style.width = c.style.height = `${css}px`;
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawTowerIcon(g, id, css / 2, css / 2, css * 0.48);
  return c;
}

export class Game {
  s!: State;
  seed = 0;
  actions: string[] = [];
  daily: string | null = null;
  replayOnly = false;
  sfx = new Sfx();
  private canvas = $('board') as HTMLCanvasElement;
  private ctx = this.canvas.getContext('2d')!;
  private view: View = layout(1, 1);
  private dpr = 1;
  private selected = -1;
  private ghost: TowerId | null = null;
  private ghostPath: number[][] | null = null;
  /** Towers that reach today's path but would not reach the ghost's. */
  private ghostBypass: number[] = [];
  /** When the current ghost was picked (a double tap must not also build). */
  private ghostAt = 0;
  /** A specialization card tapped once (the second tap buys it), and when. */
  private specPick = -1;
  private specAt = 0;
  /** Attacking towers whose range misses every path (cached per action count). */
  private idle: number[] = [];
  private idleKey = -1;
  private bannerUntil = 0;
  /** Cached: does the current or next wave bring burrowers? (key = wave*2+active) */
  private digKey = -1;
  private digShow = false;
  private effects: Effect[] = [];
  private hurt = 0;
  private speed = 1;
  private acc = 0;
  private last = 0;
  private panelKey = '';
  private lastSave = 0;
  /** Ignore panel taps briefly after a build, so a double tap can't also upgrade. */
  private guardUntil = 0;
  private ended = false;
  /** This run beat the best before it (set when it ends). */
  private newBest = false;

  constructor() {
    this.sfx.setMuted(store.load('muted', false));
    this.speed = store.load('speed', 1);
    new ResizeObserver(() => this.resize()).observe(this.canvas);
    this.canvas.addEventListener('pointerup', (e) => {
      this.sfx.unlock();
      const r = this.canvas.getBoundingClientRect();
      const h = pxToHex(this.view.L, e.clientX - r.left, e.clientY - r.top);
      const i = HEXES.findIndex((x) => x.q === h.q && x.r === h.r);
      this.tapCell(i);
    });
    $('speedBtn').onclick = () => {
      this.speed = this.speed >= 3 ? 1 : this.speed + 1;
      store.save('speed', this.speed);
      $('speedBtn').textContent = `${this.speed}×`;
    };
    $('speedBtn').textContent = `${this.speed}×`;
    document.addEventListener('visibilitychange', () => document.hidden && this.persist(true));
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------------------------------------------------------------- run

  start(seed: number, actions = '', tick = 0, fromLink = false, daily: string | null = null): void {
    this.seed = seed;
    this.daily = daily;
    this.replayOnly = fromLink;
    try {
      this.s = replay(seed, actions, tick);
      this.actions = actions ? actions.split(',') : [];
    } catch (e) {
      if (fromLink) toast(`Replay failed: ${(e as Error).message}`);
      this.s = newGame(seed);
      this.actions = [];
    }
    this.selected = -1;
    this.ghost = null;
    this.ghostPath = null;
    this.ghostBypass = [];
    this.effects = [];
    this.ended = this.s.status !== 'playing';
    this.newBest = false;
    this.specPick = -1;
    this.idleKey = -1;
    this.bannerUntil = 0;
    $('banner').classList.remove('show');
    this.panelKey = '';
    if (!fromLink) this.persist(true);
    if (this.ended) setTimeout(() => this.showEnd(), 300);
  }

  private persist(force = false): void {
    if (this.replayOnly) return;
    const now = performance.now();
    if (!force && now - this.lastSave < 3000) return;
    this.lastSave = now;
    const over = this.s.status !== 'playing';
    store.save(this.daily ? 'dailyRun' : 'run', over ? null : { v: RULES_VERSION, seed: this.seed, a: this.actions.join(','), tick: this.s.tick, day: this.daily });
  }

  private doAct(a: Action): boolean {
    if (!act(this.s, a)) return false;
    this.actions.push(encode(this.s.tick, a));
    this.persist(true);
    return true;
  }

  newGame(): void {
    closeOverlay();
    leaveDaily();
    this.start((Math.random() * 0xffffffff) >>> 0);
  }

  playDaily(fresh = false): void {
    closeOverlay();
    const day = todayKey();
    const saved = store.load<{ v: number; seed: number; a: string; tick: number; day: string } | null>('dailyRun', null);
    if (!fresh && saved && saved.v === RULES_VERSION && saved.day === day) this.start(saved.seed, saved.a, saved.tick, false, day);
    else this.start(dailySeed('hexhold', day), '', 0, false, day);
    if (this.actions.length === 0) this.banner(`Today's map · ${prettyDay(day)}`);
  }

  resumeOwn(): void {
    closeOverlay();
    leaveDaily();
    const saved = store.load<{ v: number; seed: number; a: string; tick: number } | null>('run', null);
    if (saved && saved.v === RULES_VERSION) this.start(saved.seed, saved.a, saved.tick);
    else this.newGame();
  }

  // ---------------------------------------------------------------- input

  private tapCell(i: number): void {
    if (this.s.status !== 'playing') return;
    this.specPick = -1;
    if (i < 0 || i === this.selected) {
      this.selected = -1;
      this.ghost = null;
      this.ghostPath = null;
      this.ghostBypass = [];
    } else {
      this.selected = i;
      this.ghost = null;
      this.ghostPath = null;
      this.ghostBypass = [];
      const g = this.s.ground[i];
      if (g === 'rock') toast('Solid rock: nothing can be built here.');
      if (g === 'portal' || g === 'core') {
        this.selected = -1;
        toast(g === 'portal' ? 'The portal: enemies come from here.' : 'Your core. Each enemy that reaches it costs lives.');
      }
    }
    this.sfx.click();
    this.panelKey = '';
  }

  private pickGhost(id: TowerId): void {
    this.ghost = this.ghost === id ? null : id;
    this.ghostPath = this.ghost ? pathCells(flowField(this.s.ground, blockedSet(this.s, this.selected)).dist, this.s.portals) : null;
    this.ghostBypass = this.ghostPath ? this.bypassed(pathCells(this.s.field.dist, this.s.portals).flat(), this.ghostPath.flat()) : [];
    this.ghostAt = performance.now();
    this.sfx.click();
    this.panelKey = '';
  }

  private build(): void {
    if (!this.ghost || this.selected < 0) return;
    const err = buildError(this.s, this.selected, this.ghost);
    if (err) {
      toast(err);
      return;
    }
    // The bypass warning is already on screen; just don't let a double tap on the palette build.
    if (performance.now() - this.ghostAt < 200) return;
    this.doAct({ t: 'build', cell: this.selected, tower: this.ghost });
    this.guardUntil = performance.now() + 500;
    this.sfx.pickup();
    this.ghost = null;
    this.ghostPath = null;
    this.ghostBypass = [];
    this.panelKey = '';
  }

  private sendWave(): void {
    if (this.doAct({ t: 'wave' })) {
      this.sfx.warn();
      this.banner(this.s.wave % 10 === 0 ? `Wave ${this.s.wave}: the Colossus` : `Wave ${this.s.wave}`);
      this.selected = -1;
      this.ghost = null;
      this.ghostPath = null;
      this.ghostBypass = [];
      this.panelKey = '';
    }
  }

  // ---------------------------------------------------------------- loop

  private resize(): void {
    const r = this.canvas.getBoundingClientRect();
    if (r.width < 2) return;
    this.dpr = Math.min(2.5, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    this.view = layout(r.width, r.height);
  }

  private frame(t: number): void {
    requestAnimationFrame((x) => this.frame(x));
    const dt = this.last ? Math.min(0.1, (t - this.last) / 1000) : 0;
    this.last = t;
    const s = this.s;
    if (!s) return;
    const time = t / 1000;
    if (s.status === 'playing' && (s.active || s.queue.length)) {
      this.acc += dt * this.speed;
      let n = 0;
      while (this.acc >= TICK && n++ < 12) {
        this.acc -= TICK;
        step(s);
        this.drainFx(time);
        if (s.status !== 'playing') break;
      }
      this.persist();
    } else this.acc = 0;
    if (s.status !== 'playing' && !this.ended) this.finish();
    this.hurt = Math.max(0, this.hurt - dt * 2);
    this.effects = this.effects.filter((f) => time - f.t0 < f.life);
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    drawBoard(g, this.view, s, { time, selected: this.selected, ghost: this.ghost, ghostPath: this.ghostPath, bypass: this.ghostBypass, idle: this.idleTowers(), showDig: this.showDig(), effects: this.effects, hurt: this.hurt });
    // Timers can be throttled; the frame loop makes sure a banner never outstays its time.
    if (this.bannerUntil && performance.now() > this.bannerUntil) {
      this.bannerUntil = 0;
      $('banner').classList.remove('show');
    }
    this.hud();
    this.panel();
  }

  private drainFx(time: number): void {
    const s = this.s;
    for (const f of s.fx) {
      if (this.effects.length > 160) break;
      switch (f.type) {
        case 'shot':
          this.effects.push({ kind: 'shot', pts: [posX(f.from), posY(f.from), f.x, f.y], color: TOWERS[f.tower].color, t0: time, life: 0.12 });
          break;
        case 'burst':
          this.effects.push({ kind: 'burst', pts: [f.x, f.y], color: '#ffb35c', t0: time, life: 0.35, r: f.r });
          this.sfx.boom();
          break;
        case 'chain':
          this.effects.push({ kind: 'chain', pts: [posX(f.from), posY(f.from), ...f.pts], color: '#d9bfff', t0: time, life: 0.18 });
          this.sfx.zap();
          break;
        case 'die':
          this.effects.push({ kind: 'die', pts: [f.x, f.y], color: ENEMIES[f.id].color, t0: time, life: 0.4 });
          this.effects.push({ kind: 'gold', pts: [f.x, f.y], color: '', t0: time, life: 0.8, text: `+${f.gold}` });
          this.sfx.kill(f.id === 'boss');
          break;
        case 'leak':
          this.hurt = 1;
          this.sfx.hurt();
          navigator.vibrate?.(30);
          break;
        case 'wave':
          this.persist(true);
          this.banner(`Wave ${f.wave} held · +${f.bonus} gold${f.lost ? ` · −${f.lost}♥` : ''}`);
          this.sfx.levelUp();
          this.panelKey = '';
          break;
      }
    }
    s.fx.length = 0;
  }

  private hud(): void {
    const s = this.s;
    $('wave').textContent = `${s.wave}/${WAVES}`;
    $('lives').textContent = String(s.lives);
    $('lives').classList.toggle('low', s.lives <= 5);
    $('gold').textContent = String(s.gold);
  }

  private bannerTimer = 0;
  private banner(text: string): void {
    const b = $('banner');
    b.textContent = text;
    b.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerUntil = performance.now() + 1800;
    this.bannerTimer = window.setTimeout(() => b.classList.remove('show'), 1800);
  }

  // ---------------------------------------------------------------- panel

  private panel(): void {
    const s = this.s;
    const t = this.selected >= 0 ? s.towers[this.selected] : null;
    // Rebuild only when something the panel shows has changed.
    const key = [this.selected, this.ghost, s.gold, s.wave, s.active, s.status, t?.level ?? 0, t?.spec ?? -1, Math.floor((t?.dealt ?? 0) / 25), s.enemies.length + s.queue.length, s.towers.filter(Boolean).length].join('|');
    if (key === this.panelKey) return;
    this.panelKey = key;
    const p = $('panel');
    p.innerHTML = '';
    if (s.status !== 'playing') {
      p.appendChild(el('div', 'title', s.status === 'won' ? 'The hold stands' : 'The core has fallen'));
      const b = el('button', 'primary');
      b.textContent = 'Results';
      b.onclick = () => this.showEnd();
      p.appendChild(b);
      return;
    }
    if (t) return this.towerPanel(p);
    if (this.selected >= 0 && s.ground[this.selected] !== 'rock') return this.buildPanel(p);
    this.wavePanel(p);
  }

  /** A title row with a close button that returns to the wave panel. */
  private titleRow(html: string): HTMLElement {
    const row = el('div', 'title', html);
    const x = el('button', 'close', '✕');
    x.setAttribute('aria-label', 'Close');
    x.onclick = () => this.tapCell(-1);
    row.appendChild(x);
    return row;
  }

  private wavePanel(p: HTMLElement): void {
    const s = this.s;
    if (s.active) {
      const total = wavePlan(s.seed, s.wave).length;
      const left = s.queue.length + s.enemies.length;
      p.appendChild(el('div', 'title', `Wave ${s.wave} <span>${left} enem${left === 1 ? 'y' : 'ies'} left</span>`));
      p.appendChild(el('div', 'progress', `<i style="width:${Math.round((100 * (total - Math.min(total, left))) / total)}%"></i>`));
      p.appendChild(el('div', 'text', 'You can keep building while they come. Tap an empty hex to build, or a tower to upgrade it.'));
      return;
    }
    const next = s.wave + 1;
    const plan = wavePlan(s.seed, next);
    const counts = new Map<EnemyId, number>();
    for (const id of plan) counts.set(id, (counts.get(id) ?? 0) + 1);
    p.appendChild(el('div', 'title', `Next: wave ${next} of ${WAVES} <span>${plan.length} enemies</span>`));
    const chips = el('div', 'chips');
    for (const [id, n] of counts) chips.appendChild(el('span', 'chip', `<i style="background:${ENEMIES[id].color}"></i>${ENEMIES[id].name} ×${n}${ENEMIES[id].leak > 1 ? ` <em>−${ENEMIES[id].leak}♥</em>` : ''}`));
    p.appendChild(chips);
    // The threat that makes up most of the wave, in a sentence (the Colossus always gets the line).
    const weight = (id: EnemyId) => (counts.get(id) ?? 0) * WAVE_COST[id];
    const special = (['digger', 'flyer', 'brute', 'healer', 'splitter', 'swarm'] as EnemyId[]).filter((id) => counts.has(id));
    const notable = counts.has('boss') ? 'boss' : special.sort((a, b) => weight(b) - weight(a))[0];
    const costly = [...counts.keys()].find((id) => ENEMIES[id].leak > 1);
    const legend = costly ? `<br><span class="note"><em>−${ENEMIES[costly].leak}♥</em> = lives lost for each one that reaches your core.</span>` : '';
    p.appendChild(
      el(
        'div',
        'text',
        (notable ? `<b>${ENEMIES[notable].name}:</b> ${ENEMIES[notable].text}` : s.wave === 0 ? (s.portals.length > 1 ? 'Two portals on this map: enemies take turns. Towers are walls: make both paths long.' : 'Tap an empty hex to build a tower. Towers are walls: make the path long.') : 'Build, upgrade, then send it.') + legend,
      ),
    );
    const b = el('button', 'primary');
    b.textContent = `Send wave ${next}`;
    b.onclick = () => this.sendWave();
    const foot = el('div', 'foot');
    foot.appendChild(b);
    p.appendChild(foot);
  }

  private buildPanel(p: HTMLElement): void {
    const s = this.s;
    const cell = this.selected;
    const ley = s.ground[cell] === 'ley' ? ' · ley line: +25% damage' : '';
    if (!this.ghost) {
      p.appendChild(this.titleRow(`<span class="t">Build here</span><span>${s.gold} gold${ley}</span>`));
      const pal = el('div', 'palette');
      for (const id of TOWER_IDS) {
        const b = el('button');
        if (s.gold < TOWERS[id].cost) b.classList.add('poor');
        b.appendChild(iconCanvas(id, 34));
        const t = probe(cell, id);
        b.appendChild(el('span', '', `${TOWERS[id].name} <small>${TOWERS[id].cost}</small><i>${paletteStats(t, towerStats(s, t))}</i>`));
        b.onclick = () => this.pickGhost(id);
        pal.appendChild(b);
      }
      p.appendChild(pal);
      return;
    }
    const def = TOWERS[this.ghost];
    p.appendChild(this.titleRow(`<span class="t">${def.name}</span><span>${def.cost} gold${ley}</span>`));
    const t = probe(cell, this.ghost);
    const err = buildError(s, cell, this.ghost);
    const bypass = err ? 0 : this.ghostBypass.length;
    // With a warning to show, the description gives way so the buttons stay in view.
    p.appendChild(el('div', 'text', `${statLine(t, towerStats(s, t))}${bypass ? '' : `<br>${def.text}<br><span class="gift">Next to it: ${def.aura}</span>`}`));
    const len = (ps: number[][]) => ps.reduce((a, p) => a + p.length, 0) / ps.length;
    const gain = this.ghostPath ? Math.round(len(this.ghostPath) - len(pathCells(s.field.dist, s.portals))) : 0;
    if (err) p.appendChild(el('div', 'text warn', err));
    else if (gain !== 0) p.appendChild(el('div', 'text', `Path ${gain > 0 ? '+' : '−'}${Math.abs(gain)} hex${Math.abs(gain) === 1 ? '' : 'es'} ${gain > 0 ? 'longer' : 'shorter'} (blue dashes).`));
    const foot = el('div', 'foot');
    if (bypass)
      foot.appendChild(
        el('div', 'alert', `⚠ The path now avoids <b>${bypass === 1 ? '1 tower' : `${bypass} towers`}</b> (circled red): ${bypass === 1 ? 'it' : 'they'} can no longer hit anything.`),
      );
    const row = el('div', 'row');
    const back = el('button', 'secondary');
    back.textContent = 'Back';
    back.onclick = () => this.pickGhost(this.ghost!);
    const go = el('button', bypass ? 'primary danger' : 'primary');
    go.textContent = bypass ? 'Build anyway' : `Build ${def.name}`;
    go.disabled = !!err;
    go.onclick = () => this.build();
    row.append(back, go);
    foot.appendChild(row);
    p.appendChild(foot);
  }

  private showDig(): boolean {
    const s = this.s;
    const key = s.wave * 2 + (s.active ? 1 : 0);
    if (key !== this.digKey) {
      this.digKey = key;
      const plan = s.active ? wavePlan(s.seed, s.wave) : s.wave < WAVES ? wavePlan(s.seed, s.wave + 1) : [];
      this.digShow = plan.includes('digger');
    }
    return this.digShow || s.enemies.some((e) => e.id === 'digger');
  }

  /** Attacking towers that reach some cell of the old path but none of the new one. */
  private bypassed(before: number[], after: number[]): number[] {
    const s = this.s;
    const out: number[] = [];
    for (const t of s.towers) {
      if (!t || TOWERS[t.id].range === 0) continue;
      const r = towerStats(s, t).range;
      const reaches = (path: number[]) => path.some((c) => (POS[c].x - POS[t.cell].x) ** 2 + (POS[c].y - POS[t.cell].y) ** 2 <= r * r);
      if (reaches(before) && !reaches(after)) out.push(t.cell);
    }
    return out;
  }

  /** Attacking towers whose range misses every path (walking, flying if it hits flyers, digging when burrowers come). */
  private idleTowers(): number[] {
    const s = this.s;
    const key = this.actions.length * 2 + (this.showDig() ? 1 : 0);
    if (key === this.idleKey) return this.idle;
    this.idleKey = key;
    const walk = pathCells(s.field.dist, s.portals).flat();
    const fly = pathCells(FLY_DIST, s.portals).flat();
    const dig = this.showDig() ? pathCells(s.dig, s.portals).flat() : [];
    this.idle = [];
    for (const t of s.towers) {
      if (!t || TOWERS[t.id].range === 0) continue;
      const st = towerStats(s, t);
      const r2 = st.range * st.range;
      const near = (c: number) => (POS[c].x - POS[t.cell].x) ** 2 + (POS[c].y - POS[t.cell].y) ** 2 <= r2;
      if (!walk.some(near) && !dig.some(near) && !(st.air && fly.some(near))) this.idle.push(t.cell);
    }
    return this.idle;
  }

  private towerPanel(p: HTMLElement): void {
    const s = this.s;
    const t = s.towers[this.selected]!;
    const def = TOWERS[t.id];
    const sp = specOf(t);
    const choosing = t.level >= MAX_LEVEL && t.spec < 0;
    const refund = Math.floor(t.spent * SELL_BACK);
    const sell = el('button', 'secondary');
    sell.onclick = () => {
      if (performance.now() < this.guardUntil) return;
      if (this.doAct({ t: 'sell', cell: t.cell })) {
        this.sfx.click();
        this.selected = -1;
        this.panelKey = '';
      } else toast("Can't sell that now");
    };
    const name = `<span class="t">${sp ? `${sp.name} <small>(${def.name})</small>` : `${def.name} · level ${t.level}`}</span>`;
    if (choosing) {
      // Sell moves up to the title row, well away from the two cards.
      const row = this.titleRow(name);
      sell.classList.add('mini');
      sell.textContent = `Sell +${refund}`;
      row.insertBefore(sell, row.lastChild);
      p.appendChild(row);
    } else p.appendChild(this.titleRow(`${name}<span>${t.id === 'beacon' ? '' : `${Math.round(t.dealt).toLocaleString()} dealt`}</span>`));
    const gifts = ADJ[t.cell].map((j) => s.towers[j]).filter((x): x is NonNullable<typeof x> => !!x);
    const got = [...new Set(gifts.map(giftShort))];
    // A beacon's line already says what it gives.
    const gives = t.id === 'beacon' ? '' : `<br><span class="gift">Gives neighbors: ${def.aura}</span>`;
    const idle = this.idleTowers().includes(t.cell) ? '<br><span class="warn">⚠ Out of reach: no path passes within its range, so it can’t hit anything here.</span>' : '';
    // While choosing a form the cards need the room: just the numbers (and any warning).
    const more = choosing ? '' : `${gives}<br>${got.length ? `Gets: ${got.join(' · ')}` : 'No neighbors yet.'}`;
    p.appendChild(el('div', 'text', `${statLine(t, towerStats(s, t))}${idle}${more}`));
    if (choosing) {
      // Choose a specialization: two forms side by side, each showing what it would do. One tap picks, a second buys.
      const cost = specCost(t.id);
      const pick = el('div', 'specs');
      SPECS[t.id].forEach((sd, k) => {
        const b = el('button', 'spec');
        const after = { ...t, spec: k };
        const on = this.specPick === k;
        if (on) b.classList.add('on');
        b.innerHTML = `<b>${sd.name}</b><small>${sd.text}</small><i>→ ${specPreview(after, towerStats(s, after), towerStats(s, t).range)}</i><em>${on ? `Tap again: buy for ${cost}` : `${cost} gold`}</em>`;
        b.disabled = s.gold < cost;
        b.onclick = () => {
          const now = performance.now();
          if (now < this.guardUntil) return;
          if (this.specPick !== k) {
            this.specPick = k;
            this.specAt = now;
            this.sfx.click();
            this.panelKey = '';
            return;
          }
          if (now - this.specAt < 200) return;
          if (this.doAct({ t: 'spec', cell: t.cell, pick: k })) {
            this.specPick = -1;
            this.sfx.evolve();
            this.banner(`${def.name} becomes ${sd.name}`);
            this.panelKey = '';
          }
        };
        pick.appendChild(b);
      });
      p.appendChild(pick);
      return;
    }
    sell.textContent = `Sell +${refund}`;
    const row = el('div', 'row');
    row.append(sell);
    if (t.level < MAX_LEVEL) {
      const cost = upgradeCost(t.id, t.level);
      const up = el('button', 'primary');
      up.textContent = `Upgrade ${cost} → ${t.id === 'beacon' ? `+${Math.round((BEACON_BOOST[t.level + 1] - 1) * 100)}%` : `×${LEVEL_DMG[t.level + 1]}`}`;
      up.disabled = s.gold < cost;
      up.onclick = () => {
        if (performance.now() < this.guardUntil) return;
        if (this.doAct({ t: 'up', cell: t.cell })) {
          this.sfx.evolve();
          this.panelKey = '';
        }
      };
      row.append(up);
    }
    const foot = el('div', 'foot');
    foot.appendChild(row);
    p.appendChild(foot);
  }

  // ---------------------------------------------------------------- cards

  private finish(): void {
    this.ended = true;
    const s = this.s;
    if (s.status === 'won') this.sfx.victory();
    else this.sfx.defeat();
    if (!this.replayOnly) {
      const prof = store.load<Profile>('profile', { best: 0, wins: 0, runs: 0 });
      prof.runs++;
      const held = s.status === 'won' ? WAVES : s.wave - 1;
      this.newBest = held > prof.best && held > 0;
      prof.best = Math.max(prof.best, held);
      if (s.status === 'won') prof.wins++;
      store.save('profile', prof);
      if (this.daily) recordDaily(store, (s.status === 'won' ? 1000 : 0) + s.wave * 10 + s.lives, s.status === 'won' ? `held · ${s.lives}♥` : `wave ${s.wave}`, this.daily);
      this.persist(true);
    }
    setTimeout(() => this.showEnd(), 800);
  }

  showEnd(): void {
    const s = this.s;
    const won = s.status === 'won';
    const dealt = Object.entries(s.stats.dealt).sort((a, b) => b[1]! - a[1]!) as [TowerId, number][];
    const top = dealt[0]?.[1] || 1;
    const bars = dealt
      .map(([id, n]) => `<div class="dmg"><span style="width:60px">${TOWERS[id].name}</span><div class="bar"><i style="width:${(100 * n) / top}%;background:${TOWERS[id].color}"></i></div><span>${Math.round(n).toLocaleString()}</span></div>`)
      .join('');
    const prof = store.load<Profile>('profile', { best: 0, wins: 0, runs: 0 });
    const record = this.newBest
      ? ' <b>New best!</b>'
      : prof.wins
        ? ` ${prof.wins} win${prof.wins > 1 ? 's' : ''} so far.`
        : prof.best
          ? ` Your best: ${prof.best} wave${prof.best > 1 ? 's' : ''} held.`
          : '';
    showCard(
      `<h2>${won ? 'The hold stands' : 'The core has fallen'}</h2>
      <p>${won ? `All ${WAVES} waves held with ${s.lives} lives to spare.` : `Held ${s.wave - 1} of ${WAVES} waves; the core fell on wave ${s.wave}.`} ${s.stats.kills} enem${s.stats.kills === 1 ? 'y' : 'ies'} stopped.${record}</p>
      ${this.daily ? `<p><b>Today's map · ${prettyDay(this.daily)}</b>: best ${loadDaily(store, this.daily)?.label ?? '—'}</p>` : ''}
      ${bars}
      ${s.stats.chilled > 1 ? `<p style="font-size:13px">Frost kept enemies slowed for ${Math.round(s.stats.chilled)} enemy-seconds; its share above includes the extra damage chilled enemies took from its neighbors.</p>` : ''}`,
      [
        { label: 'New map', primary: true, onClick: () => this.newGame() },
        ...(this.daily ? [{ label: 'Retry today’s map', onClick: () => this.playDaily(true) }] : []),
        { label: 'Back to Game Lab', onClick: () => (location.href = '../') },
      ],
      false,
    );
  }

  showMenu(): void {
    const muted = this.sfx.muted;
    showCard(`<h2>Hexhold</h2><p>Wave ${this.s.wave} of ${WAVES} · ${this.s.lives} lives${this.daily ? ' · today’s map' : ''}</p>`, [
      { label: 'Resume', primary: true, onClick: closeOverlay },
      { label: 'How to play', onClick: () => this.showHelp() },
      { label: 'Towers', onClick: () => this.showTowers() },
      this.daily ? { label: 'Back to my map', onClick: () => this.resumeOwn() } : { label: `Today's map · ${loadDaily(store)?.label ?? 'not played'}`, onClick: () => this.playDaily() },
      {
        label: muted ? 'Sound: off' : 'Sound: on',
        onClick: () => {
          this.sfx.setMuted(!muted);
          store.save('muted', !muted);
          this.showMenu();
        },
      },
      { label: 'Copy bug report', onClick: () => this.copyReport() },
      {
        label: 'New map',
        onClick: () =>
          showCard('<h2>Abandon this map?</h2>', [
            { label: 'New map', primary: true, onClick: () => this.newGame() },
            { label: 'Cancel', onClick: () => this.showMenu() },
          ]),
      },
      { label: 'Back to Game Lab', onClick: () => (location.href = '../') },
    ]);
  }

  showHelp(): void {
    store.save('seenHelp', true);
    showCard(
      `<h2>Hexhold</h2>
      <p>Enemies pour out of the portal (some maps have two) and walk the shortest open path to your core. Hold for ${WAVES} waves.</p>
      <ul>
        <li><b>Towers are walls.</b> Tap an empty hex, pick a tower, and see the new path (blue dashes) before you build. Make them walk the long way round. You can never fully seal the path.</li>
        <li><b>Neighbors matter.</b> Every tower gives something to the six hexes around it: Bolts let neighbors hit flyers, Frost makes neighbors hit chilled enemies harder, Beacons boost everything next to them. Clusters are strong.</li>
        <li><b>Glowing hexes</b> are ley lines: towers built on them hit 25% harder.</li>
        <li>Check the next wave before sending it: Wisps fly over the maze, Brutes shrug off small hits, Menders heal their friends, Burrowers dig straight under your maze.</li>
        <li>Most enemies cost 1 life if they reach your core; Brutes and Burrowers cost 2 (the <b>−2♥</b> on the wave preview) and the Colossus 6.</li>
        <li>Tap a tower to upgrade or sell it. Use the speed button when things are under control.</li>
      </ul>`,
      [{ label: 'Hold the line', primary: true, onClick: closeOverlay }],
    );
  }

  showTowers(): void {
    showCard(
      `<h2>Towers</h2><p>At level 3 each tower can specialize into one of two forms.</p>${TOWER_IDS.map((id) => `<p><b style="color:${TOWERS[id].color}">${TOWERS[id].name}</b> · ${TOWERS[id].cost} gold<br>${TOWERS[id].text} ${TOWERS[id].air ? 'Hits flyers.' : TOWERS[id].range ? 'Ground only (a Bolt next to it lets it hit flyers).' : ''}<br><i>Neighbors: ${TOWERS[id].aura}</i><br>Becomes <b>${SPECS[id][0].name}</b> or <b>${SPECS[id][1].name}</b>.</p>`).join('')}`,
      [{ label: 'Close', primary: true, onClick: closeOverlay }],
    );
  }

  async copyReport(): Promise<void> {
    const a = this.actions.join(',');
    const url = `${location.origin}${location.pathname}?seed=${this.seed}&a=${a || '-'}&t=${this.s.tick}`;
    toast((await copyText(`HEXHOLD v${RULES_VERSION} seed=${this.seed} t=${this.s.tick} a=${a}\n${url}`)) ? 'Bug report copied' : 'Copy failed');
  }
}

const posX = (i: number) => POS[i].x;
const posY = (i: number) => POS[i].y;
