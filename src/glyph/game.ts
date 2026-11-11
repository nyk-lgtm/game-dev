// Glyphwright controller: DOM for the loom, bench and shop; tap-to-select and
// drag-and-drop; runs battles on a fixed step and saves the run as actions.

import { closeOverlay, showCard } from '../shared/cards';
import { BUILD, copyText, toast } from '../shared/debug';
import { makeStore } from '../shared/storage';
import { dailySeed, leaveDaily, loadDaily, prettyDay, recordDaily, todayKey } from '../shared/daily';
import { Sfx } from '../afterglow/audio';
import {
  BENCH_SIZE,
  CASTERS,
  ENEMIES,
  HP_GROWTH,
  MOD,
  MODS,
  SLOW_TIME,
  REROLL_COST,
  RULES_VERSION,
  RUNES,
  WAVES,
  apply,
  compileRow,
  encode,
  finishBattle,
  fits,
  get,
  isBoss,
  matchups,
  newGame,
  price,
  replay,
  sellValue,
  spellDps,
  tick,
  waveFoes,
  warnings,
  type Action,
  type EnemyKind,
  type GameState,
  type Rune,
  type Slot,
  type Spell,
  type WaveFoe,
} from './core';
import { Lane } from './lane';
import { drawSigil } from './sigils';

export const store = makeStore('glyph.');
const $ = (id: string) => document.getElementById(id)!;
const ROMAN = ['', 'I', 'II', 'III'];
const SPEEDS = [1, 2, 4];

interface Profile {
  bestWave: number;
  wins: number;
  runs: number;
}

const same = (a: Slot | null, b: Slot | null) =>
  !!a && !!b && a.area === b.area && (a.area === 'loom' ? b.area === 'loom' && a.row === b.row && a.col === b.col : (a as { i: number }).i === (b as { i: number }).i);

const slotAttr = (s: Slot) => (s.area === 'loom' ? `L${s.row}${s.col}` : s.area === 'bench' ? `b${s.i}` : `s${s.i}`);
function parseAttr(a: string): Slot {
  if (a[0] === 'L') return { area: 'loom', row: +a[1], col: +a[2] };
  if (a[0] === 'b') return { area: 'bench', i: +a[1] };
  return { area: 'shop', i: +a[1] };
}

export class Game {
  s!: GameState;
  seed = 0;
  actions: string[] = [];
  /** Opened from a replay link: don't overwrite the saved run until the player acts. */
  private replayOnly = false;
  private sel: Slot | null = null;
  private speedIdx = 0;
  private lane = new Lane();
  private canvas = $('lane') as HTMLCanvasElement;
  private ctx = this.canvas.getContext('2d')!;
  private acc = 0;
  private last = 0;
  private time = 0;
  private castGlow = [0, 0, 0];
  private slotEls = new Map<string, HTMLDivElement>();
  private sfx = new Sfx();
  private drag: { from: Slot; el: HTMLElement; x0: number; y0: number; moved: boolean; ghost?: HTMLCanvasElement; over?: string } | null = null;
  private goldBefore = 0;
  private profile: Profile = store.load<Profile>('profile', { bestWave: 0, wins: 0, runs: 0 });

  constructor() {
    this.buildDom();
    this.sfx.setMuted(store.load('muted', false));
    addEventListener('pointerdown', () => this.sfx.unlock(), { capture: true });
    $('rerollBtn').onclick = () => {
      if (this.act({ t: 'reroll' })) this.sel = null;
      this.render();
    };
    $('freezeBtn').onclick = () => {
      this.act({ t: 'freeze' });
      this.render();
    };
    $('fightBtn').onclick = () => this.fight();
    $('speedBtn').onclick = () => {
      this.speedIdx = (this.speedIdx + 1) % SPEEDS.length;
      store.save('speed', this.speedIdx);
      this.render();
    };
    $('laneInfo').onclick = () => this.showFoes();
    this.speedIdx = store.load('speed', 0) % SPEEDS.length;
    new ResizeObserver(() => this.resize()).observe(this.canvas);
    this.resize();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---- run lifecycle ----

  /** Today's date while playing the daily run, else null. */
  daily: string | null = null;
  private dailyResult: ReturnType<typeof recordDaily> | null = null;

  start(seed: number, actions = '', fromLink = false, daily: string | null = null): void {
    this.seed = seed;
    this.daily = daily;
    this.dailyResult = null;
    this.sel = null;
    this.lane = new Lane();
    try {
      this.s = replay(seed, actions);
      this.actions = actions.split(',').filter(Boolean);
    } catch (e) {
      if (fromLink) toast(`Replay failed: ${(e as Error).message}`);
      this.s = newGame(seed);
      this.actions = [];
    }
    this.replayOnly = fromLink;
    if (!fromLink) this.persist();
    this.render();
    if (this.s.phase === 'over' || this.s.phase === 'won') this.showEnd();
    else if (daily && this.actions.length === 0) this.banner('Daily run', prettyDay(daily));
  }

  newRun(): void {
    closeOverlay();
    leaveDaily();
    this.start((Math.random() * 2 ** 31) >>> 0);
  }

  /** Today's daily run: resume it if started, else begin it. */
  playDaily(fresh = false): void {
    closeOverlay();
    const day = todayKey();
    const saved = store.load<{ v: number; seed: number; a: string; day: string } | null>('dailyRun', null);
    if (!fresh && saved && saved.v === RULES_VERSION && saved.day === day) this.start(saved.seed, saved.a, false, day);
    else this.start(dailySeed('glyph', day), '', false, day);
  }

  /** Leave the daily and pick up your own saved run. */
  resumeOwn(): void {
    closeOverlay();
    leaveDaily();
    const saved = store.load<{ v: number; seed: number; a: string } | null>('run', null);
    if (saved && saved.v === RULES_VERSION) this.start(saved.seed, saved.a);
    else this.start((Math.random() * 2 ** 31) >>> 0);
  }

  private persist(): void {
    if (this.replayOnly) return;
    store.save(this.daily ? 'dailyRun' : 'run', { v: RULES_VERSION, seed: this.seed, a: this.actions.join(','), day: this.daily });
  }

  private act(a: Action): boolean {
    if (!this.s || this.s.phase !== 'build') return false;
    if (!apply(this.s, a)) return false;
    this.replayOnly = false;
    this.actions.push(encode(a));
    this.persist();
    this.sfx.click();
    return true;
  }

  private fight(): void {
    if (this.s.phase !== 'build') return;
    if (!this.s.loom.some((r) => r[0])) {
      toast('Put a caster in a row first');
      return;
    }
    this.goldBefore = this.s.gold;
    this.sel = null;
    this.act({ t: 'fight' });
    this.acc = 0;
    this.render();
  }

  private battleOver(): void {
    const s = this.s;
    const b = s.battle!;
    if (s.phase === 'over' || s.phase === 'won') {
      this.recordEnd();
      this.render();
      setTimeout(() => this.showEnd(), 700);
      return;
    }
    const gained = s.gold - this.goldBefore;
    const interest = Math.min(3, Math.floor(this.goldBefore / 5));
    const parts = [`${gained - interest - b.goldEarned} pay`, interest ? `${interest} interest` : '', b.goldEarned ? `${b.goldEarned} bounty` : ''].filter(Boolean);
    const through = Object.entries(b.leakedBy).map(([k, n]) => `${ENEMIES[k as keyof typeof ENEMIES].name}${n! > 1 ? ` ×${n}` : ''}`).join(', ');
    this.banner(`Wave ${s.wave - 1} cleared`, `+${gained}● (${parts.join(' + ')})${b.leaked ? ` · −${b.leaked} tower: ${through} got through` : ''}`);
    this.sfx.levelUp();
    this.render();
  }

  private recordEnd(): void {
    if (this.replayOnly) return;
    const p = this.profile;
    const reached = this.s.phase === 'won' ? WAVES : this.s.wave;
    p.bestWave = Math.max(p.bestWave, reached);
    p.runs++;
    if (this.s.phase === 'won') p.wins++;
    store.save('profile', p);
    if (this.daily) this.dailyResult = recordDaily(store, reached, this.s.phase === 'won' ? 'won' : `wave ${reached}`, this.daily);
  }

  // ---- frame loop ----

  private frame(t: number): void {
    requestAnimationFrame((tt) => this.frame(tt));
    const dt = Math.min(0.1, (t - (this.last || t)) / 1000);
    this.last = t;
    this.time += dt;
    if (!this.s) return;
    if (this.s.phase === 'battle' && $('overlay').hidden) {
      this.acc += dt * SPEEDS[this.speedIdx];
      let n = 0;
      while (this.acc >= 1 / 60 && n++ < 20) {
        this.acc -= 1 / 60;
        tick(this.s);
        const b = this.s.battle!;
        this.lane.consume(b.fx);
        for (const f of b.fx) {
          if (f.type === 'cast') this.castGlow[f.row] = 1;
          else if (f.type === 'leak') this.sfx.hurt();
          else if (f.type === 'kill' && isBoss(f.kind)) this.sfx.boom();
        }
        if (this.s.phase !== 'battle') {
          this.battleOver();
          break;
        }
      }
      if (n >= 20) this.acc = 0;
      if (this.s.phase === 'battle') this.renderBattleHud();
    }
    for (let r = 0; r < 3; r++) this.castGlow[r] = Math.max(0, this.castGlow[r] - dt * 3);
    this.lane.update(dt);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.lane.draw(this.ctx, w, h, this.s.phase === 'battle' ? this.s.battle : null, this.time, this.castGlow);
  }

  private resize(): void {
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.canvas.width = Math.round(this.canvas.clientWidth * dpr);
    this.canvas.height = Math.round(this.canvas.clientHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---- DOM ----

  private makeSlot(at: Slot): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'slot';
    el.dataset.slot = slotAttr(at);
    if (at.area === 'loom' && at.col === 0) el.classList.add('caster');
    el.appendChild(document.createElement('canvas'));
    el.addEventListener('pointerdown', (e) => this.down(e, at, el));
    this.slotEls.set(slotAttr(at), el);
    return el;
  }

  private buildDom(): void {
    const loom = $('loom');
    for (let row = 0; row < 3; row++) {
      const r = document.createElement('div');
      r.className = 'lrow';
      r.id = `row${row}`;
      const slots = document.createElement('div');
      slots.className = 'slots';
      for (let col = 0; col < 4; col++) slots.appendChild(this.makeSlot({ area: 'loom', row, col }));
      const sum = document.createElement('div');
      sum.className = 'sum';
      sum.onclick = () => this.showSpell(row);
      const cd = document.createElement('div');
      cd.className = 'cd';
      r.append(slots, sum, cd);
      loom.appendChild(r);
    }
    const bench = $('bench');
    for (let i = 0; i < BENCH_SIZE; i++) bench.appendChild(this.makeSlot({ area: 'bench', i }));
    const offers = $('offers');
    for (let i = 0; i < 5; i++) {
      const o = document.createElement('div');
      o.className = 'offer';
      const nm = document.createElement('div');
      nm.className = 'nm';
      o.appendChild(nm);
      o.appendChild(this.makeSlot({ area: 'shop', i }));
      const p = document.createElement('div');
      p.className = 'price';
      o.appendChild(p);
      offers.appendChild(o);
    }
  }

  private foeCache: { key: string; foes: WaveFoe[] } | null = null;
  /** The foes of the coming (or current) wave. */
  private foes(): WaveFoe[] {
    const key = `${this.s.seed}:${this.s.wave}`;
    if (this.foeCache?.key !== key) this.foeCache = { key, foes: waveFoes(this.s.seed, this.s.wave) };
    return this.foeCache.foes;
  }

  /** The row's spell if rune `r` went into its first free slot that fits (undefined if none). */
  private preview(row: number, r: Rune): Spell | null | undefined {
    const cells = this.s.loom[row];
    if (this.sel?.area === 'loom' && this.sel.row === row) return undefined;
    const caster = RUNES[r.id].kind === 'caster';
    const col = caster ? (cells[0] ? -1 : 0) : cells[0] ? cells.findIndex((x, c) => c > 0 && !x) : -1;
    if (col < 0) return undefined;
    const copy = [...cells];
    copy[col] = r;
    return compileRow(copy);
  }

  /** Where the player's copies of a rune sit, in merge order ("row 2", "bench"). */
  private where(r: Rune): string[] {
    const out: string[] = [];
    this.s.loom.forEach((row, i) => row.forEach((x) => x && x.id === r.id && x.tier === r.tier && out.push(`row ${i + 1}`)));
    for (const x of this.s.bench) if (x && x.id === r.id && x.tier === r.tier) out.push('bench');
    return out;
  }

  /** How many identical runes (id + tier) the player already owns. */
  private owned(r: Rune): number {
    return [...this.s.loom.flat(), ...this.s.bench].filter((x) => x && x.id === r.id && x.tier === r.tier).length;
  }

  render(): void {
    const s = this.s;
    if (!s) return;
    const battle = s.phase === 'battle';
    document.body.classList.toggle('battle', battle);
    $('wave').textContent = `${Math.min(s.wave, WAVES)}/${WAVES}`;
    $('hp').textContent = String(Math.max(0, s.hp));
    $('hp').classList.toggle('hurt', s.hp <= 6);
    $('gold').textContent = `${s.gold}●`;
    $('speedBtn').hidden = !battle;
    $('speedBtn').textContent = `${SPEEDS[this.speedIdx]}×`;
    for (const [key, el] of this.slotEls) {
      const at = parseAttr(key);
      const r = get(s, at);
      const c = el.firstChild as HTMLCanvasElement;
      drawSigil(c, r, el.clientWidth || 54, { dim: at.area === 'shop' && s.shop[at.i]?.sold });
      el.classList.toggle('empty', !r);
      el.classList.toggle('sel', same(at, this.sel));
      if (at.area === 'shop') {
        const o = s.shop[at.i];
        const wrap = el.parentElement!;
        wrap.classList.toggle('sold', !o || o.sold);
        wrap.classList.toggle('poor', !!o && !o.sold && price(o.rune) > s.gold);
        el.classList.toggle('merge', !!o && !o.sold && o.rune.tier < 3 && this.owned(o.rune) >= 2);
        (wrap.lastChild as HTMLElement).textContent = o ? `${price(o.rune)}●` : '';
        const nm = wrap.firstChild as HTMLElement;
        nm.textContent = o ? `${RUNES[o.rune.id].name}${o.rune.tier > 1 ? ` ${ROMAN[o.rune.tier]}` : ''}` : '';
        nm.classList.toggle('cast', !!o && RUNES[o.rune.id].kind === 'caster');
      }
    }
    // Valid targets for the current selection.
    const selRune = this.sel ? get(s, this.sel) : null;
    for (const [key, el] of this.slotEls) {
      const at = parseAttr(key);
      const ok = !!selRune && !battle && at.area !== 'shop' && !same(at, this.sel) && fits(selRune, at) && (this.sel!.area !== 'shop' || !get(s, at));
      el.classList.toggle('ok', ok);
    }
    const foes = this.foes();
    for (let row = 0; row < 3; row++) {
      const sp = compileRow(s.loom[row]);
      const warn = sp && !battle ? warnings(sp, foes)[0] : undefined;
      const pv = selRune && !battle ? this.preview(row, selRune) : undefined;
      let extra = '';
      if (pv) {
        const before = sp ? spellDps(sp) : 0;
        const after = spellDps(pv);
        const had = sp ? warnings(sp, foes).map((w) => w.text) : [];
        const bad = warnings(pv, foes).find((w) => w.level === 2 && !had.includes(w.text));
        const d = Math.round(after - before);
        extra = `<span class="up">here → ${Math.round(after)} dps${sp ? ` (${d >= 0 ? '+' : ''}${d})` : ''}${bad ? ' <span class="bad">⚠</span>' : ''}</span>`;
      } else if (warn) extra = `<span class="warn${warn.level === 2 ? ' bad' : ''}">⚠ ${warn.text}</span>`;
      const el = $(`row${row}`);
      el.querySelector('.sum')!.innerHTML = rowSummary(sp, extra);
      el.classList.toggle('pv', !!pv);
    }
    if (!battle)
      for (let row = 0; row < 3; row++) {
        const el = $(`row${row}`);
        el.classList.remove('cast');
        (el.querySelector('.cd') as HTMLElement).style.width = '0';
      }
    const reroll = $('rerollBtn') as HTMLButtonElement;
    reroll.disabled = s.gold < REROLL_COST || battle;
    $('freezeBtn').classList.toggle('on', s.frozen);
    $('freezeBtn').textContent = s.frozen ? 'Frozen ❄' : 'Freeze';
    this.renderTip();
    this.renderLaneInfo();
    if (battle) this.renderBattleHud();
  }

  private renderTip(): void {
    const tip = $('tip');
    tip.className = '';
    const s = this.s;
    if (s.phase === 'battle') return;
    const r = this.sel ? get(s, this.sel) : null;
    if (!r || !this.sel) {
      const empty = s.loom.findIndex((row) => !row[0]);
      tip.innerHTML = `<div class="txt">${
        s.wave === 1 && this.actions.length < 3
          ? 'Tap a rune in the shop to buy it. Each row casts one spell: a <b>caster</b> on the left, then up to 3 <b>modifiers</b>, read left → right.'
          : empty >= 0 && s.wave > 1
            ? `Row ${empty + 1} has no caster: it stays silent. Three identical runes merge into a stronger one.`
            : s.wave <= 3
              ? 'Tap a spell (the text beside a row) to see what each rune adds and how it fares against the next wave.'
              : 'Drag runes to rearrange. Order matters: <b>Echo</b> repeats only what is to its left. Three of a kind merge.'
      }</div>`;
      return;
    }
    const def = RUNES[r.id];
    const kind = def.kind === 'caster' ? 'caster' : 'modifier';
    const name = `<b>${def.name} ${ROMAN[r.tier]}</b> <span>${kind}</span>`;
    const div = document.createElement('div');
    div.className = 'txt';
    if (this.sel.area === 'shop') {
      // The merged rune lands where the first copy is; a second copy in another row leaves it.
      const spots = this.where(r).slice(0, 2);
      const loses = spots[1] && spots[1] !== 'bench' && spots[1] !== spots[0] ? ` <span class="bad">⚠ ${spots[1]} loses its ${def.name}</span>` : '';
      const merge = r.tier < 3 && this.owned(r) >= 2 ? ` <span class="star">★ merges with yours (${spots.join(', ')}) → ${ROMAN[r.tier + 1]}</span>${loses}` : '';
      div.innerHTML = `${name} · ${price(r)}●${merge}<br>${def.text(r.tier)}`;
      const b = document.createElement('button');
      b.className = 'primary';
      b.textContent = 'Buy';
      b.disabled = price(r) > s.gold;
      const i = this.sel.i;
      b.onclick = () => this.buy(i);
      tip.replaceChildren(div, b);
    } else {
      const n = this.owned(r);
      const set = r.tier < 3 && n > 1 ? ` · <span class="star">${n}/3 for ${ROMAN[r.tier + 1]}</span>` : '';
      div.innerHTML = `${name}${set}<br>${def.text(r.tier)}`;
      const b = document.createElement('button');
      b.className = 'secondary';
      b.textContent = `Sell +${sellValue(r)}●`;
      const at = this.sel;
      b.onclick = () => {
        if (this.act({ t: 'sell', at })) this.sel = null;
        this.render();
      };
      tip.replaceChildren(div, b);
    }
  }

  private renderLaneInfo(): void {
    const info = $('laneInfo');
    if (this.s.phase !== 'build') {
      info.innerHTML = '';
      return;
    }
    const chips = this.foes().map(({ kind: k, count: n }) => {
      const d = ENEMIES[k];
      const boss = isBoss(k);
      return `<span class="chip${boss ? ' boss' : ''}"><i style="background:hsl(${d.hue},85%,55%)"></i>${d.name}${n > 1 ? ` ×${n}` : ''}</span>`;
    });
    info.innerHTML = `<div class="head">Wave ${this.s.wave} incoming · tap for details</div>${chips.join('')}`;
  }

  private renderBattleHud(): void {
    const s = this.s;
    const b = s.battle;
    $('hp').textContent = String(Math.max(0, s.hp));
    $('hp').classList.toggle('hurt', s.hp <= 6);
    if (!b) return;
    for (let row = 0; row < 3; row++) {
      const sp = compileRow(s.loom[row]);
      const el = $(`row${row}`);
      el.classList.toggle('cast', this.castGlow[row] > 0.5);
      const cd = el.querySelector('.cd') as HTMLElement;
      cd.style.width = sp ? `${Math.max(0, Math.min(1, 1 - b.cooldowns[row] / sp.cooldown)) * 100}%` : '0';
    }
    const left = b.queue.length + b.enemies.length;
    const tip = $('tip');
    if (!tip.querySelector('#skipBtn')) {
      tip.innerHTML = '<div class="txt"></div><button id="skipBtn" class="secondary">Skip ⏭</button>';
      ($('skipBtn') as HTMLButtonElement).onclick = () => this.skip();
    }
    (tip.firstChild as HTMLElement).innerHTML = `<b>Wave ${s.wave}</b> · ${left} foe${left === 1 ? '' : 's'} left · ${b.kills} slain${b.leaked ? ` · <span style="color:var(--danger)">${b.leaked} leaked</span>` : ''}`;
  }

  /** Resolve the rest of the battle instantly. */
  private skip(): void {
    if (this.s.phase !== 'battle') return;
    finishBattle(this.s);
    this.battleOver();
  }

  private banner(title: string, sub: string): void {
    const el = $('banner');
    el.innerHTML = `${title}<small>${sub}</small>`;
    el.classList.add('show');
    clearTimeout((el as unknown as { _t: number })._t);
    (el as unknown as { _t: number })._t = window.setTimeout(() => el.classList.remove('show'), 1800);
  }

  // ---- input: tap to select, tap a target; or drag ----

  private down(e: PointerEvent, at: Slot, el: HTMLElement): void {
    if (this.s.phase !== 'build') return;
    e.preventDefault();
    const r = get(this.s, at);
    this.drag = { from: at, el, x0: e.clientX, y0: e.clientY, moved: false };
    if (!r) {
      // Taps on empty slots resolve on release.
      const up = () => {
        removeEventListener('pointerup', up);
        if (this.drag && !this.drag.moved) this.tap(at);
        this.drag = null;
      };
      addEventListener('pointerup', up);
      return;
    }
    const move = (ev: PointerEvent) => this.dragMove(ev);
    const up = (ev: PointerEvent) => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', cancel);
      this.dragEnd(ev);
    };
    const cancel = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', cancel);
      this.dragCleanup();
      this.drag = null;
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', cancel);
  }

  private dragMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 10) return;
    if (!d.moved) {
      d.moved = true;
      this.sel = d.from;
      this.render();
      const g = document.createElement('canvas');
      g.id = 'ghost';
      document.body.appendChild(g);
      drawSigil(g, get(this.s, d.from), 60);
      d.ghost = g;
      d.el.classList.add('dragging');
      if (d.from.area !== 'shop') {
        const tip = $('tip');
        tip.className = 'sellzone';
        tip.innerHTML = `Drop here to sell +${sellValue(get(this.s, d.from)!)}●`;
      }
    }
    d.ghost!.style.left = `${e.clientX}px`;
    d.ghost!.style.top = `${e.clientY}px`;
    const target = this.targetAt(e.clientX, e.clientY);
    if (target !== d.over) {
      if (d.over) (d.over === 'sell' ? $('tip') : this.slotEls.get(d.over))?.classList.remove('hover');
      d.over = target;
      if (target) (target === 'sell' ? $('tip') : this.slotEls.get(target))?.classList.add('hover');
    }
  }

  private targetAt(x: number, y: number): string | undefined {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!el) return undefined;
    if (el.closest('#tip.sellzone')) return 'sell';
    const slot = el.closest('[data-slot]') as HTMLElement | null;
    return slot?.dataset.slot;
  }

  private dragCleanup(): void {
    const d = this.drag;
    if (!d) return;
    d.ghost?.remove();
    d.el.classList.remove('dragging');
    for (const el of this.slotEls.values()) el.classList.remove('hover');
  }

  private dragEnd(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    this.dragCleanup();
    this.drag = null;
    if (!d.moved) {
      this.tap(d.from);
      return;
    }
    const target = this.targetAt(e.clientX, e.clientY);
    this.sel = null;
    if (target === 'sell') this.act({ t: 'sell', at: d.from });
    else if (target) this.place(d.from, parseAttr(target));
    this.render();
  }

  private tap(at: Slot): void {
    const s = this.s;
    const r = get(s, at);
    const sel = this.sel;
    if (!sel) {
      this.sel = r ? at : null;
    } else if (same(sel, at)) {
      if (at.area === 'shop') this.buy(at.i);
      this.sel = null;
    } else if (at.area === 'shop' || (r && sel.area === 'shop')) {
      this.sel = r ? at : null;
    } else if (!this.place(sel, at)) {
      this.sel = r ? at : null;
    } else this.sel = null;
    this.render();
  }

  /** Move or buy `from` into `to`. Explains why when it can't. */
  private place(from: Slot, to: Slot): boolean {
    if (to.area === 'shop' || same(from, to)) return false;
    const r = get(this.s, from);
    if (!r) return false;
    if (!fits(r, to)) {
      toast(RUNES[r.id].kind === 'caster' ? 'Casters go in the first slot of a row' : 'Modifiers go after the caster');
      return false;
    }
    if (from.area === 'shop') {
      if (get(this.s, to)) return false;
      if (price(r) > this.s.gold) {
        toast('Not enough gold');
        return false;
      }
      return this.buyAt(from.i, to);
    }
    const ok = this.act({ t: 'move', from, to });
    if (!ok) {
      const other = get(this.s, to);
      if (other && !fits(other, from)) toast("They can't swap: casters and modifiers have their own slots");
    }
    return ok;
  }

  private buy(i: number): void {
    const o = this.s.shop[i];
    if (!o || o.sold) return;
    if (price(o.rune) > this.s.gold) {
      toast('Not enough gold');
      return;
    }
    if (!this.buyAt(i)) toast('No room: sell something or make space on the bench');
    this.sel = null;
    this.render();
  }

  private buyAt(i: number, to?: Slot): boolean {
    const before = this.owns().length;
    const had = this.owns();
    const ok = this.act({ t: 'buy', i, to });
    if (ok) {
      this.sfx.pickup();
      // A merge happened only if we now own fewer runes than before + the one bought.
      if (this.owns().length < before + 1) {
        // The merged rune(s): owned now, not before; the highest tier last.
        const made = this.owns().filter((k) => {
          const i = had.indexOf(k);
          if (i < 0) return true;
          had.splice(i, 1);
          return false;
        });
        this.merged(made.map((k) => ({ id: k.split(':')[0], tier: Number(k.split(':')[1]) }) as Rune).filter((r) => r.tier > 1).sort((a, b) => a.tier - b.tier));
      }
    }
    return ok;
  }

  private owns(): string[] {
    return [...this.s.loom.flat(), ...this.s.bench].filter((r): r is Rune => !!r).map((r) => `${r.id}:${r.tier}`);
  }


  private merged(made: Rune[]): void {
    this.sfx.evolve();
    const r = made[made.length - 1];
    this.banner(r ? `${RUNES[r.id].name} ${ROMAN[r.tier]}!` : 'Runes merged', 'three became one: check your rows');
  }

  // ---- cards ----

  showMenu(): void {
    showCard(
      `<h2>Glyphwright</h2><p>Wave ${Math.min(this.s.wave, WAVES)} of ${WAVES} · seed ${this.seed}</p>
       <p>Best: wave ${this.profile.bestWave || '—'}${this.profile.wins ? ` · ${this.profile.wins} win${this.profile.wins > 1 ? 's' : ''}` : ''}</p>`,
      [
        { label: 'Resume', primary: true, onClick: closeOverlay },
        { label: 'How to play', onClick: () => this.showHelp() },
        { label: 'Runes', onClick: () => this.showRunes() },
        { label: 'Foes', onClick: () => this.showFoes() },
        {
          label: this.sfx.muted ? 'Sound: off' : 'Sound: on',
          onClick: () => {
            this.sfx.setMuted(!this.sfx.muted);
            store.save('muted', this.sfx.muted);
            this.showMenu();
          },
        },
        { label: 'Copy bug report', onClick: () => this.copyReport() },
        this.daily
          ? { label: 'Back to my run', onClick: () => this.resumeOwn() }
          : { label: `Daily run · ${loadDaily(store)?.label ?? 'not played'}`, onClick: () => this.playDaily() },
        {
          label: 'New run',
          onClick: () =>
            showCard('<h2>Abandon this run?</h2>', [
              { label: 'New run', primary: true, onClick: () => this.newRun() },
              { label: 'Cancel', onClick: () => this.showMenu() },
            ]),
        },
        { label: 'Back to Game Lab', onClick: () => (location.href = '../') },
      ],
    );
  }

  showHelp(): void {
    store.save('seenHelp', true);
    showCard(
      `<h2>How to play</h2>
       <ul>
        <li>Foes march down the lane toward your <b>tower</b>. Each one that reaches it costs tower HP. Survive <b>15 waves</b>.</li>
        <li>Your <b>loom</b> has three rows. Each row is one spell: a <b>caster</b> in the first slot, then up to three <b>modifiers</b>. Spells fire on their own.</li>
        <li>Modifiers apply <b>left to right</b>. <b>Echo</b> repeats the spell as built so far, so what sits after it isn't echoed.</li>
        <li>Buy runes in the shop, drag them around, or tap one and then tap where it goes. Drop on the bar above the bench to sell.</li>
        <li><b>Three identical runes merge</b> into the next tier (I → II → III). The ★ in the shop marks a rune that completes a set.</li>
        <li>Between waves you earn 5 gold, more in later waves, plus <b>interest</b>: +1 per 5 gold banked (max +3). <b>Freeze</b> keeps the shop for next wave.</li>
        <li>Armor eats a flat amount of every hit, so big hits beat many small ones. Some foes resist elements. Tap the wave preview to see them.</li>
        <li><b>Tap a spell</b> (the text beside its row) for a rune-by-rune breakdown and how it hits the next wave. <b style="color:#ffb86b">⚠</b> marks foes it struggles with.</li>
       </ul>`,
      [{ label: 'Got it', primary: true, onClick: closeOverlay }],
    );
  }

  /** The spell a loom row compiles into: rune by rune, then against the coming wave. */
  showSpell(row: number): void {
    const cells = this.s.loom[row];
    const sp = compileRow(cells);
    const close = [{ label: 'Close', primary: true, onClick: closeOverlay }];
    if (!sp) {
      showCard(
        `<h2>Row ${row + 1} is silent</h2><p>Put a <b>caster</b> (Bolt, Beam, Nova, Rain or Orb) in its first slot. The modifiers to its right then change that spell one at a time, <b>left to right</b>.</p>`,
        close,
      );
      return;
    }
    const steps: string[] = [];
    let prev: Spell | null = null;
    cells.forEach((r, i) => {
      if (!r) return;
      const cur = compileRow(cells.map((x, j) => (j <= i ? x : null)))!;
      steps.push(`<canvas data-rune="${r.id}" data-tier="${r.tier}"></canvas><div><b>${RUNES[r.id].name} ${ROMAN[r.tier]}</b> · ${prev ? spellDiff(prev, cur) : baseLine(cur)}</div>`);
      prev = cur;
    });
    const foes = matchups(sp, this.foes())
      .map((m) => {
        const d = ENEMIES[m.kind];
        const note = !m.canHit
          ? '<span class="bad">flies over it</span>'
          : m.resist === 0
            ? `<span class="bad">immune to ${sp.element}</span>`
            : [m.resist !== 1 ? `${sp.element} ×${m.resist}` : '', m.armor ? `armor ${m.armor}` : ''].filter(Boolean).join(', ');
        const cls = m.ratio < 0.25 ? 'bad' : m.ratio < 0.6 ? 'warn' : 'good';
        return `<div><i style="background:hsl(${d.hue},85%,55%)"></i>${d.name}${m.count > 1 ? ` ×${m.count}` : ''} · <span class="${cls}">${r0(m.perHit)} a hit</span>${note ? ` · ${note}` : ''}</div>`;
      })
      .join('');
    const dur = sp.cooldown.toFixed(2);
    showCard(
      `<h2>${spellName(sp)}</h2>
       <p><b>${r0(sp.dmg)}</b> dmg${sp.caster === 'nova' ? ' to every foe in the blast' : sp.count > 1 ? ` × ${sp.count} ${UNIT[sp.caster]}` : ''} · every <b>${dur}s</b>${sp.echoes.length ? ` · then ${sp.echoes.length} echo${sp.echoes.length > 1 ? 'es' : ''}` : ''} · ~<b>${Math.round(spellDps(sp))}</b> dps</p>
       <div class="scroll">
       <div class="steps">${steps.join('')}</div>
       <p class="sub">Against wave ${this.s.wave}</p>
       <div class="foes">${foes}</div>
       </div>`,
      close,
    );
    for (const c of document.querySelectorAll<HTMLCanvasElement>('.steps canvas[data-rune]'))
      drawSigil(c, { id: c.dataset.rune as Rune['id'], tier: Number(c.dataset.tier) as Rune['tier'] }, 34);
  }

  private showRunes(): void {
    const ids = [...CASTERS, ...MODS];
    const rows = ids.map((id) => `<canvas data-rune="${id}"></canvas><div><b>${RUNES[id].name}</b> · ${RUNES[id].cost}●<br>${RUNES[id].text(1)}</div>`).join('');
    showCard(`<h2>Runes</h2><div class="scroll"><div class="runes">${rows}</div></div>`, [{ label: 'Back', primary: true, onClick: () => this.showMenu() }]);
    for (const c of document.querySelectorAll<HTMLCanvasElement>('canvas[data-rune]')) drawSigil(c, { id: c.dataset.rune as Rune['id'], tier: 1 }, 40);
  }

  private showFoes(): void {
    const coming = new Map(this.foes().map((f) => [f.kind, f]));
    const all = Object.keys(ENEMIES) as EnemyKind[];
    const kinds = [...coming.keys(), ...all.filter((k) => !coming.has(k))];
    const html = kinds
      .map((k, i) => {
        const d = ENEMIES[k];
        const f = coming.get(k);
        const head = i === 0 ? `<p class="sub">Wave ${this.s.wave}</p>` : i === coming.size ? '<p class="sub">Later</p>' : '';
        const res = Object.entries(d.resist)
          .map(([el, m]) => `${el} ×${m}`)
          .join(', ');
        return `${head}<div${f ? '' : ' class="later"'}><i style="background:hsl(${d.hue},85%,55%)"></i><b>${d.name}</b>${f && f.count > 1 ? ` ×${f.count}` : ''} · ${Math.round(f ? f.hp : d.hp)} hp${d.armor ? ` · armor ${d.armor}` : ''}${d.shield ? ` · shield ${d.shield}` : ''}${d.flying ? ' · flies' : ''}${res ? ` · ${res}` : ''}<br>${d.blurb}</div>`;
      })
      .join('');
    showCard(`<h2>Foes</h2><div class="scroll foes">${html}</div><p>Normal foes gain ${Math.round(HP_GROWTH * 100)}% of their base HP each wave; bosses don't.</p>`, [
      { label: 'Close', primary: true, onClick: closeOverlay },
    ]);
  }

  private showEnd(): void {
    const won = this.s.phase === 'won';
    const spells = this.s.loom
      .map((row) => compileRow(row))
      .filter((x): x is Spell => !!x)
      .map((sp) => `<li>${spellName(sp)} · ${Math.round(spellDps(sp))} dps</li>`)
      .join('');
    showCard(
      `<h2>${won ? 'The Lich is unmade' : 'The tower falls'}</h2>
       <p>${won ? `All ${WAVES} waves held.` : `Fell on wave ${this.s.wave} of ${WAVES}.`} ${this.s.totalKills} foes slain.</p>
       <ul>${spells}</ul>
       ${this.daily ? `<p><b>Daily run · ${prettyDay(this.daily)}</b><br>${this.dailyResult?.improved ? 'New best for today!' : `Today's best: ${loadDaily(store, this.daily)?.label ?? '—'}`}</p>` : ''}`,
      [
        { label: 'New run', primary: true, onClick: () => this.newRun() },
        ...(this.daily ? [{ label: 'Retry today’s run', onClick: () => this.playDaily(true) }] : []),
        { label: 'Copy bug report', onClick: () => this.copyReport() },
        { label: 'Back to Game Lab', onClick: () => (location.href = '../') },
      ],
      false,
    );
    if (won) this.sfx.victory();
    else this.sfx.defeat();
  }

  private async copyReport(): Promise<void> {
    const a = this.actions.join(',') || '-';
    const text = `GLYPH v${RULES_VERSION} seed=${this.seed} a=${a}\nwave=${this.s.wave} hp=${this.s.hp} gold=${this.s.gold} phase=${this.s.phase}\nbuild ${BUILD}\n${location.origin}${location.pathname}?seed=${this.seed}&a=${a}`;
    toast((await copyText(text)) ? 'Bug report copied' : 'Copy failed');
  }
}

function spellName(sp: Spell): string {
  const el = sp.element === 'arcane' ? '' : sp.element[0].toUpperCase() + sp.element.slice(1) + ' ';
  return `${el}${RUNES[sp.caster].name}`;
}

function rowSummary(sp: Spell | null, extra = ''): string {
  if (!sp) return `<b style="color:var(--muted)">— silent —</b>${extra || '<div>needs a caster</div>'}`;
  const tags: string[] = [];
  if (sp.count > 1) tags.push(`×${sp.count}`);
  if (sp.chain) tags.push(`arcs ${sp.chain}`);
  if (sp.echoes.length) tags.push(`echo ×${sp.echoes.length}`);
  if (sp.slow) tags.push('slows');
  if (sp.burn) tags.push('burns');
  return `<b>${spellName(sp)}${tags.length ? ` <span style="font-weight:500;color:var(--muted)">${tags.join(' · ')}</span>` : ''}</b><div><span class="dps">${Math.round(spellDps(sp))} dps</span> · ${sp.cooldown.toFixed(1)}s</div>${extra}`;
}

const r0 = (x: number) => String(Math.round(x));
const pc = (x: number) => `${Math.round(x * 100)}%`;
const UNIT: Record<Spell['caster'], string> = { bolt: 'bolts', beam: 'beams', nova: 'blast', rain: 'strikes', orb: 'orbs' };

/** What a caster rune starts with. */
function baseLine(sp: Spell): string {
  const n = sp.caster === 'nova' ? 'a blast around the tower' : `${sp.count} ${sp.count === 1 ? UNIT[sp.caster].slice(0, -1) : UNIT[sp.caster]}`;
  return `${r0(sp.dmg)} dmg · ${n} · every ${sp.cooldown.toFixed(1)}s`;
}

/** What one modifier changed, given the spell before and after it. */
function spellDiff(a: Spell, b: Spell): string {
  const out: string[] = [];
  if (b.element !== a.element) out.push(`turns <b>${b.element}</b>`);
  if (Math.abs(b.dmg - a.dmg) > 0.05) out.push(`dmg ${r0(a.dmg)} → <b>${r0(b.dmg)}</b>`);
  if (b.count !== a.count) out.push(b.caster === 'nova' ? `blast ${pc((1 + (b.count - 1) * 0.35) / (1 + (a.count - 1) * 0.35) - 1)} wider` : `${a.count} → <b>${b.count}</b> ${UNIT[b.caster]}`);
  if (b.area > a.area * 1.01 && b.count === a.count) out.push(b.caster === 'nova' ? `blast ${pc(b.area / a.area - 1)} wider` : 'bigger hits');
  if (Math.abs(b.cooldown - a.cooldown) > 0.005) out.push(`every ${a.cooldown.toFixed(2)}s → <b>${b.cooldown.toFixed(2)}s</b>`);
  if (b.burn !== a.burn) out.push(`burns <b>${r0(b.burn)}/s</b> for 3s`);
  if (b.slow !== a.slow) out.push(`slows <b>${pc(b.slow)}</b> for ${SLOW_TIME}s`);
  if (b.chain !== a.chain) out.push(`arcs to <b>${b.chain}</b> more foes at ${pc(MOD.stormDmg)}`);
  if (b.pierce !== a.pierce && (b.caster === 'bolt' || b.caster === 'orb')) out.push(`passes through <b>${b.pierce}</b> foes`);
  if (b.shred !== a.shred) out.push(`ignores <b>${b.shred}</b> armor`);
  if (b.leech !== a.leech) out.push(`<b>${pc(b.leech)}</b> chance a kill heals the tower`);
  if (b.gild !== a.gild) out.push(`<b>${pc(b.gild)}</b> chance a kill gives +1●`);
  if (b.echoes.length !== a.echoes.length) {
    const e = b.echoes[b.echoes.length - 1];
    out.push(`<b>casts again</b>: a copy of everything to its left (${r0(e.dmg)} dmg${e.count > 1 ? ` ×${e.count}` : ''})`);
  }
  return out.join(' · ') || '<span style="color:var(--danger)">no effect here</span>';
}
