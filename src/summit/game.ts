// Summit controller: renders the peaks as DOM cards, handles taps, animates
// cards onto the waste, runs the charm picks between floors, saves after every
// action, and keeps the profile and the daily climb.

import { closeOverlay, showCard } from '../shared/cards';
import { dailySeed, leaveDaily, loadDaily, recordDaily, todayKey } from '../shared/daily';
import { copyText, toast } from '../shared/debug';
import { randomSeed } from '../shared/rng';
import { reducedFx } from '../shared/settings';
import { makeStore } from '../shared/storage';
import {
  DEAL_DRAWS,
  FLOORS,
  RANKS,
  RULES_VERSION,
  SUITS,
  act,
  charmDef,
  cornered,
  fitKind,
  floorReached,
  freshDraws,
  has,
  isCovered,
  isRed,
  newRun,
  nextDraws,
  playable,
  playableSlots,
  replay,
  shown,
  top,
  TUNE,
  type Card,
  type Outcome,
  type Run,
} from './core';
import { Sounds } from './audio';

export const store = makeStore('summit.');
const $ = (id: string) => document.getElementById(id)!;

interface Profile {
  runs: number;
  best: number;
  bestFloor: number;
  wins: number;
  bestStreak: number;
}
const loadProfile = () => store.load<Profile>('profile', { runs: 0, best: 0, bestFloor: 0, wins: 0, bestStreak: 0 });

// Text presentation, so phones don't swap the suits for emoji.
const VS = '︎';
const suit = (c: Card) => SUITS[c.s] + VS;
const label = (c: Card) => (c.r === 0 ? 'Joker' : `${RANKS[c.r]}${suit(c)}`);

function face(c: Card): string {
  if (c.r === 0) return `<span class="ix">★<i>JK</i></span><span class="pip">★</span>`;
  return `<span class="ix">${RANKS[c.r]}<i>${suit(c)}</i></span><span class="pip">${suit(c)}</span>`;
}

function cardHtml(c: Card | null, cls = '', attrs = ''): string {
  if (!c) return `<div class="pc back ${cls}" ${attrs}></div>`;
  return `<div class="pc ${isRed(c) ? 'red' : ''} ${c.r === 0 ? 'joker' : ''} ${cls}" ${attrs}>${face(c)}</div>`;
}

/** How a playable card fits: plainly, as a Mirror play (same rank) or a Long Stride. */
function how(r: Run, c: Card): 'play' | 'mirror' | 'stride' | null {
  const k = fitKind(r, c);
  const t = top(r.deal);
  return k === 'play' && t.r > 0 && c.r === t.r ? 'mirror' : k;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const fmt = (n: number) => n.toLocaleString('en-US');

export class Game {
  r: Run = newRun(1);
  daily: string | null = null;
  private sfx = new Sounds();
  private blastMode = false;
  private flights = 0;
  /** Between a cleared deal and the charm card: taps wait. */
  private busy = false;
  /** One-off hint for the info line, shown until the next render. */
  private msg: string | null = null;
  private bannerTimer = 0;

  constructor() {
    $('table').addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('.pc');
      if (el?.dataset.i) this.tap(Number(el.dataset.i), el);
    });
    $('stock').onclick = () => this.draw();
    $('undoBtn').onclick = () => this.undo();
    $('blastBtn').onclick = () => {
      this.sfx.unlock();
      if (this.r.deal.blasts <= 0) return;
      this.blastMode = !this.blastMode;
      this.msg = this.blastMode ? '<b>Blast:</b> tap any card to clear it, even a covered one. Tap 💥 again to cancel.' : null;
      this.render();
    };
    $('endBtn').onclick = () =>
      showCard(`<h2>End the climb?</h2><p>No plays and no draws left.${this.rescue() ? ` You could still ${this.rescue()}.` : ''}</p>`, [
        { label: 'End the run', primary: true, onClick: () => (closeOverlay(), this.apply('X')) },
        { label: 'Keep looking', onClick: closeOverlay },
      ]);
    $('charmBar').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button');
      if (!b?.dataset.c) return;
      const c = charmDef(b.dataset.c as never);
      this.msg = `${c.icon} <b>${c.name}</b>: ${c.text}${c.catch ? ` <span class="warn">${c.catch}</span>` : ''}`;
      this.render();
    });
    // Re-lay the peaks when the stage changes size, a frame later so the
    // layout change can't feed back into the observer.
    let size = '';
    new ResizeObserver(() =>
      requestAnimationFrame(() => {
        const t = $('table');
        const now = `${t.clientWidth}x${t.clientHeight}`;
        if (now === size) return;
        size = now;
        this.renderTable();
      }),
    ).observe($('stage'));
  }

  // ---------------------------------------------------------------- runs

  start(seed: number, actions: string[] = [], daily: string | null = null): void {
    closeOverlay();
    this.daily = daily;
    this.r = replay(seed, actions);
    this.blastMode = false;
    this.busy = false;
    this.msg = null;
    this.save();
    this.render();
    if (this.r.phase === 'over') this.showEnd();
    else if (this.r.phase === 'charm') this.showCharms();
    else this.announce();
  }

  newClimb(): void {
    leaveDaily();
    this.start(randomSeed());
  }

  playDaily(): void {
    const day = todayKey();
    const saved = store.load<{ v: number; seed: number; a: string; day: string } | null>('dailyRun', null);
    const seed = dailySeed('summit', day);
    if (saved && saved.v === RULES_VERSION && saved.day === day && saved.seed === seed) this.start(seed, saved.a ? saved.a.split(',') : [], day);
    else this.start(seed, [], day);
  }

  private save(): void {
    const data = { v: RULES_VERSION, seed: this.r.seed, a: this.r.actions.join(',') };
    if (this.daily) store.save('dailyRun', { ...data, day: this.daily });
    else store.save('run', data);
  }

  // ---------------------------------------------------------------- input

  private tap(i: number, el: HTMLElement): void {
    this.sfx.unlock();
    const r = this.r;
    if (this.busy || r.phase !== 'play') return;
    const s = r.deal.slots[i];
    if (this.blastMode) {
      const rect = el.getBoundingClientRect();
      this.blastMode = false;
      const o = this.apply(`B${i}`);
      if (o) this.boom(rect, el);
      return;
    }
    if (!playable(r, i)) {
      this.sfx.nope();
      if (!reducedFx()) {
        el.classList.remove('shake');
        void el.offsetWidth;
        el.classList.add('shake');
      }
      const t = top(r.deal);
      if (isCovered(r.deal, i)) this.msg = 'That card is covered: clear the cards on top of it first.';
      else if (t.r === 0) this.msg = '';
      else {
        const lo = ((t.r + 11) % 13) + 1, hi = (t.r % 13) + 1;
        this.msg = `${label(s.card)} doesn’t fit. On ${label(t)} you can play a <b>${RANKS[lo]}</b> or a <b>${RANKS[hi]}</b>${has(r, 'mirror') ? ` (or a ${RANKS[t.r]})` : ''}.`;
      }
      this.renderInfo();
      return;
    }
    const rect = el.getBoundingClientRect();
    const card = s.card;
    const o = this.apply(`P${i}`);
    if (o) this.fly(card, rect);
  }

  private draw(): void {
    this.sfx.unlock();
    const r = this.r;
    if (this.busy || r.phase !== 'play' || !r.deal.stock.length) return;
    this.blastMode = false;
    const rect = $('stock').getBoundingClientRect();
    const o = this.apply('D');
    if (o) this.fly(top(this.r.deal), rect);
  }

  private undo(): void {
    this.sfx.unlock();
    if (this.busy) return;
    this.blastMode = false;
    if (this.apply('U')) this.msg = `Undone. ${plural(this.r.undos, 'undo')} left on this floor.`;
    this.render();
  }

  /** Plays an action, saves, redraws and gives feedback. */
  private apply(a: string): Outcome | null {
    const before = this.r.deal.streak;
    const o = act(this.r, a);
    if (!o) return null;
    this.save();
    this.feedback(o, before);
    this.render();
    return o;
  }

  // ---------------------------------------------------------------- feedback

  private feedback(o: Outcome, streakBefore: number): void {
    const r = this.r;
    const d = r.deal;
    if (o.kind === 'play') {
      navigator.vibrate?.(8);
      if (o.stride) {
        this.sfx.play(1);
        this.msg = `Long stride: the top card of the pile was discarded, no points, streak over. ${plural(d.strides, 'stride')} left this deal.`;
      } else {
        this.sfx.play(d.streak);
        this.float(`+${o.points}`, o.flush ? 'Flush ×2' : '');
        if (o.mirror) this.msg = `Mirror play. ${plural(d.mirrors, 'mirror play')} left this deal.`;
        if (d.streak >= 2 && d.streak > streakBefore && !reducedFx()) {
          const st = $('combo');
          st.classList.remove('pop');
          void st.offsetWidth;
          st.classList.add('pop');
        }
      }
    } else if (o.kind === 'draw') {
      this.sfx.draw();
      if (o.lucky) this.msg = '<b>Lucky draw:</b> the 3rd draw in a row without a play (and every one after it) turns up a card that fits, while the pile still has one.';
      else if (o.noLuck) this.msg = '<span class="warn">No card left in the pile fits an open card</span>, so no lucky draw this time.';
      else if (streakBefore >= 3) this.msg = `Streak of ${streakBefore} ended.`;
    } else if (o.kind === 'blast') {
      this.sfx.blast();
      navigator.vibrate?.([20, 30, 40]);
    } else if (o.kind === 'undo') this.sfx.undo();
    if (o.refund) {
      setTimeout(() => this.sfx.refund(), 120);
      this.float(`+${plural(o.refund, 'draw')}`, '', true, $('stock'));
    }
    if (o.wind) {
      this.sfx.wind();
      this.banner('Second Wind', `${plural(d.stock.length, 'fresh draw')}`);
    }
    if (o.cleared) {
      this.busy = true;
      setTimeout(() => this.sfx.clear(), 150);
      navigator.vibrate?.([30, 40, 30]);
      if (o.won) this.banner('Summit!', `+${fmt(o.bonus!)} points`);
      else this.banner(`Floor ${r.floor + 1} cleared`, `+${fmt(o.bonus!)} points`);
    }
    if (o.over) {
      this.busy = true;
      this.recordEnd();
      if (!o.won) setTimeout(() => this.sfx.over(false), 250);
      else setTimeout(() => this.sfx.over(true), 700);
      setTimeout(() => ((this.busy = false), this.showEnd()), o.kind === 'quit' ? 100 : 1500);
    } else if (o.cleared) setTimeout(() => ((this.busy = false), this.showCharms(o)), 1500);
  }

  /** Card flies from where it was to the waste. */
  private fly(c: Card, from: DOMRect): void {
    const box = $('wasteBox');
    const to = box.getBoundingClientRect();
    const waste = $('waste');
    const el = document.createElement('div');
    el.innerHTML = cardHtml(c);
    const pc = el.firstElementChild as HTMLElement;
    pc.style.cssText = `left:${to.left}px;top:${to.top}px;--cw:${to.width}px;--ch:${to.height}px;transform-origin:0 0`;
    $('fx').appendChild(pc);
    this.flights++;
    waste.style.visibility = 'hidden';
    const dx = from.left - to.left, dy = from.top - to.top, k = from.width / to.width;
    const anim = pc.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${k})` }, { transform: 'none' }], {
      duration: reducedFx() ? 120 : 230,
      easing: 'cubic-bezier(.25,.8,.35,1)',
    });
    const done = () => {
      pc.remove();
      if (--this.flights <= 0) {
        this.flights = 0;
        waste.style.visibility = '';
      }
    };
    anim.onfinish = done;
    anim.oncancel = done;
  }

  private boom(rect: DOMRect, el: HTMLElement): void {
    const ghost = el.cloneNode(true) as HTMLElement;
    ghost.classList.remove('can', 'covered', 'target', 'shake');
    ghost.style.cssText = `left:${rect.left}px;top:${rect.top}px;--cw:${rect.width}px;--ch:${rect.height}px;z-index:2`;
    $('fx').appendChild(ghost);
    ghost.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(1.4) rotate(12deg)' }], { duration: 380 }).onfinish = () => ghost.remove();
    if (reducedFx()) return;
    const b = document.createElement('div');
    b.className = 'boom';
    b.style.left = `${rect.left + rect.width / 2}px`;
    b.style.top = `${rect.top + rect.height / 2}px`;
    $('fx').appendChild(b);
    b.animate([{ opacity: 1, transform: 'scale(0.3)' }, { opacity: 0, transform: 'scale(1.6)' }], { duration: 420, easing: 'ease-out' }).onfinish = () => b.remove();
  }

  /** Floating "+30", rising from just above the charm row (clear of the info line), over the waste or the pile. */
  private float(text: string, sub: string, blue = false, at: HTMLElement = $('wasteBox')): void {
    const r = at.getBoundingClientRect();
    const stage = $('stage').getBoundingClientRect();
    const el = document.createElement('div');
    el.className = `float${blue ? ' blue' : ''}`;
    el.textContent = sub ? `${text} ${sub}` : text;
    el.style.left = `${r.left + r.width / 2}px`;
    el.style.top = `${stage.bottom - 62}px`;
    $('fx').appendChild(el);
    el.animate(
      [
        { opacity: 0, transform: 'translate(-50%, -30%)' },
        { opacity: 1, transform: 'translate(-50%, -90%)', offset: 0.2 },
        { opacity: 0, transform: 'translate(-50%, -260%)' },
      ],
      { duration: 900, easing: 'ease-out' },
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
    this.bannerTimer = window.setTimeout(() => (b.hidden = true), 2400);
  }

  private announce(): void {
    const r = this.r;
    if (r.phase !== 'play' || r.deal.waste.length > 1 || r.deal.slots.some((s) => s.gone)) return;
    const carried = r.floor ? `, ${r.carry} carried` : '';
    this.banner(`Floor ${r.floor + 1} · ${r.deal.layout}`, `+${freshDraws(r)} draws${carried}`);
  }

  // ---------------------------------------------------------------- render

  render(): void {
    const r = this.r;
    const d = r.deal;
    $('floorNo').textContent = `${floorReached(r)}/${FLOORS}`;
    $('draws').textContent = String(d.stock.length);
    $('draws').classList.toggle('low', r.phase === 'play' && d.stock.length <= 3);
    $('score').textContent = fmt(r.score);
    $('dailyTag').hidden = !this.daily;
    this.renderTable();
    // Piles.
    $('waste').innerHTML = cardHtml(top(d));
    $('stock').classList.toggle('empty', !d.stock.length);
    $('stockN').textContent = String(d.stock.length);
    // What the next three draws in a row would turn up (lucky draws included), next one last.
    const peek = has(r, 'spyglass') && r.phase === 'play' ? nextDraws(r, 3).reverse() : [];
    $('peek').innerHTML = peek.map((c) => cardHtml(c)).join('');
    // Tools.
    const undo = $('undoBtn') as HTMLButtonElement;
    undo.hidden = !has(r, 'rewind');
    undo.disabled = !(r.undos > 0 && r.hist.length > 0) || r.phase !== 'play';
    $('undoN').textContent = String(r.undos);
    const blast = $('blastBtn') as HTMLButtonElement;
    blast.hidden = !has(r, 'blast');
    blast.disabled = d.blasts <= 0 || r.phase !== 'play';
    blast.classList.toggle('on', this.blastMode);
    $('endBtn').hidden = !cornered(r) || r.phase !== 'play';
    // Charms owned.
    $('charmBar').innerHTML = r.charms
      .map((id) => {
        const c = charmDef(id);
        const left = id === 'mirror' ? d.mirrors : id === 'stride' ? d.strides : id === 'blast' ? d.blasts : null;
        const spent = (id === 'wind' && r.windUsed) || (id === 'rewind' && r.undos <= 0) || left === 0;
        return `<button data-c="${id}" class="${spent ? 'spent' : ''}" aria-label="${c.name}">${c.icon}${left !== null ? `<i>${left}</i>` : ''}</button>`;
      })
      .join('');
    this.renderInfo();
  }

  private renderTable(): void {
    const r = this.r;
    const d = r.deal;
    const t = $('table');
    const W = t.clientWidth, H = t.clientHeight;
    if (!W || !H) return;
    const xs = d.slots.map((s) => s.x);
    const minX = Math.min(...xs);
    const cols = (Math.max(...xs) + 2 - minX) / 2;
    let cw = Math.min(66, Math.floor((W - 16) / cols));
    let ch = Math.round(cw * 1.42);
    let step = Math.round(ch * 0.66);
    const need = ch + (d.rows - 1) * step;
    if (need > H - 12) {
      const k = (H - 12) / need;
      cw = Math.floor(cw * k);
      ch = Math.round(cw * 1.42);
      step = Math.round(ch * 0.66);
    }
    const h = ch + (d.rows - 1) * step;
    const left = (W - cols * cw) / 2;
    const y0 = Math.max(8, Math.min(56, (H - h) * 0.18));
    // The streak meter sits in the open ground between the peaks and the charms.
    const combo = $('combo');
    combo.style.top = $('banner').style.top = `${(y0 + h + H) / 2 + 6}px`;
    const next = (d.streak + 1) * 10 * (has(r, 'stakes') ? 2 : 1);
    combo.innerHTML = d.streak >= 2 && r.phase === 'play' ? `<b>×${d.streak}</b><span>streak · next card +${next}</span>` : '';
    if (combo.innerHTML) $('banner').hidden = true;
    t.style.setProperty('--cw', `${cw}px`);
    t.style.setProperty('--ch', `${ch}px`);
    const can = new Set(playableSlots(r));
    const flags = has(r, 'flags');
    t.innerHTML = d.slots
      .map((s, i) => {
        if (s.gone) return '';
        const cov = isCovered(d, i);
        const fit = can.has(i) && !this.blastMode ? how(r, s.card) : '';
        const cls = [cov ? 'covered' : '', fit === 'play' ? 'can' : fit, this.blastMode ? 'target' : '', flags && s.row === 0 ? 'peak' : ''].join(' ');
        const style = `style="left:${Math.round(left + ((s.x - minX) / 2) * cw)}px;top:${Math.round(y0 + s.row * step)}px;z-index:${s.row + 1}"`;
        return cardHtml(shown(r, i) ? s.card : null, cls, `data-i="${i}" ${style}`);
      })
      .join('');
  }

  private renderInfo(): void {
    const r = this.r;
    const d = r.deal;
    let html = this.msg ?? '';
    this.msg = null;
    if (!html && r.phase === 'play') {
      if (cornered(r)) html = `<span class="warn">Out of plays and draws.</span> ${this.rescue() ? `You can still ${this.rescue()}, or end the run.` : 'End the run.'}`;
      else if (!playableSlots(r).length) html = 'No card fits. <b>Tap the pile</b> to draw a new waste card.';
      else if (!d.stock.length) html = '<span class="warn">No draws left.</span> Only plays now: make them count.';
      else if (r.floor === 0 && d.waste.length <= 2 && !d.slots.some((s) => s.gone)) html = 'Tap a <b>gold-edged</b> card: one higher or lower than the waste card below. K and A connect.';
      else {
        const fits = playableSlots(r).map((i) => d.slots[i].card);
        const plain = fits.filter((c) => how(r, c) === 'play');
        const names = (k: string) => fits.filter((c) => how(r, c) === k).map(label).join(', ');
        html = plain.length ? `${plural(plain.length, 'card')} ${plain.length === 1 ? 'fits' : 'fit'} on ${label(top(d))}.` : `Nothing fits ${label(top(d))} the usual way.`;
        if (names('mirror')) html += ` <b class="mi">${names('mirror')}</b>: mirror play (${d.mirrors} left).`;
        if (names('stride')) html += ` <b class="st">${names('stride')}</b>: long stride, discards the top card of the pile and ends the streak (${d.strides} left).`;
      }
    }
    $('info').innerHTML = html || '&nbsp;';
  }

  /** What the player still owns to get unstuck, in words ("blast a card or undo"). */
  private rescue(): string {
    const r = this.r;
    const ways = [r.deal.blasts > 0 ? 'blast a card' : '', r.undos > 0 && r.hist.length ? 'undo' : ''].filter(Boolean);
    return ways.join(' or ');
  }

  // ---------------------------------------------------------------- cards

  private climb(): string {
    const r = this.r;
    return `<div class="climb">${[...Array(FLOORS).keys()]
      .map((f) => `<span class="${f < r.cleared ? 'done' : f === r.floor && r.phase === 'over' && !r.won ? 'fell' : ''}">${f + 1}</span>`)
      .join('')}</div>`;
  }

  private showCharms(o?: Outcome): void {
    const r = this.r;
    if (r.phase !== 'charm') return;
    const next = { ...r, floor: r.floor + 1 } as Run;
    const owned = r.charms.length ? `<p>Yours: ${r.charms.map((c) => charmDef(c).icon).join(' ')}</p>` : '';
    showCard(
      `<h2>Floor ${r.floor + 1} cleared</h2>${this.climb()}
       <p>${o?.bonus ? `+${fmt(o.bonus)} points. ` : ''}<b>${plural(r.carry, 'unused draw')}</b> carry up${o?.unused !== undefined && o.unused > r.carry ? ` (${o.unused} left, at most ${TUNE.carry} carry)` : ''}; floor ${r.floor + 2} adds ${freshDraws(next)} more${freshDraws(next) !== DEAL_DRAWS[r.floor + 1] ? ` (${DEAL_DRAWS[r.floor + 1]} ${freshDraws(next) > DEAL_DRAWS[r.floor + 1] ? '+' : '−'} ${Math.abs(freshDraws(next) - DEAL_DRAWS[r.floor + 1])} from your charms)` : ''}. Pick a charm:</p>
       <div class="charms">${r.offer
         .map((id) => {
           const c = charmDef(id);
           return `<button class="charm" data-c="${id}"><span class="ic">${c.icon}</span><span><b>${c.name}</b><span class="t">${c.text}</span>${c.catch ? `<em>${c.catch}</em>` : ''}</span></button>`;
         })
         .join('')}</div>${owned}`,
      [],
      false,
    );
    document.querySelectorAll<HTMLElement>('#overlay .charm').forEach((b) => {
      b.onclick = () => {
        this.sfx.unlock();
        if (!act(this.r, `C${b.dataset.c}`)) return;
        this.sfx.charm();
        this.save();
        closeOverlay();
        this.render();
        this.announce();
      };
    });
  }

  private recordEnd(): void {
    const r = this.r;
    const p = loadProfile();
    p.runs++;
    p.best = Math.max(p.best, r.score);
    p.bestFloor = Math.max(p.bestFloor, r.won ? FLOORS : r.floor + 1);
    p.bestStreak = Math.max(p.bestStreak, r.bestStreak);
    if (r.won) p.wins++;
    store.save('profile', p);
    if (this.daily) recordDaily(store, r.score, `${fmt(r.score)}${r.won ? ' ★' : ` · floor ${r.floor + 1}`}`, this.daily);
  }

  showEnd(): void {
    const r = this.r;
    const p = loadProfile();
    const daily = this.daily ? loadDaily(store) : null;
    const charms = r.charms.map((c) => charmDef(c).icon).join(' ');
    showCard(
      `<h2>${r.won ? 'Summit reached!' : this.daily ? 'Daily climb over' : 'The climb ends'}</h2>${this.climb()}
       <p class="big">${fmt(r.score)}</p>
       <p class="meta2">${r.won ? 'All eight floors cleared' : `Ended on floor ${r.floor + 1}`} · best streak ${r.bestStreak}${charms ? ` · ${charms}` : ''}</p>
       ${daily ? `<p class="meta2">Today’s best: ${daily.label} · ${plural(daily.plays, 'try')}</p>` : p.runs ? `<p class="meta2">Best ${fmt(p.best)} · ${plural(p.runs, 'climb')}${p.wins ? ` · ${plural(p.wins, 'summit')}` : ''}</p>` : ''}`,
      [
        { label: 'New climb', primary: true, onClick: () => this.newClimb() },
        { label: this.daily ? 'Play the daily again' : 'Same deals again', onClick: () => this.start(this.r.seed, [], this.daily) },
        { label: 'All games', onClick: () => (location.href = '../') },
      ],
      false,
    );
  }

  /** Leave a help or menu card: back to the end or charm card if one is due, else to the board. */
  private back(): void {
    if (this.r.phase === 'over') this.showEnd();
    else if (this.r.phase === 'charm') this.showCharms();
    else closeOverlay();
  }

  showHelp(): void {
    store.save('seenHelp', true);
    showCard(
      `<h2>Summit</h2>
       <p>A solitaire climb: eight deals, each a ridge of card peaks.</p>
       <ul>
         <li><b>Tap a card one higher or lower</b> than the waste card at the bottom to move it there. K and A connect. Only cards with nothing on top can move; those that fit have a <b>gold edge</b>.</li>
         <li>No fit? <b>Tap the pile</b> to draw a new waste card. Plays in a row make a <b>streak</b> worth 10, 20, 30… points; a draw ends it. A draw never repeats the waste card’s rank, and the 3rd draw in a row without a play (and each one after) is <b>lucky</b>: it turns up a card that fits, if any card left in the pile does.</li>
         <li>Clear every card to climb. <b>Unused draws carry up</b> (at most ${TUNE.carry}) and later floors add fewer, so bank some early. No plays and no draws left: the climb ends.</li>
         <li>After each floor pick one of three <b>charms</b>. Higher floors deal more cards face down.</li>
       </ul>`,
      [{ label: this.r.phase === 'over' ? 'Back' : 'Start climbing', primary: true, onClick: () => this.back() }],
    );
  }

  showMenu(): void {
    const r = this.r;
    const owned = r.charms.length
      ? `<div class="owned">${r.charms
          .map((id) => {
            const c = charmDef(id);
            return `<div>${c.icon} <b>${c.name}</b>: ${c.text}${c.catch ? ` ${c.catch}` : ''}</div>`;
          })
          .join('')}</div>`
      : '<p>No charms yet: you pick one after each floor.</p>';
    showCard(`<h2>Summit${this.daily ? ' · daily' : ''}</h2>${this.climb()}${owned}`, [
      { label: r.phase === 'over' ? 'Back' : 'Resume', primary: true, onClick: () => this.back() },
      { label: 'How to play', onClick: () => this.showHelp() },
      {
        label: 'New climb',
        onClick: () =>
          showCard('<h2>New climb?</h2><p>This run will be lost.</p>', [
            { label: 'Keep climbing', primary: true, onClick: closeOverlay },
            { label: 'New climb', onClick: () => this.newClimb() },
          ]),
      },
      { label: 'Copy bug report', onClick: () => this.copyReport() },
      { label: 'All games', onClick: () => (location.href = '../') },
    ]);
  }

  private async copyReport(): Promise<void> {
    toast((await copyText(`SUMMIT v${RULES_VERSION} seed=${this.r.seed} a=${this.r.actions.join(',')}`)) ? 'Bug report copied' : 'Copy failed');
  }
}
