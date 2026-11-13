// Kitbag controller: renders the enemy, your gear and your dice as DOM, handles
// drag-and-drop (or tap a die, then a slot), previews every slot's effect,
// animates rolls and blows, runs the map and reward cards, saves after every
// action, and keeps the profile and the daily run.

import { closeOverlay, showCard } from '../shared/cards';
import { dailySeed, leaveDaily, loadDaily, recordDaily, todayKey } from '../shared/daily';
import { copyText, toast } from '../shared/debug';
import { randomSeed } from '../shared/rng';
import { reducedFx } from '../shared/settings';
import { makeStore } from '../shared/storage';
import {
  FLOORS,
  MAX_DICE,
  MAX_GEAR,
  RULES_VERSION,
  COND_LABEL,
  act,
  attackOf,
  diceFor,
  dieDef,
  enemyDef,
  floorReached,
  fxText,
  gearDef,
  gearName,
  hitOf,
  intentOf,
  legalPlacements,
  needsReplace,
  nextIntentOf,
  placeError,
  previewPlace,
  replay,
  newRun,
  slotSentence,
  slotsOf,
  type Effect,
  type Enemy,
  type Gift,
  type Intent,
  type MapNode,
  type Option,
  type Outcome,
  type Run,
  type SlotDef,
} from './core';
import { Sounds } from './audio';

export const store = makeStore('kitbag.');
const $ = (id: string) => document.getElementById(id)!;

interface Profile {
  runs: number;
  wins: number;
  best: number;
  bestFloor: number;
}
const loadProfile = () => store.load<Profile>('profile', { runs: 0, wins: 0, best: 0, bestFloor: 0 });

const fmt = (n: number) => n.toLocaleString('en-US');
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Pip positions on a 3×3 grid for 1-9. */
const PIPS: number[][] = [[], [4], [2, 6], [2, 4, 6], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8], [0, 2, 3, 4, 5, 6, 8], [0, 1, 2, 3, 5, 6, 7, 8], [0, 1, 2, 3, 4, 5, 6, 7, 8]];
export function dieHtml(v: number, kind = 'd6', cls = '', attrs = ''): string {
  const pips = (PIPS[v] ?? []).map((p) => `<i class="p${p}"></i>`).join('');
  return `<div class="die k-${kind} ${v > 6 ? 'big' : ''} ${cls}" ${attrs} aria-label="${v}">${pips}</div>`;
}

const NODE_ICON: Record<MapNode['kind'], string> = { fight: '⚔️', elite: '👑', rest: '🔥', shrine: '⛩️', boss: '🎩' };

/** Short intent chips for the enemy panel. */
function intentChips(e: Enemy, it: Intent): string {
  const out: string[] = [];
  if (it.atk) {
    const hit = hitOf(e, it);
    const total = attackOf(e, it);
    out.push(`<span class="chip atk ${total >= 15 ? 'big' : ''}">⚔${hit}${(it.hits ?? 1) > 1 ? `×${it.hits}` : ''}</span>`);
  }
  if (it.block) out.push(`<span class="chip blk">🛡${it.block}</span>`);
  if (it.poison) out.push(`<span class="chip psn">☠${it.poison}</span>`);
  if (it.hex) out.push(`<span class="chip cur">🔒${it.hex > 1 ? it.hex : ''}</span>`);
  if (it.wither) out.push(`<span class="chip cur">🥀−${it.wither}</span>`);
  if (it.heal) out.push(`<span class="chip heal">✚${it.heal}</span>`);
  if (it.buff) out.push(`<span class="chip atk">💪+${it.buff}</span>`);
  if (it.charge) {
    const nx = nextIntentOf(e);
    out.push(`<span class="chip calm">⏳ then ⚔${attackOf(e, nx)}</span>`);
  }
  return out.join('');
}

/** The intent in words. */
function intentWords(e: Enemy, it: Intent): string {
  const parts: string[] = [];
  if (it.atk) parts.push(`attack for ${(it.hits ?? 1) > 1 ? `${hitOf(e, it)} × ${it.hits} hits` : hitOf(e, it)}`);
  if (it.block) parts.push(`block ${it.block}`);
  if (it.poison) parts.push(`poison you for ${it.poison}`);
  if (it.hex) parts.push(`hex ${it.hex > 1 ? `your ${it.hex} highest dice` : 'your highest die'} next turn (locked)`);
  if (it.wither) parts.push(`wither your next roll (every die −${it.wither})`);
  if (it.heal) parts.push(`heal ${it.heal}`);
  if (it.buff) parts.push(`grow stronger (+${it.buff} to every hit)`);
  if (it.charge) parts.push(`wind up: next turn it hits for ${attackOf(e, nextIntentOf(e))}`);
  return parts.join(', ');
}

/** What a placement would do, in a few words. */
function effectText(ef: Effect, def: SlotDef, v = 0): string {
  if (ef.waiting) return def.need === 'pair' && v && def.fx === 'dmg' ? `Pair of ${v}s: deal ${2 * v * def.mult + def.add}` : '1 of 2 dice';
  if (ef.killed) return 'Finishes it!';
  const bits: string[] = [];
  if (ef.boom) bits.push(`BOOM ${ef.dmg + ef.soaked}`);
  else if (ef.dmg || ef.soaked) bits.push(`Deal ${ef.dmg}${ef.soaked ? ` (${ef.soaked} blocked)` : ''}`);
  if (ef.block) bits.push(`Block ${ef.block}`);
  if (def.fx === 'heal') bits.push(ef.heal ? `Heal ${ef.heal}` : 'Heal 0 (full)');
  if (ef.poison) bits.push(`Poison ${ef.poison}`);
  if (ef.stun) bits.push('Stun!');
  if (def.fx === 'reroll') bits.push('Reroll');
  else if (def.fx === 'split') bits.push(`Split → ${ef.back.join(' + ')}`);
  else if (def.fx === 'flip' || def.fx === 'bump') bits.push(`→ ${ef.back[0]}`);
  if (def.fx === 'keg' && !ef.boom) bits.push('Fuse');
  return bits.join(', ') || '—';
}

function giftIcon(r: Run, g: Gift): string {
  switch (g.t) {
    case 'gear':
      return gearDef(g.id).icon;
    case 'up':
      return gearDef(r.gear[g.card].id).icon;
    case 'die':
      return dieHtml(Math.max(...dieDef(g.kind).faces), g.kind);
    case 'hone':
      return dieHtml(Math.min(...r.dice[g.die].faces) + 3, r.dice[g.die].kind);
    case 'heal':
      return '❤️';
    case 'maxhp':
      return '💗';
  }
}

function giftText(r: Run, g: Gift): { name: string; text: string } {
  switch (g.t) {
    case 'gear': {
      const d = gearDef(g.id);
      return { name: `${d.name}`, text: d.slots.map(slotSentence).join(' ') + (r.gear.length >= MAX_GEAR ? ' <i>Replaces a card.</i>' : '') };
    }
    case 'up': {
      const c = r.gear[g.card];
      return { name: `Upgrade ${gearName(c)} → ${gearDef(c.id).name}+`, text: gearDef(c.id).up.map(slotSentence).join(' ') };
    }
    case 'die': {
      const d = dieDef(g.kind);
      return { name: `New die: ${d.name}`, text: `${d.text} You roll ${r.dice.length + 1} dice a turn.` };
    }
    case 'hone': {
      const d = r.dice[g.die];
      const after = d.faces.slice();
      after[after.indexOf(Math.min(...after))] += 3;
      after.sort((a, b) => a - b);
      return { name: `Hone a ${dieDef(d.kind).name}`, text: `Its lowest face +3: ${d.faces.join(' ')} → ${after.join(' ')}.` };
    }
    case 'heal':
      return { name: `Heal ${Math.min(g.n, r.maxHp - r.hp)}`, text: `You are at ${r.hp}/${r.maxHp} HP.` };
    case 'maxhp':
      return { name: `+${g.n} max HP`, text: `And heal ${g.n}.` };
  }
}

interface Drag {
  i: number;
  x0: number;
  y0: number;
  moved: boolean;
  el: HTMLElement;
  ghost: HTMLElement | null;
  over: HTMLElement | null;
}

export class Game {
  r: Run = newRun(1);
  daily: string | null = null;
  private sfx = new Sounds();
  /** Selected die (pool index), or -1. */
  private sel = -1;
  private drag: Drag | null = null;
  private busy = false;
  private msg: string | null = null;
  private bannerTimer = 0;
  /** Pool indices to animate as they appear. */
  private fresh = new Set<number>();
  private rolling = false;

  constructor() {
    const tray = $('tray');
    tray.addEventListener('pointerdown', (e) => this.down(e));
    tray.addEventListener('pointermove', (e) => this.move(e));
    tray.addEventListener('pointerup', (e) => this.up(e));
    tray.addEventListener('pointercancel', () => this.cancelDrag());
    $('kit').addEventListener('click', (e) => {
      const s = (e.target as HTMLElement).closest<HTMLElement>('.slot');
      const g = (e.target as HTMLElement).closest<HTMLElement>('.gear');
      if (s) this.tapSlot(Number(s.dataset.c), Number(s.dataset.s));
      else if (g) this.tapSlot(Number(g.dataset.c), 0);
    });
    $('endBtn').onclick = () => this.endTurn();
    $('undoBtn').onclick = () => {
      this.sfx.unlock();
      if (this.busy) return;
      this.sel = -1;
      if (this.apply('U')) this.sfx.undo();
    };
    $('intent').onclick = () => {
      const f = this.r.fight;
      if (!f) return;
      const e = f.enemy;
      const def = enemyDef(e.id);
      this.msg = e.stunned
        ? `<b>${def.name}</b> is stunned: it skips its next action.`
        : `Next, <b>${def.name}</b> will ${intentWords(e, intentOf(e))}.`;
      this.renderInfo();
    };
    $('foeArt').onclick = () => {
      const f = this.r.fight;
      if (!f) return;
      const e = f.enemy;
      const def = enemyDef(e.id);
      const pat = def.pattern.map((it) => intentWords(e, it)).join(' → ');
      this.msg = `<b>${def.name}</b> repeats: ${pat}.`;
      this.renderInfo();
    };
    $('mapBtn').onclick = () => this.showMap(true);
  }

  // ---------------------------------------------------------------- runs

  start(seed: number, actions: string[] = [], daily: string | null = null): void {
    closeOverlay();
    this.daily = daily;
    this.r = replay(seed, actions);
    this.sel = -1;
    this.busy = false;
    this.msg = null;
    this.fresh.clear();
    this.save();
    this.rolling = this.r.phase === 'fight';
    this.render();
    this.afterStep();
  }

  newGame(): void {
    leaveDaily();
    this.start(randomSeed());
  }

  playDaily(): void {
    const day = todayKey();
    const saved = store.load<{ v: number; seed: number; a: string; day: string } | null>('dailyRun', null);
    const seed = dailySeed('kitbag', day);
    if (saved && saved.v === RULES_VERSION && saved.day === day && saved.seed === seed) this.start(seed, saved.a ? saved.a.split(',') : [], day);
    else this.start(seed, [], day);
  }

  private save(): void {
    const data = { v: RULES_VERSION, seed: this.r.seed, a: this.r.actions.join(',') };
    if (this.daily) store.save('dailyRun', { ...data, day: this.daily });
    else store.save('run', data);
  }

  /** Shows whatever card the phase calls for. */
  private afterStep(): void {
    const r = this.r;
    if (r.phase === 'over') this.showEnd();
    else if (r.phase === 'choice') this.showChoice();
    else if (r.phase === 'map') this.showMap(false);
  }

  // ---------------------------------------------------------------- input

  private down(e: PointerEvent): void {
    this.sfx.unlock();
    const el = (e.target as HTMLElement).closest<HTMLElement>('.die[data-i]');
    if (!el || this.busy || this.r.phase !== 'fight') return;
    const i = Number(el.dataset.i);
    const p = this.r.fight!.pool[i];
    if (p.locked) {
      this.sfx.nope();
      this.msg = '<b>Hexed:</b> this die is locked for the turn.';
      this.renderInfo();
      return;
    }
    this.drag = { i, x0: e.clientX, y0: e.clientY, moved: false, el, ghost: null, over: null };
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }

  private move(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 8) return;
      d.moved = true;
      this.sel = d.i;
      const p = this.r.fight!.pool[d.i];
      const g = document.createElement('div');
      g.className = 'ghost';
      g.innerHTML = dieHtml(p.v, this.kindOf(d.i));
      $('fx').appendChild(g);
      d.ghost = g;
      d.el.classList.add('lifted');
      $('tray').querySelectorAll('.die.sel').forEach((x) => x.classList.remove('sel'));
      this.renderKit();
      this.renderInfo();
    }
    d.ghost!.style.left = `${e.clientX}px`;
    d.ghost!.style.top = `${e.clientY}px`;
    // The slot under the finger (aim a little above it, where the die is drawn).
    const under = document.elementFromPoint(e.clientX, e.clientY - 20)?.closest<HTMLElement>('.slot') ?? null;
    if (under !== d.over) {
      d.over?.classList.remove('over');
      d.over = under && under.classList.contains('fit') ? under : null;
      d.over?.classList.add('over');
      if (d.over) {
        navigator.vibrate?.(4);
        this.msg = this.previewLine(d.i, Number(d.over.dataset.c), Number(d.over.dataset.s));
        this.renderInfo();
      }
    }
  }

  private up(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    d.ghost?.remove();
    d.el.classList.remove('lifted');
    if (!d.moved) {
      // A tap: select or deselect.
      this.sel = this.sel === d.i ? -1 : d.i;
      if (this.sel >= 0 && !legalPlacements(this.r).some((p) => p.die === d.i)) this.msg = 'This die fits <b>no slot</b> right now.';
      this.render();
      return;
    }
    const under = d.over ?? document.elementFromPoint(e.clientX, e.clientY - 20)?.closest<HTMLElement>('.slot');
    if (under && under.classList.contains('fit')) this.place(d.i, Number(under.dataset.c), Number(under.dataset.s));
    else {
      this.sel = -1;
      this.render();
    }
  }

  private cancelDrag(): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    d.ghost?.remove();
    d.el.classList.remove('lifted');
    this.sel = -1;
    this.render();
  }

  private tapSlot(card: number, slot: number): void {
    this.sfx.unlock();
    const r = this.r;
    if (this.busy || r.phase !== 'fight') return;
    if (this.sel >= 0) {
      const err = placeError(r, this.sel, card, slot);
      if (!err) return this.place(this.sel, card, slot);
      this.sfx.nope();
      this.msg = `<span class="warn">${gearName(r.gear[card])}: ${err}.</span>`;
      this.renderInfo();
      return;
    }
    const g = r.gear[card];
    const d = gearDef(g.id);
    this.msg = `${d.icon} <b>${gearName(g)}</b>: ${slotsOf(g).map(slotSentence).join(' ')}`;
    this.renderInfo();
  }

  private place(die: number, card: number, slot: number): void {
    const r = this.r;
    const before = r.fight!.pool.length;
    const slotEl = document.querySelector<HTMLElement>(`.slot[data-c="${card}"][data-s="${slot}"]`);
    const at = slotEl?.getBoundingClientRect();
    this.sel = -1;
    const o = this.apply(`P${die}.${card}.${slot}`, false);
    if (!o?.effect) return;
    const ef = o.effect;
    const def = slotsOf(r.gear[card])[slot];
    navigator.vibrate?.(ef.dmg >= 10 || ef.boom ? [10, 20, 30] : 8);
    this.sfx.seat();
    if (ef.dmg || ef.soaked) {
      setTimeout(() => (ef.boom ? this.sfx.boom() : this.sfx.hit(ef.dmg)), 40);
      this.hitFoe();
      this.floatAt($('foeArt'), ef.dmg ? `−${ef.dmg}` : '🛡', ef.dmg ? (ef.dmg >= 12 ? '' : 'small') : 'block');
    }
    if (ef.block && at) {
      setTimeout(() => this.sfx.block(), 40);
      this.floatRect(at, `🛡+${ef.block}`, 'block');
    }
    if (ef.heal && at) {
      this.sfx.heal();
      this.floatRect(at, `+${ef.heal}`, 'heal');
    }
    if (ef.poison) this.floatAt($('foeArt'), `☠+${ef.poison}`, 'heal small');
    if (ef.stun) {
      this.sfx.magic();
      this.floatAt($('foeArt'), '💫', '');
    }
    if (ef.back.length) {
      this.sfx.magic();
      for (let k = before; k < r.fight!.pool.length; k++) this.fresh.add(k);
    }
    if (ef.waiting) this.msg = `Now a second ${def.need === 'pair' ? `<b>${r.fight!.pool[die].v}</b>` : 'die'} for the <b>${gearName(r.gear[card])}</b>.`;
    if (o.fightWon) this.wonFight(o);
    this.render();
  }

  private endTurn(): void {
    this.sfx.unlock();
    const r = this.r;
    if (this.busy || r.phase !== 'fight') return;
    const f = r.fight!;
    const it = intentOf(f.enemy);
    const stunned = f.enemy.stunned;
    const hp0 = r.hp;
    const o = act(r, 'E');
    if (!o) return;
    this.save();
    this.sel = -1;
    this.busy = true;
    if (o.enemyPoison) this.floatAt($('foeArt'), `☠−${o.enemyPoison}`, 'heal');
    if (o.fightWon) {
      this.hitFoe();
      this.wonFight(o);
      this.render();
      return;
    }
    const fx = !reducedFx();
    const art = $('foeArt');
    if (!stunned && it.atk && fx) {
      art.classList.remove('lunge');
      void art.offsetWidth;
      art.classList.add('lunge');
    }
    if (stunned) this.floatAt(art, 'stunned', 'small');
    setTimeout(
      () => {
        const lost = hp0 - r.hp;
        if (!stunned && (it.atk || lost > 0)) {
          this.sfx.hurt(lost);
          if (lost > 0) {
            navigator.vibrate?.(lost >= 10 ? [40, 30, 60] : 35);
            this.floatAt($('youBar'), `−${lost}`, 'hurt');
            if (fx) {
              const you = $('you');
              you.classList.remove('flash');
              void you.offsetWidth;
              you.classList.add('flash');
            }
          } else if (o.soaked) this.floatAt($('youBar'), `🛡 ${o.soaked}`, 'block');
        }
        if (r.phase === 'over') {
          this.recordEnd();
          setTimeout(() => this.sfx.over(false), 200);
          this.render();
          setTimeout(() => ((this.busy = false), this.showEnd()), 1100);
          return;
        }
        this.rolling = true;
        this.busy = false;
        this.render();
      },
      fx ? 260 : 60,
    );
  }

  private wonFight(o: Outcome): void {
    this.busy = true;
    const r = this.r;
    $('foeArt').classList.add('dead');
    navigator.vibrate?.([30, 40, 30]);
    if (o.won || r.phase === 'over') {
      this.recordEnd();
      this.banner('The House falls!', 'You beat the run');
      setTimeout(() => this.sfx.over(true), 300);
      setTimeout(() => ((this.busy = false), this.showEnd()), 1700);
      return;
    }
    setTimeout(() => this.sfx.win(), 150);
    this.banner('Victory', `${enemyDef(this.lastFoe()).name} is down`);
    setTimeout(() => {
      this.busy = false;
      $('foeArt').classList.remove('dead');
      this.render();
      this.showChoice();
    }, 1300);
  }

  /** The enemy of the floor just finished. */
  private lastFoe(): string {
    const r = this.r;
    const f = r.floor - 1;
    return r.map[f]?.[r.path[f]]?.foe ?? 'rat';
  }

  /** Plays an action, saves and redraws. */
  private apply(a: string, draw = true): Outcome | null {
    const o = act(this.r, a);
    if (!o) return null;
    this.save();
    if (draw) this.render();
    return o;
  }

  // ---------------------------------------------------------------- feedback

  private hitFoe(): void {
    if (reducedFx()) return;
    const a = $('foeArt');
    a.classList.remove('hit');
    void a.offsetWidth;
    a.classList.add('hit');
  }

  private floatAt(el: HTMLElement, text: string, cls: string): void {
    this.floatRect(el.getBoundingClientRect(), text, cls);
  }

  private floatRect(r: DOMRect, text: string, cls: string): void {
    const el = document.createElement('div');
    el.className = `float ${cls}`;
    el.textContent = text;
    el.style.left = `${r.left + r.width / 2}px`;
    el.style.top = `${r.top + r.height / 2}px`;
    $('fx').appendChild(el);
    el.animate(
      [
        { opacity: 0, transform: 'translate(-50%, -20%) scale(0.8)' },
        { opacity: 1, transform: 'translate(-50%, -70%) scale(1.1)', offset: 0.2 },
        { opacity: 0, transform: 'translate(-50%, -200%)' },
      ],
      { duration: reducedFx() ? 700 : 950, easing: 'ease-out' },
    ).onfinish = () => el.remove();
  }

  private banner(title: string, sub = ''): void {
    const b = $('banner');
    b.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
    b.hidden = false;
    b.style.animation = 'none';
    void b.offsetWidth;
    b.style.animation = '';
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => (b.hidden = true), 1800);
  }

  // ---------------------------------------------------------------- render

  private kindOf(i: number): string {
    const p = this.r.fight!.pool[i];
    return p.src >= 0 ? this.r.dice[p.src].kind : 'half';
  }

  render(): void {
    const r = this.r;
    $('floorNo').textContent = `${floorReached(r)}/${FLOORS}`;
    $('score').textContent = fmt(r.score);
    $('dailyTag').hidden = !this.daily;
    this.renderFoe();
    this.renderKit();
    this.renderYou();
    this.renderTray();
    const fight = r.phase === 'fight';
    ($('undoBtn') as HTMLButtonElement).disabled = !fight || !r.hist.length;
    ($('endBtn') as HTMLButtonElement).disabled = !fight;
    this.renderInfo();
  }

  private renderFoe(): void {
    const r = this.r;
    const f = r.fight;
    const foe = $('foe');
    foe.style.visibility = f ? '' : 'hidden';
    if (!f) return;
    const e = f.enemy;
    const def = enemyDef(e.id);
    const art = $('foeArt');
    art.textContent = def.icon;
    art.classList.toggle('elite', f.elite);
    art.classList.toggle('boss', f.boss);
    if (e.hp > 0) art.classList.remove('dead');
    $('foeName').innerHTML = `${def.name}${f.elite ? '<small>elite</small>' : f.boss ? '<small>boss</small>' : ''}`;
    const bar = $('foeBar');
    (bar.firstElementChild as HTMLElement).style.width = `${(100 * e.hp) / e.max}%`;
    bar.lastElementChild!.textContent = `${e.hp} / ${e.max}`;
    const tags: string[] = [];
    if (e.block) tags.push(`<span class="tag block">🛡 ${e.block}</span>`);
    if (e.poison) tags.push(`<span class="tag poison">☠ ${e.poison}</span>`);
    if (e.str) tags.push(`<span class="tag str">💪 +${e.str}</span>`);
    if (e.stunned) tags.push(`<span class="tag stun">💫 stunned</span>`);
    $('foeTags').innerHTML = tags.join('');
    const it = intentOf(e);
    const btn = $('intent');
    const total = e.stunned ? 0 : attackOf(e, it);
    btn.classList.toggle('danger', total > 0 && total - r.block >= r.hp);
    btn.classList.toggle('stunned', e.stunned);
    btn.innerHTML = `<span class="lbl">${e.stunned ? 'Stunned' : 'Next'}</span><span class="chips">${e.stunned ? '<span class="chip calm">skips</span>' : intentChips(e, it)}</span>`;
  }

  private renderKit(): void {
    const r = this.r;
    const f = r.fight;
    const sel = this.sel;
    const html = r.gear
      .map((g, c) => {
        const def = gearDef(g.id);
        const slots = slotsOf(g);
        let fxLine = '';
        let pvAny = false;
        const slotHtml = slots
          .map((sd, s) => {
            const st = f?.slots[c]?.[s];
            const two = diceFor(sd.need) === 2;
            const err = f && sel >= 0 ? placeError(r, sel, c, s) : 'x';
            const fit = !err;
            const used = !!st && sd.uses > 0 && st.used >= sd.uses;
            const spentFight = !!st && !!sd.perFight && st.fight >= sd.perFight;
            let pv = '';
            if (fit && f) {
              const ef = previewPlace(r, sel, c, s);
              if (ef) {
                pv = effectText(ef, sd, r.fight!.pool[sel].v);
                pvAny = true;
                if (ef.killed) pv = `<span class="fx pv kill">${pv}</span>`;
                else pv = `<span class="fx pv">${pv}</span>`;
              }
            }
            fxLine += pv || `<span class="fx">${fxText(sd)}</span>`;
            // Holes: one per die; show what sits there this turn.
            const holes: string[] = [];
            const vals = st?.vals ?? [];
            const n = two ? 2 : 1;
            // Dice shown in the holes: the waiting die of a two-dice slot, or the last placement.
            const show = two ? (st && st.held >= 0 ? [f!.pool[st.held].v] : used ? vals.slice(-2) : []) : used || spentFight ? vals.slice(-1) : [];
            for (let k = 0; k < n; k++) {
              const v = show[k];
              holes.push(`<div class="hole">${v ? dieHtml(v, 'd6') : k === 0 || two ? COND_LABEL[sd.need].replace('2 dice', 'any') : ''}</div>`);
            }
            const cls = ['slot', two ? 'two' : '', fit ? 'fit' : '', used || spentFight ? 'full' : '', sel >= 0 && !fit ? 'no' : ''].join(' ');
            return `<div class="${cls}" data-c="${c}" data-s="${s}" role="button" aria-label="${def.name} slot: ${COND_LABEL[sd.need]}">${holes.join('')}</div>`;
          })
          .join('');
        const sd = slots[0];
        const st = f?.slots[c]?.[0];
        let note = '';
        if (sd.uses > 1) note = `<span class="uses">${[...Array(sd.uses).keys()].map((k) => `<b class="${st && k < st.used ? 'off' : ''}"></b>`).join('')}</span>`;
        if (sd.perFight) note += `<span class="note">${st ? `${Math.max(0, sd.perFight - st.fight)} of ${sd.perFight} left this fight` : sd.perFight === 1 ? 'once a fight' : `${sd.perFight}× a fight`}</span>`;
        if (sd.fuse) note += `<div class="fuse"><i style="width:${(100 * (st?.fuse ?? 0)) / sd.fuse}%"></i></div><span class="note">fuse ${st?.fuse ?? 0}/${sd.fuse}</span>`;
        const spent = !!st && slots.every((x, s) => {
          const y = f!.slots[c][s];
          return (x.uses > 0 && y.used >= x.uses) || (!!x.perFight && y.fight >= x.perFight);
        });
        const dim = sel >= 0 && !pvAny;
        return `<div class="gear ${g.up ? 'up' : ''} ${spent ? 'spent' : ''} ${dim ? 'dim' : ''} ${slots.some((x) => diceFor(x.need) === 2) ? 'wide' : ''}" data-c="${c}">${slotHtml}<div class="txt"><span class="nm"><span class="ic">${def.icon}</span>${def.name}${g.up ? '<span class="plus">+</span>' : ''}</span>${fxLine}${note}</div></div>`;
      })
      .join('');
    $('kit').innerHTML = html;
  }

  private renderYou(): void {
    const r = this.r;
    const bar = $('youBar');
    (bar.firstElementChild as HTMLElement).style.width = `${(100 * r.hp) / r.maxHp}%`;
    bar.lastElementChild!.textContent = `❤ ${r.hp} / ${r.maxHp}`;
    bar.classList.toggle('low', r.hp <= r.maxHp * 0.3);
    const tags: string[] = [];
    const f = r.fight;
    if (r.block) tags.push(`<span class="tag block">🛡 ${r.block}</span>`);
    if (r.poison) tags.push(`<span class="tag poison">☠ ${r.poison}</span>`);
    if (f && r.phase === 'fight') {
      const e = f.enemy;
      const hit = e.stunned ? 0 : attackOf(e, intentOf(e));
      if (hit > 0) {
        const through = Math.max(0, hit - r.block);
        tags.push(through ? `<span class="tag str">⚔ −${through}</span>` : `<span class="tag block">safe</span>`);
      }
    }
    $('youTags').innerHTML = tags.join('');
  }

  private renderTray(): void {
    const r = this.r;
    const f = r.fight;
    const tray = $('tray');
    if (!f || r.phase !== 'fight') {
      tray.innerHTML = r.dice.map((d) => dieHtml(Math.max(...d.faces), d.kind, '', 'style="opacity:.35"')).join('');
      return;
    }
    const roll = this.rolling && !reducedFx();
    let k = 0;
    const html = f.pool
      .map((p, i) => {
        if (p.used) return '';
        const cls = [
          i === this.sel ? 'sel' : '',
          p.locked ? 'locked' : '',
          f.withered && p.src >= 0 ? 'withered' : '',
          roll ? 'roll' : this.fresh.has(i) && !reducedFx() ? 'back' : '',
        ].join(' ');
        const style = roll ? `style="animation-delay:${k++ * 60}ms"` : '';
        return dieHtml(p.v, this.kindOf(i), cls, `data-i="${i}" data-w="${f.withered}" ${style} role="button"`);
      })
      .join('');
    tray.innerHTML = html || '<span class="empty">All dice placed</span>';
    if (this.rolling) this.sfx.roll(f.pool.length);
    this.rolling = false;
    this.fresh.clear();
  }

  private previewLine(die: number, card: number, slot: number): string {
    const r = this.r;
    const ef = previewPlace(r, die, card, slot);
    if (!ef) return '';
    const sd = slotsOf(r.gear[card])[slot];
    return `${gearDef(r.gear[card].id).icon} <b>${gearName(r.gear[card])}</b>: ${effectText(ef, sd)}`;
  }

  private renderInfo(): void {
    const r = this.r;
    let html = this.msg ?? '';
    this.msg = null;
    if (!html && r.phase === 'fight') {
      const f = r.fight!;
      const legal = legalPlacements(r);
      const left = f.pool.filter((p) => !p.used && !p.locked).length;
      if (this.sel >= 0) {
        const n = new Set(legal.filter((p) => p.die === this.sel).map((p) => `${p.card}.${p.slot}`)).size;
        html = n ? `Tap a <b>glowing slot</b> (${n} ${n === 1 ? 'fits' : 'fit'}), or tap the die again to put it back.` : 'This die fits <b>no slot</b> right now.';
      } else if (r.floor === 0 && f.turn === 1 && !r.hist.length) html = '<b>Drag a die onto a slot</b> (or tap a die, then a slot). Slots show what they need: any, ≤3, even…';
      else if (f.hexed && f.turn <= 3 && !r.hist.length) html = `<span class="warn">Hexed:</span> your ${f.hexed > 1 ? `${f.hexed} highest dice are` : 'highest die is'} locked this turn.`;
      else if (!legal.length) html = left ? 'Nothing else fits. <b>End turn</b> when ready.' : 'All dice placed. <b>End turn</b> to let the enemy act.';
      else {
        const e = f.enemy;
        const hit = e.stunned ? 0 : attackOf(e, intentOf(e));
        const through = Math.max(0, hit - r.block);
        html = `${`${left} ${left === 1 ? 'die' : 'dice'}`} left.${hit ? ` Incoming <b>${hit}</b>${r.block ? `, you block ${Math.min(hit, r.block)}` : ''}${through ? `: <span class="warn">you take ${through}</span>` : ': <span class="good">all blocked</span>'}.` : ` ${enemyDef(e.id).name} won’t attack this turn.`}`;
      }
    }
    $('info').innerHTML = html || '&nbsp;';
  }

  // ---------------------------------------------------------------- cards

  private nodeLabel(n: MapNode): string {
    const icon = n.foe && n.kind === 'fight' ? enemyDef(n.foe).icon : NODE_ICON[n.kind];
    const name =
      n.kind === 'fight' ? enemyDef(n.foe!).name : n.kind === 'elite' ? `${enemyDef(n.foe!).name}` : n.kind === 'boss' ? 'The House' : n.kind === 'rest' ? 'Campfire' : 'Shrine';
    const sub = n.kind === 'elite' ? 'elite · 2 rewards' : n.kind === 'rest' ? 'heal or upgrade' : n.kind === 'shrine' ? 'a bargain' : n.kind === 'boss' ? 'boss' : '';
    return `<span class="ni">${icon}</span><span>${name}${sub ? `<small>${sub}</small>` : ''}</span>`;
  }

  showMap(peek: boolean): void {
    const r = this.r;
    if (!peek && r.phase !== 'map') return;
    const rows = r.map
      .map((row, f) => {
        const state = f < r.floor ? 'done' : f === r.floor && r.phase === 'map' ? 'now' : f === r.floor ? 'done' : 'later';
        const took = f < r.path.length ? r.path[f] : -1;
        const nodes = row
          .map((n, k) => {
            const live = state === 'now' && !peek;
            return `<button class="node ${n.kind} ${k === took ? 'took' : ''}" data-k="${k}" ${live ? '' : 'disabled'}>${this.nodeLabel(n)}</button>`;
          })
          .join('');
        return `<div class="mrow ${state} ${row.length === 1 ? 'boss' : ''}" data-f="${f}"><span class="fl">${f + 1}</span>${nodes}</div>`;
      })
      .reverse()
      .join('');
    const title = peek ? 'The map' : r.floor === 0 ? 'The climb to The House' : `Floor ${r.floor + 1}: choose a path`;
    showCard(
      `<h2>${title}<span class="sub">${peek ? `Floor ${floorReached(r)} of ${FLOORS}. ` : ''}Tap a room on the lit row. The House waits on floor ${FLOORS}.</span></h2><div class="map">${rows}</div>`,
      peek ? [{ label: 'Back', primary: true, onClick: () => this.back() }] : [],
      peek,
    );
    const now = document.querySelector('#overlay .mrow.now') ?? document.querySelector(`#overlay .mrow[data-f="${Math.min(r.floor, FLOORS - 1)}"]`);
    now?.scrollIntoView({ block: 'center' });
    if (peek) return;
    document.querySelectorAll<HTMLButtonElement>('#overlay .node:not([disabled])').forEach((b) => {
      b.onclick = () => {
        this.sfx.unlock();
        const o = act(this.r, `M${b.dataset.k}`);
        if (!o) return;
        this.save();
        closeOverlay();
        this.sfx.pick();
        const n = r.map[r.floor - (r.phase === 'choice' ? 1 : 0)][Number(b.dataset.k)];
        if (this.r.phase === 'fight') {
          this.rolling = true;
          this.render();
          this.banner(`Floor ${this.r.floor + 1}`, `${enemyDef(n.foe!).icon} ${enemyDef(n.foe!).name}${n.kind === 'elite' ? ' (elite)' : ''}`);
        } else {
          this.render();
          this.afterStep();
        }
      };
    });
  }

  private optionHtml(o: Option, k: number): string {
    const r = this.r;
    const g = o.gifts[0];
    const parts = o.gifts.map((x) => giftText(r, x));
    const name = o.gifts.length > 1 ? parts.map((p) => p.name).join(' + ') : parts[0]?.name ?? 'Walk on';
    const text = o.gifts.length > 1 ? parts.map((p) => p.text).join(' ') : parts[0]?.text ?? '';
    const icon = g ? giftIcon(r, g) : '🚶';
    const cant = o.cost >= r.hp;
    return `<button class="opt" data-k="${k}" ${cant ? 'disabled' : ''}><span class="ic">${icon}</span><span>${o.label ? `<span class="tagline">${o.label}</span>` : ''}<b>${name}</b><span class="t">${text}</span>${o.cost ? `<span class="cost">Costs ${o.cost} HP${cant ? ' (not enough)' : ''}</span>` : ''}</span></button>`;
  }

  showChoice(): void {
    const r = this.r;
    const c = r.choice;
    if (r.phase !== 'choice' || !c) return;
    const title =
      c.kind === 'reward' ? (c.pick > 0 ? 'Second reward' : 'Spoils') : c.kind === 'rest' ? '🔥 Campfire' : '⛩️ Shrine';
    const sub =
      c.kind === 'reward'
        ? `Pick one${c.more ? ' (an elite: one more pick after this)' : ''}. You have ${r.hp}/${r.maxHp} HP.`
        : c.kind === 'rest'
          ? `Rest or train. You have ${r.hp}/${r.maxHp} HP.`
          : `An old shrine offers a bargain. You have ${r.hp}/${r.maxHp} HP.`;
    showCard(
      `<h2>${title}<span class="sub">${sub}</span></h2><div class="opts">${c.options.map((o, k) => this.optionHtml(o, k)).join('')}</div>`,
      c.kind === 'reward' ? [{ label: 'Skip', onClick: () => this.choose('S') }] : [],
      false,
    );
    document.querySelectorAll<HTMLButtonElement>('#overlay .opt').forEach((b) => {
      b.onclick = () => {
        const k = Number(b.dataset.k);
        if (needsReplace(r, c.options[k])) this.askReplace(k);
        else this.choose(`C${k}`);
      };
    });
  }

  private askReplace(k: number): void {
    const r = this.r;
    const g = r.choice!.options[k].gifts.find((x) => x.t === 'gear') as { t: 'gear'; id: string } | undefined;
    const name = g ? gearDef(g.id as never).name : 'the new card';
    showCard(
      `<h2>Your kit is full<span class="sub">${MAX_GEAR} cards at most. Which one makes room for the ${name}?</span></h2><div class="opts">${r.gear
        .map((x, i) => `<button class="opt" data-r="${i}"><span class="ic">${gearDef(x.id).icon}</span><span><b>${gearName(x)}</b><span class="t">${slotsOf(x).map(slotSentence).join(' ')}</span></span></button>`)
        .join('')}</div>`,
      [{ label: 'Back', onClick: () => this.showChoice() }],
      false,
    );
    document.querySelectorAll<HTMLButtonElement>('#overlay .opt').forEach((b) => (b.onclick = () => this.choose(`C${k}.${b.dataset.r}`)));
  }

  private choose(a: string): void {
    this.sfx.unlock();
    if (!act(this.r, a)) return;
    this.save();
    this.sfx.pick();
    navigator.vibrate?.(10);
    closeOverlay();
    this.render();
    this.afterStep();
  }

  private recordEnd(): void {
    const r = this.r;
    const p = loadProfile();
    p.runs++;
    if (r.won) p.wins++;
    p.best = Math.max(p.best, r.score);
    p.bestFloor = Math.max(p.bestFloor, floorReached(r));
    store.save('profile', p);
    if (this.daily) recordDaily(store, r.score, `${fmt(r.score)}${r.won ? ' ★' : ` · floor ${floorReached(r)}`}`, this.daily);
  }

  showEnd(): void {
    const r = this.r;
    const p = loadProfile();
    const daily = this.daily ? loadDaily(store) : null;
    const s = r.stats;
    const kit = r.gear.map((g) => gearDef(g.id).icon + (g.up ? '+' : '')).join(' ');
    const dice = r.dice.map((d) => dieHtml(Math.max(...d.faces), d.kind)).join('');
    const title = r.won ? 'The House falls!' : this.daily ? 'Daily run over' : `Fallen on floor ${floorReached(r)}`;
    const why = r.won ? `All ${FLOORS} floors, with ${r.hp} HP to spare.` : r.killedBy === 'gave up' ? 'You walked away.' : `Beaten by ${/^The /.test(r.killedBy ?? '') ? '' : 'the '}${r.killedBy}.`;
    showCard(
      `<h2>${title}<span class="sub">${why}</span></h2>
       <p class="big">${fmt(r.score)}</p>
       <div class="stats">
         <div><b>${floorReached(r)}/${FLOORS}</b>floors</div><div><b>${s.fights}</b>fights</div>
         <div><b>${fmt(s.dealt)}</b>damage dealt</div><div><b>${s.biggest}</b>biggest hit</div>
         <div><b>${fmt(s.blocked)}</b>damage blocked</div><div><b>${s.turns}</b>turns</div>
       </div>
       <p class="meta2">Kit: ${kit}</p><div class="help-dice">${dice}</div>
       ${daily ? `<p class="meta2">Today’s best: ${daily.label} · ${plural(daily.plays, 'try')}</p>` : p.runs ? `<p class="meta2">Best ${fmt(p.best)} · ${plural(p.runs, 'run')}${p.wins ? ` · ${plural(p.wins, 'win')}` : ` · best floor ${p.bestFloor}`}</p>` : ''}`,
      [
        { label: 'New run', primary: true, onClick: () => this.newGame() },
        { label: this.daily ? 'Play the daily again' : 'Same seed again', onClick: () => this.start(this.r.seed, [], this.daily) },
        { label: 'All games', onClick: () => (location.href = '../') },
      ],
      false,
    );
  }

  /** Leave a help or menu card: back to whatever card the phase needs, else to the fight. */
  private back(): void {
    if (this.r.phase === 'fight') closeOverlay();
    else this.afterStep();
  }

  showHelp(): void {
    store.save('seenHelp', true);
    showCard(
      `<h2>Kitbag</h2>
       <p>Climb twelve floors to <b>The House</b>, fighting with dice and the gear in your bag.</p>
       <div class="help-dice">${dieHtml(2)}<span class="arrow">→</span><span class="help-slot">≤3</span><span class="arrow">=</span><b>Dagger: deal 2+3</b></div>
       <ul>
         <li>Each turn you <b>roll your dice</b>. <b>Drag</b> each one onto a slot on your gear (or tap a die, then a slot). Slots say what they take: <b>any</b>, <b>≤3</b>, <b>even</b>, <b>5+</b>, a <b>pair</b>… Slots that fit glow and show exactly what they’d do.</li>
         <li>The enemy shows its <b>next move</b> in the top-right: ⚔ attack, 🛡 block, ☠ poison, 🔒 hex (locks your best die), 🥀 wither (lowers your roll), ⏳ winding up a big hit. Tap it for words.</li>
         <li><b>Block</b> soaks hits until your next turn. Changed your mind? <b>↶</b> undoes a placement this turn. Then <b>End turn</b>.</li>
         <li>Win a fight: pick a <b>reward</b>: new gear (at most ${MAX_GEAR}), an upgrade, a new die (at most ${MAX_DICE}), or a heal. HP carries over. Elites give two picks; campfires heal or upgrade.</li>
       </ul>`,
      [{ label: this.r.phase === 'over' ? 'Back' : 'Got it', primary: true, onClick: () => this.back() }],
    );
  }

  showKit(): void {
    const r = this.r;
    const dice = r.dice
      .map((d) => `<span>${dieHtml(Math.max(...d.faces), d.kind).replace('class="die', 'style="--ds:26px" class="die')} ${dieDef(d.kind).name}: ${d.faces.join(' ')}</span>`)
      .join('');
    const gear = r.gear.map((g) => `<div>${gearDef(g.id).icon} <b>${gearName(g)}</b>: ${slotsOf(g).map(slotSentence).join(' ')}</div>`).join('');
    showCard(`<h2>Your kit<span class="sub">${r.hp}/${r.maxHp} HP · ${r.dice.length} dice · ${r.gear.length}/${MAX_GEAR} gear</span></h2><div class="dicerow">${dice}</div><div class="kitlist">${gear}</div>`, [
      { label: 'Back', primary: true, onClick: () => this.showMenu() },
    ]);
  }

  showMenu(): void {
    const r = this.r;
    showCard(`<h2>Kitbag${this.daily ? ' · daily' : ''}<span class="sub">Floor ${floorReached(r)} of ${FLOORS} · ${r.hp}/${r.maxHp} HP</span></h2>`, [
      { label: r.phase === 'over' ? 'Back' : 'Resume', primary: true, onClick: () => this.back() },
      { label: 'Your kit', onClick: () => this.showKit() },
      { label: 'The map', onClick: () => this.showMap(true) },
      { label: 'How to play', onClick: () => this.showHelp() },
      {
        label: 'New run',
        onClick: () =>
          showCard('<h2>New run?</h2><p>This run will be lost.</p>', [
            { label: 'Keep going', primary: true, onClick: () => this.back() },
            { label: 'New run', onClick: () => this.newGame() },
          ]),
      },
      { label: 'Copy bug report', onClick: () => this.copyReport() },
      { label: 'All games', onClick: () => (location.href = '../') },
    ]);
  }

  private async copyReport(): Promise<void> {
    toast((await copyText(`KITBAG v${RULES_VERSION} seed=${this.r.seed} a=${this.r.actions.join(',')}`)) ? 'Bug report copied' : 'Copy failed');
  }
}
