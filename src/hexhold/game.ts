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
  ENEMIES,
  HEXES,
  LEVEL_DMG,
  MAX_LEVEL,
  POS,
  RULES_VERSION,
  SELL_BACK,
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
  step,
  towerStats,
  upgradeCost,
  wavePlan,
  type Action,
  type EnemyId,
  type State,
  type TowerId,
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
  private ghostPath: number[] | null = null;
  private effects: Effect[] = [];
  private hurt = 0;
  private speed = 1;
  private acc = 0;
  private last = 0;
  private panelKey = '';
  private lastSave = 0;
  private ended = false;

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
    this.effects = [];
    this.ended = this.s.status !== 'playing';
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
    if (i < 0 || i === this.selected) {
      this.selected = -1;
      this.ghost = null;
      this.ghostPath = null;
    } else {
      this.selected = i;
      this.ghost = null;
      this.ghostPath = null;
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
    this.ghostPath = this.ghost ? pathCells(flowField(this.s.ground, blockedSet(this.s, this.selected)).dist) : null;
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
    this.doAct({ t: 'build', cell: this.selected, tower: this.ghost });
    this.sfx.pickup();
    this.ghost = null;
    this.ghostPath = null;
    this.panelKey = '';
  }

  private sendWave(): void {
    if (this.doAct({ t: 'wave' })) {
      this.sfx.warn();
      this.banner(this.s.wave % 10 === 0 ? `Wave ${this.s.wave}: the Colossus` : `Wave ${this.s.wave}`);
      this.selected = -1;
      this.ghost = null;
      this.ghostPath = null;
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
    drawBoard(g, this.view, s, { time, selected: this.selected, ghost: this.ghost, ghostPath: this.ghostPath, effects: this.effects, hurt: this.hurt });
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
          this.banner(`Wave ${f.wave} held · +${f.bonus} gold`);
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
    this.bannerTimer = window.setTimeout(() => b.classList.remove('show'), 1800);
  }

  // ---------------------------------------------------------------- panel

  private panel(): void {
    const s = this.s;
    const t = this.selected >= 0 ? s.towers[this.selected] : null;
    // Rebuild only when something the panel shows has changed.
    const key = [this.selected, this.ghost, s.gold, s.wave, s.active, s.status, t?.level ?? 0, s.enemies.length + s.queue.length, s.towers.filter(Boolean).length].join('|');
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
    for (const [id, n] of counts) chips.appendChild(el('span', 'chip', `<i style="background:${ENEMIES[id].color}"></i>${ENEMIES[id].name} ×${n}`));
    p.appendChild(chips);
    // The most notable threat, in a sentence.
    const notable = (['boss', 'flyer', 'brute', 'healer', 'splitter', 'swarm'] as EnemyId[]).find((id) => counts.has(id));
    p.appendChild(
      el(
        'div',
        'text',
        notable ? `<b>${ENEMIES[notable].name}:</b> ${ENEMIES[notable].text}` : s.wave === 0 ? 'Tap an empty hex to build a tower. Towers are walls: make the path long.' : 'Build, upgrade, then send it.',
      ),
    );
    const b = el('button', 'primary');
    b.textContent = `Send wave ${next}`;
    b.onclick = () => this.sendWave();
    p.appendChild(b);
  }

  private buildPanel(p: HTMLElement): void {
    const s = this.s;
    const cell = this.selected;
    const ley = s.ground[cell] === 'ley' ? ' · ley line: +25% damage' : '';
    if (!this.ghost) {
      p.appendChild(el('div', 'title', `Build here <span>${s.gold} gold${ley}</span>`));
      const pal = el('div', 'palette');
      for (const id of TOWER_IDS) {
        const b = el('button');
        if (s.gold < TOWERS[id].cost) b.classList.add('poor');
        b.appendChild(iconCanvas(id, 38));
        b.appendChild(el('span', '', `${TOWERS[id].name}<small>${TOWERS[id].cost}</small>`));
        b.onclick = () => this.pickGhost(id);
        pal.appendChild(b);
      }
      p.appendChild(pal);
      return;
    }
    const def = TOWERS[this.ghost];
    p.appendChild(el('div', 'title', `${def.name} <span>${def.cost} gold${ley}</span>`));
    p.appendChild(el('div', 'text', `${def.text}<br><span class="gift">Next to it: ${def.aura}</span>`));
    const err = buildError(s, cell, this.ghost);
    const gain = this.ghostPath ? this.ghostPath.length - pathCells(s.field.dist).length : 0;
    if (err) p.appendChild(el('div', 'text warn', err));
    else if (gain !== 0) p.appendChild(el('div', 'text', `Path ${gain > 0 ? `+${gain} hexes longer` : `${gain} hexes`} (blue dashes).`));
    const row = el('div', 'row');
    const back = el('button', 'secondary');
    back.textContent = 'Back';
    back.onclick = () => this.pickGhost(this.ghost!);
    const go = el('button', 'primary');
    go.textContent = `Build ${def.name}`;
    go.disabled = !!err;
    go.onclick = () => this.build();
    row.append(back, go);
    p.appendChild(row);
  }

  private towerPanel(p: HTMLElement): void {
    const s = this.s;
    const t = s.towers[this.selected]!;
    const def = TOWERS[t.id];
    const st = towerStats(s, t);
    p.appendChild(el('div', 'title', `${def.name} · level ${t.level} <span>${Math.round(s.stats.dealt[t.id] ?? 0).toLocaleString()} dmg by all ${def.name}s</span>`));
    const gifts = ADJ[t.cell].map((j) => s.towers[j]).filter((x): x is NonNullable<typeof x> => !!x);
    const got = [...new Set(gifts.map((x) => TOWERS[x.id].aura))];
    const stats =
      t.id === 'beacon'
        ? 'Boosts every neighbor by 25%.'
        : `Damage <b>${Math.round(st.dmg * (def.rate === 0 ? 1 : 1))}</b>${def.rate === 0 ? '/s' : ` every ${def.rate}s`} · range <b>${(st.range / Math.sqrt(3)).toFixed(1)}</b>${st.air ? ' · hits flyers' : ''}`;
    p.appendChild(el('div', 'text', `${stats}<br><span class="gift">Gives neighbors: ${def.aura}</span>${got.length ? `<br>Gets: ${got.join(' ')}` : '<br>No neighbors yet.'}`));
    const row = el('div', 'row');
    const sell = el('button', 'secondary');
    sell.textContent = `Sell +${Math.floor(t.spent * SELL_BACK)}`;
    sell.onclick = () => {
      if (this.doAct({ t: 'sell', cell: t.cell })) {
        this.sfx.click();
        this.selected = -1;
        this.panelKey = '';
      } else toast("Can't sell that now");
    };
    const up = el('button', 'primary');
    if (t.level >= MAX_LEVEL) {
      up.textContent = 'Max level';
      up.disabled = true;
    } else {
      const cost = upgradeCost(t.id, t.level);
      up.textContent = `Upgrade ${cost}${def.rate === 0 && t.id === 'beacon' ? '' : ` → ×${LEVEL_DMG[t.level + 1]}`}`;
      up.disabled = s.gold < cost;
      up.onclick = () => {
        if (this.doAct({ t: 'up', cell: t.cell })) {
          this.sfx.evolve();
          this.panelKey = '';
        }
      };
    }
    row.append(sell, up);
    p.appendChild(row);
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
      prof.best = Math.max(prof.best, s.status === 'won' ? WAVES : s.wave - 1);
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
    const best = store.load<Profile>('profile', { best: 0, wins: 0, runs: 0 });
    showCard(
      `<h2>${won ? 'The hold stands' : 'The core has fallen'}</h2>
      <p>${won ? `All ${WAVES} waves held with ${s.lives} lives to spare.` : `Fell on wave ${s.wave} of ${WAVES}.`} ${s.stats.kills} enem${s.stats.kills === 1 ? 'y' : 'ies'} stopped.${best.best ? ` Best: ${best.wins ? `${best.wins} win${best.wins > 1 ? 's' : ''}` : `wave ${best.best}`}.` : ''}</p>
      ${this.daily ? `<p><b>Today's map · ${prettyDay(this.daily)}</b>: best ${loadDaily(store, this.daily)?.label ?? '—'}</p>` : ''}
      ${bars}`,
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
      <p>Enemies pour out of the portal and walk the shortest open path to your core. Hold for ${WAVES} waves.</p>
      <ul>
        <li><b>Towers are walls.</b> Tap an empty hex, pick a tower, and see the new path (blue dashes) before you build. Make them walk the long way round. You can never fully seal the path.</li>
        <li><b>Neighbors matter.</b> Every tower gives something to the six hexes around it: Bolts let neighbors hit flyers, Frost makes neighbors hit chilled enemies harder, Beacons boost everything next to them. Clusters are strong.</li>
        <li><b>Glowing hexes</b> are ley lines: towers built on them hit 25% harder.</li>
        <li>Check the next wave before sending it: Wisps fly over the maze, Brutes shrug off small hits, Menders heal their friends.</li>
        <li>Tap a tower to upgrade or sell it. Use the speed button when things are under control.</li>
      </ul>`,
      [{ label: 'Hold the line', primary: true, onClick: closeOverlay }],
    );
  }

  showTowers(): void {
    showCard(
      `<h2>Towers</h2>${TOWER_IDS.map((id) => `<p><b style="color:${TOWERS[id].color}">${TOWERS[id].name}</b> · ${TOWERS[id].cost} gold<br>${TOWERS[id].text}<br><i>Neighbors: ${TOWERS[id].aura}</i></p>`).join('')}`,
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
