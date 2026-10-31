// Glyphwright controller: DOM for the loom, bench and shop; tap-to-select and
// drag-and-drop; runs battles on a fixed step and saves the run as actions.

import { closeOverlay, showCard } from '../shared/cards';
import { BUILD, copyText, toast } from '../shared/debug';
import { makeStore } from '../shared/storage';
import { Sfx } from '../afterglow/audio';
import {
  BENCH_SIZE,
  CASTERS,
  ENEMIES,
  MODS,
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
  newGame,
  price,
  replay,
  sellValue,
  spellDps,
  tick,
  waveQueue,
  type Action,
  type EnemyKind,
  type GameState,
  type Rune,
  type Slot,
  type Spell,
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
    $('rerollBtn').onclick = () => this.act({ t: 'reroll' });
    $('freezeBtn').onclick = () => this.act({ t: 'freeze' });
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

  start(seed: number, actions = '', fromLink = false): void {
    this.seed = seed;
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
  }

  newRun(): void {
    closeOverlay();
    this.start((Math.random() * 2 ** 31) >>> 0);
  }

  private persist(): void {
    if (this.replayOnly) return;
    store.save('run', { v: RULES_VERSION, seed: this.seed, a: this.actions.join(',') });
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
    this.banner(`Wave ${s.wave - 1} cleared`, `+${gained}● gold${b.leaked ? ` · ${b.leaked} leaked` : ''}`);
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
          else if (f.type === 'kill' && ENEMIES[f.kind].gold >= 10) this.sfx.boom();
        }
        if (this.s.phase !== 'battle') {
          this.battleOver();
          break;
        }
      }
      if (n >= 20) this.acc = 0;
      this.renderBattleHud();
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
      o.appendChild(this.makeSlot({ area: 'shop', i }));
      const p = document.createElement('div');
      p.className = 'price';
      o.appendChild(p);
      offers.appendChild(o);
    }
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
      }
    }
    // Valid targets for the current selection.
    const selRune = this.sel ? get(s, this.sel) : null;
    for (const [key, el] of this.slotEls) {
      const at = parseAttr(key);
      const ok = !!selRune && !battle && at.area !== 'shop' && !same(at, this.sel) && fits(selRune, at) && (this.sel!.area !== 'shop' || !get(s, at));
      el.classList.toggle('ok', ok);
    }
    for (let row = 0; row < 3; row++) $(`row${row}`).querySelector('.sum')!.innerHTML = rowSummary(compileRow(s.loom[row]));
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
      const merge = r.tier < 3 && this.owned(r) >= 2 ? ` <span class="star">★ completes a set → ${ROMAN[r.tier + 1]}</span>` : '';
      div.innerHTML = `${name} · ${price(r)}●${merge}<br>${def.text(r.tier)}`;
      const b = document.createElement('button');
      b.className = 'primary';
      b.textContent = 'Buy';
      b.disabled = price(r) > s.gold;
      const i = this.sel.i;
      b.onclick = () => this.buy(i);
      tip.replaceChildren(div, b);
    } else {
      div.innerHTML = `${name}<br>${def.text(r.tier)}`;
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
    const counts = new Map<EnemyKind, number>();
    for (const [, k] of waveQueue(this.s.seed, this.s.wave)) counts.set(k, (counts.get(k) ?? 0) + 1);
    const chips = [...counts.entries()].map(([k, n]) => {
      const d = ENEMIES[k];
      const boss = d.gold >= 10 || k === 'lich';
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
    const before = this.tiers();
    const ok = this.act({ t: 'buy', i, to });
    if (ok) {
      this.sfx.pickup();
      if (this.tiers() > before) this.merged();
    }
    return ok;
  }

  private tiers(): number {
    return [...this.s.loom.flat(), ...this.s.bench].reduce((n, r) => n + (r && r.tier > 1 ? r.tier : 0), 0);
  }

  private merged(): void {
    this.sfx.evolve();
    this.banner('Runes merged', 'three became one');
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
       </ul>`,
      [{ label: 'Got it', primary: true, onClick: closeOverlay }],
    );
  }

  private showRunes(): void {
    const ids = [...CASTERS, ...MODS];
    const rows = ids.map((id) => `<canvas data-rune="${id}"></canvas><div><b>${RUNES[id].name}</b> · ${RUNES[id].cost}●<br>${RUNES[id].text(1)}</div>`).join('');
    showCard(`<h2>Runes</h2><div class="scroll"><div class="runes">${rows}</div></div>`, [{ label: 'Back', primary: true, onClick: () => this.showMenu() }]);
    for (const c of document.querySelectorAll<HTMLCanvasElement>('canvas[data-rune]')) drawSigil(c, { id: c.dataset.rune as Rune['id'], tier: 1 }, 40);
  }

  private showFoes(): void {
    const kinds = Object.keys(ENEMIES) as EnemyKind[];
    const html = kinds
      .map((k) => {
        const d = ENEMIES[k];
        const res = Object.entries(d.resist)
          .map(([el, m]) => `${el} ×${m}`)
          .join(', ');
        return `<div><i style="background:hsl(${d.hue},85%,55%)"></i><b>${d.name}</b> · ${Math.round(d.hp)} hp${d.armor ? ` · armor ${d.armor}` : ''}${d.shield ? ` · shield ${d.shield}` : ''}${d.flying ? ' · flies' : ''}${res ? ` · ${res}` : ''}<br>${d.blurb}</div>`;
      })
      .join('');
    showCard(`<h2>Foes</h2><div class="scroll foes">${html}</div><p>Normal foes gain 13% HP each wave.</p>`, [
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
       <ul>${spells}</ul>`,
      [
        { label: 'New run', primary: true, onClick: () => this.newRun() },
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

function rowSummary(sp: Spell | null): string {
  if (!sp) return '<b style="color:var(--muted)">— silent —</b>needs a caster';
  const tags: string[] = [];
  if (sp.count > 1) tags.push(`×${sp.count}`);
  if (sp.chain) tags.push(`arcs ${sp.chain}`);
  if (sp.echoes.length) tags.push(`echo ×${sp.echoes.length}`);
  if (sp.slow) tags.push('slows');
  if (sp.burn) tags.push('burns');
  return `<b>${spellName(sp)}${tags.length ? ` <span style="font-weight:500;color:var(--muted)">${tags.join(' · ')}</span>` : ''}</b><span class="dps">${Math.round(spellDps(sp))} dps</span> · ${sp.cooldown.toFixed(1)}s`;
}
