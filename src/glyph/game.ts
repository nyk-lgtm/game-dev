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
  ASC,
  ENEMIES,
  GROWTH,
  MOD,
  MODS,
  SLOW_TIME,
  bountyCap,
  burnDps,
  empowerCost,
  rerollCost,
  RULES_VERSION,
  RUNES,
  WAVES,
  apply,
  compileRow,
  encode,
  finishBattle,
  fits,
  get,
  enemyHp,
  isBoss,
  waveTrial,
  matchups,
  reach,
  newGame,
  price,
  replay,
  sellValue,
  spellDps,
  tick,
  waveFoes,
  warnings,
  type Action,
  type Element,
  type EnemyKind,
  type GameState,
  type WaveTrial,
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
  /** Highest Ascension level unlocked (each win at the top level opens the next). */
  asc?: number;
  /** The level new runs start at. */
  ascPick?: number;
  /** Wins per Ascension level. */
  ascWins?: number[];
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
  /** The Ascension level this run's win just unlocked (0 if none). */
  private unlocked = 0;
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

  start(seed: number, actions = '', fromLink = false, daily: string | null = null, asc = 0): void {
    this.seed = seed;
    this.daily = daily;
    this.dailyResult = null;
    this.sel = null;
    this.lane = new Lane();
    this.trialCache.clear();
    asc = daily ? 0 : Math.max(0, Math.min(ASC.max, Math.floor(asc) || 0));
    try {
      this.s = replay(seed, actions, asc);
      this.actions = actions.split(',').filter(Boolean);
    } catch (e) {
      if (fromLink) toast(`Replay failed: ${(e as Error).message}`);
      this.s = newGame(seed, asc);
      this.actions = [];
    }
    this.replayOnly = fromLink;
    if (!fromLink) this.persist();
    this.render();
    if (this.s.phase === 'over' || this.s.phase === 'won') this.showEnd();
    else if (daily && this.actions.length === 0) this.banner('Daily run', prettyDay(daily));
  }

  newRun(asc = this.ascPick()): void {
    closeOverlay();
    leaveDaily();
    this.start((Math.random() * 2 ** 31) >>> 0, '', false, null, asc);
  }

  /** The Ascension level new runs start at (never above what's unlocked). */
  private ascPick(): number {
    return Math.min(this.profile.ascPick ?? 0, this.profile.asc ?? 0);
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
    const saved = store.load<{ v: number; seed: number; a: string; asc?: number } | null>('run', null);
    if (saved && saved.v === RULES_VERSION) this.start(saved.seed, saved.a, false, null, saved.asc);
    else this.start((Math.random() * 2 ** 31) >>> 0, '', false, null, this.ascPick());
  }

  private persist(): void {
    if (this.replayOnly) return;
    store.save(this.daily ? 'dailyRun' : 'run', { v: RULES_VERSION, seed: this.seed, a: this.actions.join(','), day: this.daily, asc: this.s.asc });
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
    const bounty = Math.min(b.goldEarned, bountyCap(s.wave - 1));
    const parts = [
      `${gained - interest - bounty - b.gilded} pay`,
      interest ? `${interest} interest` : '',
      bounty ? `${bounty} bounty${b.goldEarned > bounty ? ' (max)' : ''}` : '',
      b.gilded ? `${b.gilded} gild` : '',
    ].filter(Boolean);
    this.banner(`Wave ${s.wave - 1} cleared`, `+${gained}● (${parts.join(' + ')})${b.leaked ? ` · −${b.leaked} tower: ${leakText(b)}` : ''}`);
    this.sfx.levelUp();
    this.render();
  }

  private recordEnd(): void {
    if (this.replayOnly) return;
    const p = this.profile;
    const reached = this.s.phase === 'won' ? WAVES : this.s.wave;
    p.bestWave = Math.max(p.bestWave, reached);
    p.runs++;
    this.unlocked = 0;
    if (this.s.phase === 'won') {
      p.wins++;
      {
        // Dailies are normal difficulty, so a daily win counts as a normal (A0) win.
        const a = this.s.asc;
        p.ascWins = p.ascWins ?? [];
        p.ascWins[a] = (p.ascWins[a] ?? 0) + 1;
        // A win at your top level opens the next one (and new runs start there).
        if (a >= (p.asc ?? 0) && a < ASC.max) {
          p.asc = a + 1;
          p.ascPick = a + 1;
          this.unlocked = a + 1;
        }
      }
    }
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
    const key = `${this.s.seed}:${this.s.wave}:${this.s.asc}`;
    if (this.foeCache?.key !== key) this.foeCache = { key, foes: waveFoes(this.s.seed, this.s.wave, this.s.asc) };
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
    $('wave').innerHTML = `${Math.min(s.wave, WAVES)}/${WAVES}${s.asc ? `<small class="asc" title="Ascension ${s.asc}">A${s.asc}</small>` : ''}`;
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
        el.classList.toggle('merge', !!o && !o.sold && o.rune.tier < 3 && this.owned(o.rune) >= 2 && !this.buyMerge(at.i)?.down);
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
      const ok = !!selRune && !battle && at.area !== 'shop' && !same(at, this.sel) && fits(selRune, at);
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
        // A slow adds no damage but keeps foes under fire longer: say how much.
        const slow = pv.slow > (sp?.slow ?? 0) ? pc(slowGain(pv)) : '';
        const warnMark = bad ? ' <span class="bad">⚠</span>' : '';
        extra =
          slow && sp && d === 0
            ? `<span class="up">❄ +${slow} longer in range${warnMark}</span>`
            : `<span class="up">here → ${Math.round(after)} dps${sp ? ` (${d >= 0 ? '+' : ''}${d})` : ''}${slow ? ` ❄+${slow}` : ''}${warnMark}</span>`;
      } else if (warn) extra = `<span class="warn${warn.level === 2 ? ' bad' : ''}">⚠ ${warn.text}</span>`;
      const el = $(`row${row}`);
      el.querySelector('.sum')!.innerHTML = rowSummary(sp, extra, s.loom[row]);
      el.classList.toggle('pv', !!pv);
    }
    if (!battle)
      for (let row = 0; row < 3; row++) {
        const el = $(`row${row}`);
        el.classList.remove('cast');
        (el.querySelector('.cd') as HTMLElement).style.width = '0';
      }
    const reroll = $('rerollBtn') as HTMLButtonElement;
    const rc = rerollCost(s);
    reroll.disabled = s.gold < rc || battle;
    reroll.textContent = `Reroll ${rc}●`;
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
          ? 'Tap a rune in the shop, then <b>Buy</b>: it waits on your bench (or tap the loom slot it should go in). Each row casts one spell: a <b>caster</b> on the left, then up to 3 <b>modifiers</b>.'
          : empty >= 0 && s.wave > 1
            ? `Row ${empty + 1} has no caster: it stays silent. Three identical runes merge into a stronger one.`
            : s.wave <= 3
              ? 'Tap a spell (the text beside a row) to see what each rune adds and how it fares against the next wave.'
              : 'Drag runes to rearrange. Order matters for <b>Echo</b> (it repeats what is to its left) and for the element (the last one counts). Three of a kind merge.'
      }</div>`;
      return;
    }
    const def = RUNES[r.id];
    const kind = def.kind === 'caster' ? 'caster' : 'modifier';
    const name = `<b>${def.name} ${ROMAN[r.tier]}</b> <span>${kind}</span>`;
    // What the next tier brings (merging or empowering).
    const next = r.tier < 3 ? `${ROMAN[r.tier + 1]}: ${def.stat(r.tier + 1)}` : '';
    const div = document.createElement('div');
    div.className = 'txt';
    // A long description may not fit the tip: tap it to read it all.
    div.onclick = () =>
      showCard(
        `<h2>${def.name} ${ROMAN[r.tier]}</h2><p>${def.text(r.tier)}</p><p class="tiers">I ${def.stat(1)} · II ${def.stat(2)} · III ${def.stat(3)}</p>`,
        [{ label: 'Close', primary: true, onClick: closeOverlay }],
      );
    if (this.sel.area === 'shop') {
      // Would buying it merge a rune out of a row, or lower a row's dps? (Buy asks first.)
      let merge = '';
      const m = r.tier < 3 && this.owned(r) >= 2 ? this.buyMerge(this.sel.i) : null;
      if (m) {
        const loses = m.lost.length ? ` <span class="bad">⚠ ${m.lost.map((l) => `row ${l.row + 1}`).join(', ')} would lose its ${def.name}</span>` : '';
        const drop = m.rows.filter((d) => d.b < d.a).map((d) => `row ${d.row + 1} ${d.a} → ${d.b} dps`);
        merge = m.down
          ? ` <span class="bad">⚠ merges with yours, but ${drop.join(', ')}</span>`
          : ` <span class="star">★ merges with yours (${this.where(r).slice(0, 2).join(', ')}) → ${next}</span>${loses}`;
      }
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
      div.innerHTML = `${name}${set}${next ? ` · <span class="nx">${next}</span>` : ''}<br>${def.text(r.tier)}`;
      const b = document.createElement('button');
      b.className = 'secondary';
      b.textContent = `Sell +${sellValue(r)}●`;
      const at = this.sel;
      b.onclick = () => {
        if (this.act({ t: 'sell', at })) this.sel = null;
        this.render();
      };
      const btns: HTMLElement[] = [b];
      if (r.tier < 3) {
        // Empower: raise it a tier in place, for gold.
        const e = document.createElement('button');
        e.className = 'primary emp';
        const cost = empowerCost(r);
        e.innerHTML = `${ROMAN[r.tier + 1]} ↑<small>${cost}●</small>`;
        e.disabled = cost > s.gold;
        e.setAttribute('aria-label', `Empower to ${ROMAN[r.tier + 1]} for ${cost} gold`);
        e.onclick = () => {
          // Clear the selection: the next tap shouldn't move the rune just raised.
          if (this.commit({ t: 'empower', at })) this.sel = null;
          this.render();
        };
        btns.unshift(e);
      }
      tip.replaceChildren(div, ...btns);
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
    const armed = this.s.loom.some((r) => r[0]);
    const now = armed ? this.forecastLine(this.s.wave) : null;
    const lich = armed && this.s.wave >= LICH_FROM && this.s.wave < WAVES ? this.forecastLine(WAVES) : null;
    info.innerHTML = `<div class="head">Wave ${this.s.wave} incoming · tap for details</div>${chips.join('')}${
      now ? `<div class="lich ${now.cls}">Forecast: ${now.short}</div>` : ''
    }${lich ? `<div class="lich ${lich.cls}">Wave 15 with this loom: ${lich.short}</div>` : ''}`;
  }

  private trialCache = new Map<string, WaveTrial>();
  /** The loom as it stands, played against a wave on a copy (cached per loom). */
  private trialKey = (wave: number) => `${this.s.seed}:${this.s.asc}:${wave}:${JSON.stringify(this.s.loom)}`;
  /** A cached trial, or undefined while it hasn't run (it runs off the tap: a late wave takes ~0.1 s on a phone). */
  private trial(wave: number): WaveTrial | undefined {
    const key = this.trialKey(wave);
    const t = this.trialCache.get(key);
    if (!t && !this.trialTimer)
      this.trialTimer = window.setTimeout(() => {
        this.trialTimer = 0;
        if (!this.s || this.s.phase !== 'build' || this.trialKey(wave) !== key) return this.renderLaneInfo();
        if (this.trialCache.size > 40) this.trialCache.clear();
        this.trialCache.set(key, waveTrial(this.s, wave));
        this.renderLaneInfo();
      }, 60);
    return t;
  }
  private trialTimer = 0;

  /** A wave's forecast in words: short for the preview, long for the Foes card. */
  private forecastLine(wave: number): { cls: string; short: string; long: string } {
    const t = this.trial(wave);
    if (!t) return { cls: 'wait', short: '…', long: 'Working it out…' };
    const by = (Object.entries(t.by) as [EnemyKind, number][])
      .sort((x, y) => y[1] - x[1])
      .map(([k, n]) => `${ENEMIES[k].name}${isBoss(k) ? "" : "s"} −${n}`);
    const b = t.boss;
    const bossShort = b && b.killed ? ` · ${ENEMIES[b.kind].name} falls ${pc(b.progress)} down` : '';
    const bossLong = b
      ? b.killed
        ? ` The ${ENEMIES[b.kind].name} falls <b>${pc(b.progress)}</b> of the way to the tower${b.progress >= LICH_CLOSE ? ': close' : ''}.`
        : ` The ${ENEMIES[b.kind].name} reaches the tower with <b>${pc(b.left)}</b> of its HP left (bosses cost tower HP by how much of them is left).`
      : '';
    const later = wave > this.s.wave ? ' This is the loom as it stands; whatever you add by then counts too.' : '';
    if (!t.leaked)
      return { cls: 'good', short: `✓ nothing gets through${bossShort}`, long: `With your loom as it is, nothing gets through on wave ${wave}.${bossLong}${later}` };
    const fatal = t.leaked >= this.s.hp;
    return {
      cls: fatal || t.leaked >= 6 ? 'bad' : 'warn',
      short: `${fatal ? '✗' : '⚠'} ≈ −${t.leaked} tower${fatal ? ' (the end)' : ''}${by.length ? ` · ${by.slice(0, 2).join(', ')}` : ''}`,
      long: `With your loom as it is, wave ${wave} costs about <b>${t.leaked}</b> tower HP${fatal ? `, <b class="bad">more than the ${this.s.hp} you have</b>` : ''}: ${by.join(', ')}.${bossLong}${later}`,
    };
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
      // A second tap only deselects; buying takes the Buy button (or a tap on a slot).
      this.sel = null;
    } else if (at.area === 'shop' || (r && sel.area === 'shop' && !fits(get(s, sel)!, at))) {
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
      // Onto a filled slot: replace it (the old rune goes to the bench, or is sold), after a confirm.
      if (get(this.s, to)) return this.replaceFromShop(from.i, to);
      if (price(r) > this.s.gold) {
        toast('Not enough gold');
        return false;
      }
      return this.commit({ t: 'buy', i: from.i, to });
    }
    const ok = this.commit({ t: 'move', from, to });
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
    const benchBefore = this.s.bench.filter(Boolean).length;
    if (!this.commit({ t: 'buy', i })) toast('No room: sell something, or drag it onto a rune to replace that one');
    else if (this.s.bench.filter(Boolean).length > benchBefore) {
      // Bought runes wait on the bench (rules v4): say so the first few times.
      const n = store.load('benchHint', 0);
      if (n < 3) {
        store.save('benchHint', n + 1);
        toast('On the bench: drag it into a row, or tap it and then a slot');
      }
    }
    this.sel = null;
    this.render();
  }

  /** Put shop rune i straight into a filled slot: the old rune goes to a free bench slot, else it is sold. Asks first. */
  private replaceFromShop(i: number, to: Slot): boolean {
    const s = this.s;
    const o = s.shop[i];
    const old = get(s, to);
    if (!o || o.sold || !old || to.area === 'shop') return false;
    const bench = to.area === 'loom' ? s.bench.findIndex((x) => !x) : -1;
    const first: Action = bench >= 0 ? { t: 'move', from: to, to: { area: 'bench', i: bench }, keep: true } : { t: 'sell', at: to };
    const refund = bench >= 0 ? 0 : sellValue(old);
    if (price(o.rune) > s.gold + refund) {
      toast('Not enough gold');
      return false;
    }
    // Try it on a copy for the row's dps before → after.
    const t = JSON.parse(JSON.stringify(s)) as GameState;
    if (!apply(t, first) || !apply(t, { t: 'buy', i, to })) return false;
    const nm = (x: Rune) => `${RUNES[x.id].name} ${ROMAN[x.tier]}`;
    const where = to.area === 'loom' ? this.rowName(to.row) : 'the bench';
    let dps = '';
    if (to.area === 'loom') {
      const a = loomDps(s.loom)[to.row];
      const b = loomDps(t.loom)[to.row];
      dps = `<div class="dpsdiff"><div>${this.rowName(to.row)}: ${a} → <b class="${b < a ? 'bad' : 'good'}">${b}</b> dps</div></div>`;
    }
    showCard(
      `<h2>Replace ${nm(old)}?</h2>
       <p>Buy <b>${nm(o.rune)}</b> (${price(o.rune)}●) into ${where}. The ${nm(old)} ${bench >= 0 ? 'goes to the bench' : `is sold for +${refund}● (the bench is full)`}.</p>${dps}`,
      [
        {
          label: `Replace · ${price(o.rune)}●`,
          primary: true,
          onClick: () => {
            closeOverlay();
            this.sel = null;
            if (this.act(first)) this.commit({ t: 'buy', i, to });
            this.render();
          },
        },
        { label: 'Cancel', onClick: closeOverlay },
      ],
    );
    return true;
  }

  private mergeMemo: { key: string; m: (MergeCheck | null)[] } | null = null;
  /** What buying shop offer i would merge, and whether that lowers the loom's dps (memoized per state). */
  private buyMerge(i: number): MergeCheck | null {
    const key = this.actions.length + ':' + this.s.wave;
    if (this.mergeMemo?.key !== key) this.mergeMemo = { key, m: [] };
    if (this.mergeMemo.m[i] === undefined) {
      const t = JSON.parse(JSON.stringify(this.s)) as GameState;
      const a: Action = { t: 'buy', i };
      this.mergeMemo.m[i] = apply(t, a) ? this.mergeCheck(this.s, t, a) : null;
    }
    return this.mergeMemo.m[i];
  }

  /** Did action `a` merge runes, and what did that do to each row's dps? Null if nothing merged. */
  private mergeCheck(before: GameState, after: GameState, a: Action): MergeCheck | null {
    const count = (g: GameState) => [...g.loom.flat(), ...g.bench].filter(Boolean).length;
    if (count(after) >= count(before) + (a.t === 'buy' ? 1 : 0)) return null;
    const x = loomDps(before.loom);
    const y = loomDps(after.loom);
    const rows = x.map((v, row) => ({ row, a: v, b: y[row] })).filter((d) => d.a !== d.b);
    const sum = (v: number[]) => v.reduce((p, q) => p + q, 0);
    return { ...this.mergeEffect(before, after, a), rows, down: sum(y) < sum(x) };
  }

  /** "row 2 (Nova)" */
  private rowName(row: number, loom = this.s.loom): string {
    const c = loom[row][0];
    return `row ${row + 1}${c ? ` (${RUNES[c.id].name})` : ''}`;
  }

  /**
   * What a merge would do to the rows: loom runes it would pull out (other
   * than the ones the action itself moves) and where the merged rune lands.
   */
  private mergeEffect(before: GameState, after: GameState, a: Action): { lost: { row: number; rune: Rune }[]; landed: { row: number; rune: Rune } | null } {
    const touched = a.t === 'move' ? [a.from, a.to] : a.t === 'empower' ? [a.at] : [];
    const lost: { row: number; rune: Rune }[] = [];
    let landed: { row: number; rune: Rune } | null = null;
    before.loom.forEach((cells, row) =>
      cells.forEach((x, col) => {
        const y = after.loom[row][col];
        if (x && !y && !touched.some((at) => at.area === 'loom' && at.row === row && at.col === col)) lost.push({ row, rune: x });
        if (y && y.tier > 1 && (!x || (x.id === y.id && y.tier > x.tier))) landed = { row, rune: y };
      }),
    );
    return { lost, landed };
  }

  /** Apply a buy, move or empower; first ask if a merge would pull a rune out of a row. */
  private commit(a: Action): boolean {
    if (a.t === 'buy' || a.t === 'move' || a.t === 'empower') {
      const t = JSON.parse(JSON.stringify(this.s)) as GameState;
      if (!apply(t, a)) return false;
      const m = this.mergeCheck(this.s, t, a);
      if (m && (m.lost.length || m.rows.some((d) => d.b < d.a))) {
        this.confirmMerge(a, t, m);
        return true;
      }
    }
    return this.run(a);
  }

  private confirmMerge(a: Action, after: GameState, m: MergeCheck): void {
    const lost = m.lost;
    // The merged rune: the one that went up a tier (a lost one, or what landed).
    const r: Rune = lost[0]?.rune ?? this.madeBy(after) ?? { id: 'bolt', tier: 1 };
    const name = RUNES[r.id].name;
    const up = `${name} ${ROMAN[r.tier + 1]}`;
    const dps = m.rows.map((d) => `<div>${this.rowName(d.row)}: ${d.a} → <b class="${d.b < d.a ? 'bad' : 'good'}">${d.b}</b> dps</div>`).join('');
    // Where it lands: the loom cell that went up a tier, else the bench.
    let land = 'on the bench';
    after.loom.forEach((cells, row) =>
      cells.forEach((y, col) => {
        const x = this.s.loom[row][col];
        if (y && y.id === r.id && y.tier === r.tier + 1 && (!x || x.tier !== y.tier)) land = `in ${this.rowName(row)}`;
      }),
    );
    const rows = lost.map((l) => this.rowName(l.row));
    const k = JSON.parse(JSON.stringify(this.s)) as GameState;
    const keep = { ...a, keep: true } as Action;
    const canKeep = apply(k, keep);
    // Where a kept new rune goes (a bought one may slot into a row).
    let goes = 'to the bench';
    k.loom.forEach((cells, row) => cells.forEach((y, col) => y && !this.s.loom[row][col] && (goes = `into ${this.rowName(row)}`)));
    const done = (x: Action) => () => {
      closeOverlay();
      this.sel = null;
      this.run(x);
      this.render();
    };
    showCard(
      `<h2>Merge into ${up}?</h2>
       <p>Three ${name} ${ROMAN[r.tier]} make one ${up}, which lands ${land}.${rows.length ? ` The ${name} in <b>${rows.join(' and ')}</b> joins it, so <b class="bad">that row loses it</b>.` : ''}</p>
       <div class="dpsdiff">${dps}</div>${m.down ? '<p class="bad">This merge lowers your total damage.</p>' : ''}
       ${canKeep ? `<p>Or keep them apart: no merge for now${a.t === 'buy' ? `, the new ${name} goes ${goes}` : ''}. They merge when you next move one of them.</p>` : ''}`,
      [
        // When the merge costs damage, keeping them apart is the safe default.
        ...(canKeep && m.down ? [{ label: 'Keep them apart', primary: true, onClick: done(keep) }] : []),
        { label: `Merge → ${up}`, primary: !(canKeep && m.down), onClick: done(a) },
        ...(canKeep && !m.down ? [{ label: 'Keep them apart', onClick: done(keep) }] : []),
        { label: 'Cancel', onClick: closeOverlay },
      ],
    );
  }

  /** Apply an action and say what any merge did (and to which rows). */
  private run(a: Action): boolean {
    const before = JSON.parse(JSON.stringify({ loom: this.s.loom, bench: this.s.bench })) as GameState;
    const had = this.owns();
    if (!this.act(a)) return false;
    if (a.t === 'buy') this.sfx.pickup();
    const now = this.owns();
    if (now.length >= had.length + (a.t === 'buy' ? 1 : 0)) {
      if (a.t === 'empower') {
        const r = get(this.s, a.at)!;
        this.sfx.evolve();
        this.banner(`${RUNES[r.id].name} ${ROMAN[r.tier]}!`, `empowered for ${empowerCost({ id: r.id, tier: (r.tier - 1) as Rune['tier'] })}●`);
      }
      return true;
    }
    // Merged: the new rune(s) are those owned now and not before; the highest tier last.
    const left = [...had];
    const made = now
      .filter((k) => {
        const i = left.indexOf(k);
        if (i < 0) return true;
        left.splice(i, 1);
        return false;
      })
      .map((k) => ({ id: k.split(':')[0], tier: Number(k.split(':')[1]) }) as Rune)
      .filter((r) => r.tier > 1)
      .sort((x, y) => x.tier - y.tier);
    const r = made[made.length - 1];
    const { lost, landed } = this.mergeEffect(before, this.s, a);
    const sub = lost.length
      ? `${lost.map((l) => this.rowName(l.row, before.loom)).join(' and ')} gave up its ${RUNES[lost[0].rune.id].name}: check your rows`
      : landed
        ? `three became one, in ${this.rowName(landed.row)}`
        : 'three became one, on the bench';
    this.sfx.evolve();
    this.banner(r ? `${RUNES[r.id].name} ${ROMAN[r.tier]}!` : 'Runes merged', sub);
    return true;
  }

  private owns(): string[] {
    return [...this.s.loom.flat(), ...this.s.bench].filter((r): r is Rune => !!r).map((r) => `${r.id}:${r.tier}`);
  }

  /** The runes (at their old tier) that merged on the way from this state to `after`. */
  private madeBy(after: GameState): Rune | null {
    const tally = (g: GameState) => {
      const m = new Map<string, number>();
      for (const r of [...g.loom.flat(), ...g.bench]) if (r) m.set(`${r.id}:${r.tier}`, (m.get(`${r.id}:${r.tier}`) ?? 0) + 1);
      return m;
    };
    const a = tally(this.s);
    for (const [k, n] of tally(after)) {
      const [id, tier] = k.split(':');
      if (+tier > 1 && n > (a.get(k) ?? 0)) return { id: id as Rune['id'], tier: (+tier - 1) as Rune['tier'] };
    }
    return null;
  }

  // ---- cards ----

  showMenu(): void {
    showCard(
      `<h2>Glyphwright</h2><p>Wave ${Math.min(this.s.wave, WAVES)} of ${WAVES} · seed ${this.seed}</p>
       <p>Best: wave ${this.profile.bestWave || '—'}${this.profile.wins ? ` · ${this.profile.wins} win${this.profile.wins > 1 ? 's' : ''}` : ''}${this.profile.asc ? ` · Ascension ${this.profile.asc} open` : '<br>Win a run (the daily counts) to open Ascension 1: foes +10% HP.'}${this.s.asc ? `<br>This run: Ascension ${this.s.asc} (foes +${pc(ASC.hp * this.s.asc)} HP)` : ''}</p>`,
      [
        { label: 'Resume', primary: true, onClick: closeOverlay },
        ...(this.profile.asc
          ? [
              {
                label: `New runs: ${this.ascPick() ? `Ascension ${this.ascPick()} (+${pc(ASC.hp * this.ascPick())} HP)` : 'normal'}`,
                onClick: () => {
                  // Cycle through the unlocked levels.
                  this.profile.ascPick = (this.ascPick() + 1) % ((this.profile.asc ?? 0) + 1);
                  store.save('profile', this.profile);
                  this.showMenu();
                },
              },
            ]
          : []),
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
        <li>Order matters in two ways: <b>Echo</b> repeats the spell as built so far (what sits after it isn't echoed), and the <b>last</b> Fire, Frost or Storm sets the element of the hits (an earlier one's burn, slow or arcs still work). Other modifiers stack the same in any order.</li>
        <li>Buy runes in the shop: <b>Buy</b> puts them on the bench, or tap the slot it should go in. Drag runes around, or tap one and then tap where it goes. Drop on the bar above the bench to sell.</li>
        <li><b>Three identical runes merge</b> into the next tier (I → II → III). The ★ in the shop marks a rune that completes a set. If a merge would take a rune out of a row, you're asked first and can keep them apart.</li>
        <li>Or <b>empower</b> one: tap a rune you own and press <b>II ↑</b> / <b>III ↑</b> to raise it a tier for gold (pricier than finding copies, but sure).</li>
        <li>Between waves you earn 5 gold, more in later waves, plus <b>interest</b>: +1 per 5 gold banked (max +3), plus <b>bounty</b>: the gold tougher foes and bosses drop when slain (at most ${bountyCap(1)} + half the wave number per wave; Gild's extra gold always counts). <b>Freeze</b> keeps the shop for next wave. Rerolls get dearer the more you use them in one wave.</li>
        <li>Armor eats a flat amount of every hit, so big hits beat many small ones. Some foes resist elements. Tap the wave preview to see them.</li>
        <li><b>Tap a spell</b> (the text beside its row) for a rune-by-rune breakdown and how it hits the next wave. <b style="color:#ffb86b">⚠</b> marks foes it struggles with. Each row shows its dps in a crowd and on <b>1 foe</b> (what a boss feels).</li>
        <li>Bosses come on waves 5, 10 and 15 and cost tower HP by how much of them is left when they arrive. The wave preview gives a <b>forecast</b>: what the coming wave would cost your tower with the loom as it stands (it updates as you change it). From wave ${LICH_FROM} it also plays wave 15, the Lich and all, with your loom as it is now.</li>
        <li>Win a run to open <b>Ascension</b> 1, then the next: every level gives all foes +${pc(ASC.hp)} HP.</li>
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
        const air = reach(sp, m.kind);
        const note = !m.canHit
          ? '<span class="bad">flies over it</span>'
          : air < 1
            ? `<span class="warn">a flyer: takes ${pc(air)}</span>`
          : m.resist === 0
            ? `<span class="bad">immune (${sp.element})</span>`
            : [m.resist !== 1 ? `${sp.element} ×${m.resist}` : '', m.armor ? `armor ${m.armor}` : ''].filter(Boolean).join(', ');
        const cls = m.ratio < 0.25 ? 'bad' : m.ratio < 0.6 ? 'warn' : 'good';
        const burn = sp.burn > 0 && m.canHit && m.resist > 0 ? (m.burns ? ` + burns ${r0(sp.burn)}/s` : ' · <span class="warn">no burn</span>') : '';
        return `<div><i style="background:hsl(${d.hue},85%,55%)"></i>${d.name}${m.count > 1 ? ` ×${m.count}` : ''} · <span class="${cls}">${r0(m.perHit)} a hit</span>${burn}${note ? ` · ${note}` : ''}</div>`;
      })
      .join('');
    const dur = sp.cooldown.toFixed(2);
    // Burn's share of the estimate, and the foes of this wave it can't touch.
    const burnShare = Math.round(burnDps(sp));
    // (Fire hits on a fire-immune foe do nothing at all: the foe list says so.)
    const unburnt = sp.burn > 0 && sp.element !== 'fire' ? this.foes().filter((f) => (ENEMIES[f.kind].resist.fire ?? 1) === 0) : [];
    const burnNote = burnShare
      ? ` (${burnShare} of it burn${unburnt.length ? `; <span class="warn">${unburnt.map((f) => `${ENEMIES[f.kind].name}s`).join(', ')} can't burn: ~${Math.round(spellDps(sp, true, false))} against them</span>` : ''})`
      : '';
    const els = rowElements(cells);
    const elNote = els.length > 1 ? ` · hits are <b>${sp.element}</b> (the last element)` : '';
    const slowNote = sp.slow ? ` · slowed foes stay ~${pc(slowGain(sp))} longer in range` : '';
    showCard(
      `<h2>${spellName(sp, cells)}</h2>
       <p><b>${r0(sp.dmg)}</b> dmg${sp.caster === 'nova' ? ' to every foe in the blast' : sp.count > 1 ? ` × ${sp.count} ${UNIT[sp.caster]}` : ''} · every <b>${dur}s</b>${sp.echoes.length ? ` · then ${sp.echoes.length} echo${sp.echoes.length > 1 ? 'es' : ''}` : ''}${elNote} · ~<b>${Math.round(spellDps(sp))}</b> dps in a crowd${burnNote}, ~${Math.round(spellDps(sp, false))} on a single foe${slowNote}</p>
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
    const rows = ids
      .map((id) => `<canvas data-rune="${id}"></canvas><div><b>${RUNES[id].name}</b> · ${RUNES[id].cost}●<br>${RUNES[id].text(1)}<br><span class="tiers">I ${RUNES[id].stat(1)} · II ${RUNES[id].stat(2)} · III ${RUNES[id].stat(3)}</span></div>`)
      .join('');
    showCard(`<h2>Runes</h2><p>Merging or empowering raises a tier (I → II → III):</p><div class="scroll"><div class="runes">${rows}</div></div>`, [{ label: 'Back', primary: true, onClick: () => this.showMenu() }]);
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
        return `${head}<div${f ? '' : ' class="later"'}><i style="background:hsl(${d.hue},85%,55%)"></i><b>${d.name}</b>${f && f.count > 1 ? ` ×${f.count}` : ''} · ${Math.round(f ? f.hp : enemyHp(k, 1, this.s.asc))} hp${d.armor ? ` · armor ${d.armor}` : ''}${d.shield ? ` · shield ${d.shield}` : ''}${d.flying ? ' · flies' : ''}${res ? ` · ${res}` : ''}<br>${d.blurb}</div>`;
      })
      .join('');
    const armed = this.s.loom.some((r) => r[0]);
    const fc = armed ? this.forecastLine(this.s.wave) : null;
    const f15 = armed && this.s.wave >= LICH_FROM && this.s.wave < WAVES ? this.forecastLine(WAVES) : null;
    const trial = `${fc ? `<p class="lichp"><b>Forecast</b>: <span class="${fc.cls}">${fc.short}</span>. ${fc.long}</p>` : ''}${
      f15 ? `<p class="lichp"><b>Wave 15</b> (the Lich and all): <span class="${f15.cls}">${f15.short}</span>. ${f15.long}</p>` : ''
    }`;
    const asc = this.s.asc ? ` Ascension ${this.s.asc}: every foe has +${pc(ASC.hp * this.s.asc)} HP.` : '';
    showCard(`<h2>Foes</h2>${trial}<div class="scroll foes">${html}</div><p>Normal foes gain ${Math.round(GROWTH.hp * 100)}% of their base HP each wave; bosses don't, and cost less tower HP the more of them is gone.${asc}</p>`, [
      { label: 'Close', primary: true, onClick: closeOverlay },
    ]);
  }

  private showEnd(): void {
    const won = this.s.phase === 'won';
    const spells = this.s.loom
      .map((row) => {
        const sp = compileRow(row);
        return sp ? `<li>${spellName(sp, row)} · ${Math.round(spellDps(sp))} dps</li>` : '';
      })
      .join('');
    // What got through on the last wave.
    const b = this.s.battle;
    const through = b && b.leaked ? `<p class="through">Wave ${this.s.wave}: <b>−${b.leaked} tower</b> from ${leakText(b)}.</p>` : '';
    showCard(
      `<h2>${won ? 'The Lich is unmade' : 'The tower falls'}</h2>
       <p>${won ? `All ${WAVES} waves held.` : `Fell on wave ${this.s.wave} of ${WAVES}.`} ${this.s.totalKills} foes slain.</p>
       ${through}
       ${this.unlocked ? `<p class="good">Ascension ${this.unlocked} is open: every foe has +${pc(ASC.hp * this.unlocked)} HP. New runs start there (change it in the menu).</p>` : this.s.asc ? `<p>Ascension ${this.s.asc}</p>` : ''}
       <ul>${spells}</ul>
       ${this.daily ? `<p><b>Daily run · ${prettyDay(this.daily)}</b><br>${this.dailyResult?.improved ? 'New best for today!' : `Today's best: ${loadDaily(store, this.daily)?.label ?? '—'}`}</p>` : ''}`,
      [
        { label: this.ascPick() ? `New run · Ascension ${this.ascPick()}` : 'New run', primary: true, onClick: () => this.newRun() },
        ...(this.daily ? [{ label: 'Retry today’s run', onClick: () => this.playDaily(true) }] : []),
        { label: 'Copy my result', onClick: () => this.share() },
        { label: 'Copy bug report', onClick: () => this.copyReport() },
        { label: 'Back to Game Lab', onClick: () => (location.href = '../') },
      ],
      false,
    );
    if (won) this.sfx.victory();
    else this.sfx.defeat();
  }

  /** A spoiler-free result line to paste anywhere (the daily links today's run, others the seed). */
  shareText(): string {
    const s = this.s;
    const won = s.phase === 'won';
    const tag = this.daily ? ` daily ${this.daily}` : s.asc ? ` A${s.asc}` : '';
    const bar = Array.from({ length: WAVES }, (_, i) => (i + 1 < s.wave || won ? '🟪' : i + 1 === s.wave ? '💀' : '⬛')).join('');
    const link = this.daily ? `${location.origin}${location.pathname}?daily` : `${location.origin}${location.pathname}?seed=${this.seed}${s.asc ? `&asc=${s.asc}` : ''}`;
    return `Glyphwright${tag}: ${won ? `the Lich is unmade, ${s.hp}♥ left` : `fell on wave ${s.wave}/${WAVES}`}\n${bar}\n${link}`;
  }

  private async share(): Promise<void> {
    toast((await copyText(this.shareText())) ? 'Result copied: paste it anywhere' : 'Copy failed');
  }

  private async copyReport(): Promise<void> {
    const a = this.actions.join(',') || '-';
    const asc = this.s.asc ? `&asc=${this.s.asc}` : '';
    const text = `GLYPH v${RULES_VERSION} seed=${this.seed}${this.s.asc ? ` asc=${this.s.asc}` : ''} a=${a}\nwave=${this.s.wave} hp=${this.s.hp} gold=${this.s.gold} phase=${this.s.phase}\nbuild ${BUILD}\n${location.origin}${location.pathname}?seed=${this.seed}${asc}&a=${a}`;
    toast((await copyText(text)) ? 'Bug report copied' : 'Copy failed');
  }
}

/** The elements a row's modifiers bring, in order (the last one is what its hits are). */
function rowElements(cells: (Rune | null)[]): Element[] {
  const out: Element[] = [];
  for (const r of cells.slice(1)) if (r && (r.id === 'fire' || r.id === 'frost' || r.id === 'storm') && !out.includes(r.id)) out.push(r.id);
  return out;
}

const cap = (x: string) => x[0].toUpperCase() + x.slice(1);

/** "Bolt", "Fire Bolt", or with two elements "Fire-Storm Bolt": the last word is the element its hits have. */
function spellName(sp: Spell, cells?: (Rune | null)[]): string {
  const els = cells ? rowElements(cells).filter((e) => e !== sp.element) : [];
  if (sp.element !== 'arcane') els.push(sp.element);
  return `${els.map(cap).join('-')}${els.length ? ' ' : ''}${RUNES[sp.caster].name}`;
}

/** How much longer a slow keeps the foes it hits in range (renewed every cast while it lasts). */
function slowGain(sp: Spell): number {
  return 1 / (1 - sp.slow * Math.min(1, SLOW_TIME / sp.cooldown)) - 1;
}

function rowSummary(sp: Spell | null, extra = '', cells?: (Rune | null)[]): string {
  if (!sp) return `<b style="color:var(--muted)">— silent —</b>${extra || '<div>needs a caster</div>'}`;
  const tags: string[] = [];
  if (sp.count > 1) tags.push(sp.caster === 'nova' ? 'wider' : `×${sp.count}`);
  if (sp.chain) tags.push(`arcs ${sp.chain}`);
  if (sp.echoes.length) tags.push(`echo ×${sp.echoes.length}`);
  if (sp.slow) tags.push(`slows ${pc(sp.slow)}`);
  if (sp.burn) tags.push('burns');
  // The name gets its own line; tags ride after the dps so nothing important is cut off.
  // Crowd dps, then on a single foe (what a boss like the Lich feels).
  return `<b>${spellName(sp, cells)}</b><div class="dl"><span class="dps">${Math.round(spellDps(sp))} dps</span> · <span class="one">1 foe ${Math.round(spellDps(sp, false))}</span> · ${sp.cooldown.toFixed(1)}s${tags.length ? ` · ${tags.join(' · ')}` : ''}</div>${extra}`;
}

/** "3 Drakes (−9), Imp (−1)": what got through, worst first. */
function leakText(b: { leakedBy: Partial<Record<EnemyKind, number>>; leakHp: Partial<Record<EnemyKind, number>> }): string {
  const hp = (k: EnemyKind) => b.leakHp[k] ?? (b.leakedBy[k] ?? 0) * ENEMIES[k].leak;
  return (Object.entries(b.leakedBy) as [EnemyKind, number][])
    .sort((x, y) => hp(y[0]) - hp(x[0]))
    .map(([k, n]) => `${n > 1 ? `${n} ${ENEMIES[k].name}s` : ENEMIES[k].name} (−${hp(k)})`)
    .join(', ');
}

const r0 = (x: number) => String(Math.round(x));

/** The wave-15 forecast shows in the wave preview from this wave on. */
const LICH_FROM = 11;
/** A trial Lich that falls this far down the lane (or further) is a warning. */
const LICH_CLOSE = 0.8;

interface MergeCheck {
  lost: { row: number; rune: Rune }[];
  landed: { row: number; rune: Rune } | null;
  /** Rows whose dps the action changes (crowd dps, before → after). */
  rows: { row: number; a: number; b: number }[];
  /** The loom's total dps goes down. */
  down: boolean;
}

/** Each row's crowd dps, rounded. */
function loomDps(loom: (Rune | null)[][]): number[] {
  return loom.map((r) => {
    const sp = compileRow(r);
    return sp ? Math.round(spellDps(sp)) : 0;
  });
}
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
  if (b.count !== a.count) out.push(b.caster === 'nova' ? `blast ${pc((1 + (b.count - 1) * MOD.novaWiden) / (1 + (a.count - 1) * MOD.novaWiden) - 1)} wider` : `${a.count} → <b>${b.count}</b> ${UNIT[b.caster]}`);
  if (b.area > a.area * 1.01 && b.count === a.count) out.push(b.caster === 'nova' ? `blast ${pc(b.area / a.area - 1)} wider` : 'bigger hits');
  if (Math.abs(b.cooldown - a.cooldown) > 0.005) out.push(`every ${a.cooldown.toFixed(2)}s → <b>${b.cooldown.toFixed(2)}s</b>`);
  if (b.burn !== a.burn) out.push(`burns <b>${r0(b.burn)}/s</b> for 3s`);
  if (b.slow !== a.slow) out.push(`slows <b>${pc(b.slow)}</b> for ${SLOW_TIME}s (foes it hits stay ~${pc(slowGain(b))} longer in range)`);
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
