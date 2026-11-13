// Tidings controller: the resource bar, the journey strip, the hand of cards at
// each stop (a focused card with its choices, then its outcome), the road
// choice, the journal across runs, saves, the daily and bug reports.

import { closeOverlay, showCard } from '../shared/cards';
import { dailySeed, leaveDaily, loadDaily, recordDaily, todayKey } from '../shared/daily';
import { copyText, toast } from '../shared/debug';
import { randomSeed } from '../shared/rng';
import { makeStore } from '../shared/storage';
import {
  CARD,
  CARDS,
  COMPANIONS,
  COMP_IDS,
  ENDING,
  ENDINGS,
  KIND_INFO,
  LAST,
  PROMISES,
  REGION_NAME,
  RES,
  RES_INFO,
  RULES_VERSION,
  STARS,
  TUNE,
  act,
  blockOf,
  cardBlock,
  emptied,
  landed,
  legCost,
  nodeOf,
  oddsOf,
  outcomeText,
  recruitOf,
  regionOf,
  replay,
  telling,
  type Card,
  type Choice,
  type CompId,
  type Fx,
  type Res,
  type Run,
} from './core';
import { cardArt } from './art';

export const store = makeStore('tidings.');
const $ = (id: string) => document.getElementById(id)!;

interface Profile {
  runs: number;
  arrivals: number;
  best: number;
  bestStars: number;
  cards: string[];
  endings: string[];
  comps: string[];
}
const loadProfile = (): Profile => ({ runs: 0, arrivals: 0, best: 0, bestStars: 0, cards: [], endings: [], comps: [], ...store.load<Partial<Profile>>('profile', {}) });

const MAX: Record<Res, () => number> = { f: () => TUNE.capF, o: () => TUNE.capO, c: () => TUNE.capC, h: () => TUNE.capH, t: () => TUNE.capT };
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const plural = (n: number, w: string, ws = `${w}s`) => `${n} ${n === 1 ? w : ws}`;

/** "+2 🍞" chips for an effect; with a run, gains past the cap say so. */
function chips(fx: Fx, r?: Run): string {
  const got = r ? landed(r, fx) : fx;
  return RES.filter((k) => fx[k])
    .map((k) => {
      const d = fx[k]!;
      const g = got[k] ?? 0;
      const full = d > 0 && g < d;
      return `<span class="fx ${d > 0 ? 'up' : 'down'}${full ? ' full' : ''}">${d > 0 ? '+' : '−'}${Math.abs(d)}&#8202;${RES_INFO[k].icon}${full ? `<small>${g > 0 ? ` +${g} fits` : ' full'}</small>` : ''}</span>`;
    })
    .join('');
}
const legChips = (fx: Fx) => chips(fx) || '<span class="fx none">free</span>';

/** Food a leg costs with n companions (before the place's own costs). */
const bandFood = (n: number) => TUNE.bandFood * Math.floor(n / 2);

export class Game {
  r!: Run;
  daily: string | null = null;
  /** The hand card open in the focus view, and whether its outcome is showing. */
  private focusH = -1;
  private walking = false;

  constructor() {
    $('bookBtn').onclick = () => this.showJournal();
    $('map').onclick = () => this.showRoute();
    $('hand').addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-h]');
      if (el && !this.walking) this.openCard(Number(el.dataset.h));
    });
    $('band').addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-comp],[data-prom],[data-dog]');
      if (!el) return;
      if (el.dataset.comp) this.showComp(el.dataset.comp as CompId);
      else if (el.dataset.prom) this.showPromise(el.dataset.prom);
      else this.showDog();
    });
    $('dock').addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-road]');
      if (el && !this.walking) this.walk(Number(el.dataset.road));
    });
    $('focus').addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const ch = t.closest<HTMLButtonElement>('[data-choice]');
      if (ch && !ch.disabled) return this.choose(Number(ch.dataset.choice));
      if (t.closest('[data-back]') || t.id === 'focus') this.closeFocus();
      if (t.closest('[data-next]')) this.afterOutcome();
    });
  }

  // ---------------------------------------------------------------- runs

  start(seed: number, actions: string[] = [], daily: string | null = null): void {
    closeOverlay();
    this.closeFocus(true);
    this.daily = daily;
    this.r = replay(seed, actions);
    this.save();
    this.learn();
    this.render(true);
    if (this.r.phase === 'over') this.showEnd();
  }

  newGame(): void {
    leaveDaily();
    this.start(randomSeed());
  }

  playDaily(): void {
    const day = todayKey();
    const saved = store.load<{ v: number; seed: number; a: string; day: string } | null>('dailyRun', null);
    const seed = dailySeed('tidings', day);
    if (saved && saved.v === RULES_VERSION && saved.day === day && saved.seed === seed) this.start(seed, saved.a ? saved.a.split(',') : [], day);
    else this.start(seed, [], day);
  }

  private save(): void {
    const data = { v: RULES_VERSION, seed: this.r.seed, a: this.r.actions.join(',') };
    if (this.daily) store.save('dailyRun', { ...data, day: this.daily });
    else store.save('run', data);
  }

  // ---------------------------------------------------------------- drawing

  render(deal = false): void {
    this.renderRes();
    this.renderMap();
    this.renderWhere();
    this.renderHand(deal);
    this.renderDock();
  }

  private renderRes(prev?: Record<Res, number>): void {
    const r = this.r;
    $('res').innerHTML = RES.map((k) => {
      const v = r.res[k];
      const low = k !== 'c' && v <= 2;
      const d = prev ? v - prev[k] : 0;
      return `<div class="pill ${k}${low ? ' low' : ''}" data-res="${k}" title="${RES_INFO[k].name}"><span class="ic">${RES_INFO[k].icon}</span><b>${v}</b>${
        d ? `<i class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : '−'}${Math.abs(d)}</i>` : ''
      }</div>`;
    }).join('');
    $('res').onclick = (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-res]');
      if (el) this.showRes(el.dataset.res as Res);
    };
  }

  private renderMap(): void {
    const r = this.r;
    const W = 360, H = 62, pad = 14;
    const x = (i: number) => pad + (i * (W - 2 * pad)) / LAST;
    const y = (row: number, k: number) => (r.map[row].length === 1 ? H / 2 + 2 : H / 2 + 2 + (k ? 13 : -13));
    let s = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">`;
    const bands = ['#2b3a24', '#22352f', '#2c3442'];
    [[0, 3.5], [3.5, 7.5], [7.5, LAST + 0.6]].forEach(([a, b], i) => {
      s += `<rect x="${i ? x(a) : 0}" y="0" width="${(i === 2 ? W : x(b)) - (i ? x(a) : 0)}" height="${H}" fill="${bands[i]}"/>`;
    });
    for (let row = 0; row < LAST; row++) {
      r.map[row].forEach((_, a) => {
        r.map[row + 1].forEach((__, b) => {
          const walked = row < r.stop && r.path[row] === a && r.path[row + 1] === b;
          const open = row >= r.stop && (row > r.stop || r.path[row] === a);
          if (!walked && !open) return;
          s += `<line x1="${x(row)}" y1="${y(row, a)}" x2="${x(row + 1)}" y2="${y(row + 1, b)}" class="${walked ? 'walked' : 'open'}"/>`;
        });
      });
    }
    s += '</svg>';
    let nodes = '';
    r.map.forEach((col, row) =>
      col.forEach((n, k) => {
        const taken = row <= r.stop && r.path[row] === k;
        const here = row === r.stop && taken;
        const gone = row <= r.stop && !taken;
        const icon = row === 0 ? '🌉' : row === LAST ? '🏡' : KIND_INFO[n.kind].icon;
        nodes += `<span class="node${here ? ' here' : ''}${taken ? ' taken' : ''}${gone ? ' gone' : ''}" style="left:${((x(row) / W) * 100).toFixed(2)}%;top:${((y(row, k) / H) * 100).toFixed(2)}%">${icon}</span>`;
      }),
    );
    $('map').innerHTML = s + nodes;
  }

  private renderWhere(): void {
    const r = this.r;
    const n = nodeOf(r);
    const stopWord = r.stop === 0 ? 'Setting out' : r.stop >= LAST ? 'Journey’s end' : `Stop ${r.stop} of ${LAST - 1}`;
    $('placeLine').innerHTML = `<span class="stopno">${stopWord}</span> <b>${r.stop === 0 ? '🌉' : r.stop >= LAST ? '🏡' : KIND_INFO[n.kind].icon} ${esc(n.name)}</b> <span class="region">${r.stop >= LAST ? '' : REGION_NAME[regionOf(r.stop)]}</span>${this.daily ? '<span class="dailyTag">Daily</span>' : ''}`;
    const band = r.band
      .map((b) => `<button class="chip comp" data-comp="${b.id}">${COMPANIONS[b.id].icon} ${COMPANIONS[b.id].name.replace('Old ', '')}</button>`)
      .join('');
    const dog = r.flags.dog !== undefined ? `<button class="chip dog" data-dog="1">🐕</button>` : '';
    const proms = Object.entries(r.promises)
      .filter(([, st]) => st === 'carry')
      .map(([p]) => `<button class="chip prom" data-prom="${p}">${PROMISES[p].icon}</button>`)
      .join('');
    const empty = r.band.length ? '' : `<span class="alone">Your band: two carriers and a mule</span>`;
    $('band').innerHTML = empty + band + dog + proms;
  }

  private renderHand(deal = false): void {
    const r = this.r;
    const el = $('hand');
    if (r.phase === 'over' && !r.hand.length) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = r.hand
      .map((hc, h) => {
        const c = CARD[hc.id];
        const t = telling(hc);
        const passed = r.phase !== 'cards' && !hc.done;
        const lock = !hc.done && r.phase === 'cards' ? cardBlock(r, h) : null;
        const tags = [c.must ? '<span class="tag must">⚑ Can’t be passed</span>' : '', c.cb ? `<span class="tag cb">✦ ${c.when?.comp ? 'Companion' : 'Callback'}</span>` : ''].join('');
        const gated = [...new Set(c.choices.filter((x) => x.need).map((x) => x.need!))]
          .map((id) => `<span class="gate${COMPANIONS[id] && r.band.some((b) => b.id === id) ? ' have' : ''}">${COMPANIONS[id].icon}</span>`)
          .join('');
        const rec = recruitOf(c);
        const body = hc.done
          ? `<div class="did"><span class="ok">✓</span> ${esc(c.choices[hc.pick!].t)}${hc.won === undefined ? '' : hc.won ? ' · 🎲 came off' : ' · 🎲 no luck'}</div><div class="got">${chips(hc.got ?? {}) || '<span class="fx none">no change</span>'}</div>`
          : passed
            ? `<div class="did passed">Passed by</div>`
            : `<div class="ex">${esc(t.text)}</div><div class="tags">${tags}<span class="meta">${plural(c.choices.length, 'choice')}</span>${rec ? `<span class="meta">${COMPANIONS[rec].icon} recruit</span>` : ''}${gated ? `<span class="meta">${gated}</span>` : ''}</div>`;
        return `<button class="mini${hc.done ? ' done' : ''}${passed ? ' passed' : ''}${lock ? ' locked' : ''}${c.must ? ' must' : ''}${deal ? ' deal' : ''}" data-h="${h}" style="--d:${h * 90}ms">
          <div class="art">${cardArt(c.id, t.art, c.sky, regionOf(r.stop), false, true)}</div>
          <div class="body"><div class="ttl">${esc(t.title)}</div>${body}${lock ? `<div class="lockline">🔒 ${esc(lock)}</div>` : ''}</div></button>`;
      })
      .join('');
  }

  private renderDock(): void {
    const r = this.r;
    const d = $('dock');
    if (r.phase === 'over') {
      d.innerHTML = `<button class="primary wide" id="endBtn">${ENDING[r.end!.ending].kind === 'arrive' ? 'Hollin 🏡' : 'The journey ends'}</button>`;
      $('endBtn').onclick = () => this.showEnd();
      return;
    }
    if (r.phase === 'cards') {
      const left = Math.min(TUNE.face - r.faced, r.hand.filter((x) => !x.done).length);
      const must = r.hand.some((x, i) => !x.done && CARD[x.id].must && i >= 0);
      d.innerHTML = `<div class="hint"><b>Face ${left === TUNE.face ? `${TUNE.face} of these ${r.hand.length}` : `${left} more`}</b>${
        must ? ' · the ⚑ card can’t be passed by' : ''
      }. Tap a card to read it.</div>${this.roadPreview()}`;
      return;
    }
    // The road.
    const next = r.map[r.stop + 1];
    d.innerHTML = `<div class="hint"><b>${r.stop + 1 >= LAST ? 'The last mile' : 'Where next?'}</b> ${r.stop + 1 >= LAST ? 'is downhill, and Hollin sends a sledge.' : 'The walk there costs:'}</div><div class="roads">${next
      .map((n, k) => {
        const fx = legCost(r, k);
        const dead = emptied(r, fx);
        const icon = r.stop + 1 >= LAST ? '🏡' : KIND_INFO[n.kind].icon;
        return `<button class="road" data-road="${k}"><span class="ri">${icon}</span><span class="rn">${esc(n.name)}</span><span class="rk">${r.stop + 1 >= LAST ? 'journey’s end' : KIND_INFO[n.kind].word}</span><span class="rc">${legChips(fx)}</span>${
          dead.length ? `<span class="warn">☠ out of ${dead.map((k2) => RES_INFO[k2].short).join(' and ')}</span>` : ''
        }</button>`;
      })
      .join('')}</div>`;
  }

  /** The two roads out of this stop, small, while the cards are still up. */
  private roadPreview(): string {
    const r = this.r;
    const next = r.map[r.stop + 1];
    if (!next) return '';
    return `<div class="preview">Then: ${next
      .map((n, k) => `<span class="pv">${r.stop + 1 >= LAST ? '🏡' : KIND_INFO[n.kind].icon} ${legChips(legCost(r, k))}</span>`)
      .join('<span class="or">or</span>')}</div>`;
  }

  // ---------------------------------------------------------------- a card up close

  private openCard(h: number): void {
    const r = this.r;
    const hc = r.hand[h];
    if (!hc || r.phase === 'over') return;
    this.focusH = h;
    const c = CARD[hc.id];
    const t = telling(hc);
    const f = $('focus');
    if (hc.done) {
      f.innerHTML = this.backFace(h, false);
    } else {
      const lock = r.phase === 'cards' ? cardBlock(r, h) : 'Passed by';
      const why = this.because(c);
      f.innerHTML = `<div class="big"><div class="face front">
        <div class="art">${cardArt(c.id, t.art, c.sky, regionOf(r.stop), true)}</div>
        <div class="inner">
          <h2>${esc(t.title)}</h2>
          ${c.must ? '<div class="tag must">⚑ This one can’t be passed by</div>' : ''}
          ${why ? `<div class="because">✦ ${why}</div>` : ''}
          <p class="text">${esc(t.text)}</p>
          ${lock ? `<p class="lockline">🔒 ${esc(lock)}</p>` : ''}
          <div class="choices">${c.choices.map((ch, k) => this.choiceHTML(ch, k, !!lock)).join('')}</div>
          <button class="secondary" data-back="1">Back to the cards</button>
        </div></div></div>`;
    }
    f.hidden = false;
    f.scrollTop = 0;
    requestAnimationFrame(() => f.classList.add('open'));
  }

  private because(c: Card): string {
    const r = this.r;
    const w = c.when;
    if (!w) return '';
    if (w.comp) return `${COMPANIONS[w.comp].name}’s own story`;
    if (w.promise) return `You are carrying ${PROMISES[w.promise].name.replace(/^The /, 'the ')}`;
    if (w.flag) {
      const from = r.log.find((l) => CARD[l.id].choices[l.pick].set === w.flag);
      if (from) return `Because of “${telling(from).title}” at ${esc(r.map[from.stop][r.path[from.stop]].name)}`;
    }
    return '';
  }

  private choiceHTML(ch: Choice, k: number, locked: boolean): string {
    const r = this.r;
    const block = locked ? null : blockOf(r, ch);
    const bits: string[] = [];
    if (ch.need) bits.push(`<span class="tag comp">${COMPANIONS[ch.need].icon} ${COMPANIONS[ch.need].name}</span>`);
    let main = '';
    if (ch.odds !== undefined) {
      const p = oddsOf(r, ch);
      const pc = Math.round(p * 100);
      const boosted = ch.boost && p > ch.odds;
      main = `<div class="odds"><span class="dice">🎲 Gamble</span><span><b>${pc}%</b> ${chips(ch.fx, r) || '<span class="fx none">nothing</span>'}</span><span><b>${100 - pc}%</b> ${chips(ch.lose!.fx, r) || '<span class="fx none">nothing</span>'}</span>${
        ch.boost ? `<small>${boosted ? `${COMPANIONS[ch.boost[0]].name} adds ${Math.round(ch.boost[1] * 100)}%` : `+${Math.round(ch.boost[1] * 100)}% with ${COMPANIONS[ch.boost[0]].name}`}</small>` : ''
      }</div>`;
      const dl = emptied(r, ch.lose!.fx), dw = emptied(r, ch.fx);
      if (dw.length) bits.push(`<span class="tag bad">☠ ${pc}%: out of ${RES_INFO[dw[0]].short}</span>`);
      if (dl.length) bits.push(`<span class="tag bad">☠ ${100 - pc}%: out of ${RES_INFO[dl[0]].short}, journey over</span>`);
    } else {
      main = chips(ch.fx, r);
      const dead = emptied(r, ch.fx);
      if (dead.length) bits.push(`<span class="tag bad">☠ Out of ${RES_INFO[dead[0]].short}: the journey ends</span>`);
    }
    if (ch.join) {
      const c = COMPANIONS[ch.join];
      bits.push(`<span class="tag comp">${c.icon} ${c.name} joins (${c.trait.toLowerCase()})</span>`);
      const more = bandFood(r.band.length + 1) - bandFood(r.band.length);
      if (more > 0) bits.push(`<span class="tag warnish">each leg −${more} 🍞 more (${r.band.length + 1} companions)</span>`);
    }
    if (ch.promise) bits.push(`<span class="tag prom">${PROMISES[ch.promise].icon} A promise: +${TUNE.promisePts} at Hollin if kept</span>`);
    if (ch.breaks && r.promises[ch.breaks] === 'carry') bits.push(`<span class="tag bad">${PROMISES[ch.breaks].icon} ${ch.odds !== undefined ? 'If it fails, the promise is broken' : 'Breaks your promise'}</span>`);
    if (ch.set) bits.push(`<span class="tag later">✦ may be remembered</span>`);
    if (!main && !bits.length) main = '<span class="fx none">no change</span>';
    return `<button class="choice" data-choice="${k}" ${block || locked ? 'disabled' : ''}><span class="ct">${esc(ch.t)}</span><span class="cfx">${main}</span>${
      bits.length ? `<span class="cbits">${bits.join('')}</span>` : ''
    }${block ? `<span class="why">${esc(block)}</span>` : ''}</button>`;
  }

  private backFace(h: number, fresh: boolean): string {
    const r = this.r;
    const hc = r.hand[h];
    const c = CARD[hc.id];
    const t = telling(hc);
    const ch = c.choices[hc.pick!];
    const roll =
      hc.won === undefined
        ? ''
        : `<div class="roll ${hc.won ? 'won' : 'lost'}">🎲 ${Math.round((hc.won ? hc.p ?? 0 : 1 - (hc.p ?? 0)) * 100)}% — ${hc.won ? 'it came off' : 'not this time'}</div>`;
    const over = r.phase === 'over' && this.focusH === h;
    return `<div class="big"><div class="face back${fresh ? ' flip' : ''}">
      <div class="art small">${cardArt(c.id, t.art, c.sky, regionOf(r.stop), true)}</div>
      <div class="inner">
        <h2>${esc(t.title)}</h2>
        <p class="picked">“${esc(ch.t)}”</p>
        ${roll}
        <p class="text out">${esc(outcomeText(hc))}</p>
        <div class="got">${chips(hc.got ?? {}) || '<span class="fx none">no change</span>'}</div>
        ${ch.join ? `<p class="small">${COMPANIONS[ch.join].icon} ${COMPANIONS[ch.join].name} joins the band.</p>` : ''}
        ${ch.promise ? `<p class="small">${PROMISES[ch.promise].icon} You promised. Keep it to Hollin for +${TUNE.promisePts}.</p>` : ''}
        ${ch.breaks && r.promises[ch.breaks] === 'broken' ? `<p class="small bad">${PROMISES[ch.breaks].icon} The promise is broken.</p>` : ''}
        <button class="primary" data-next="1">${over ? 'The journey ends…' : 'Continue'}</button>
      </div></div></div>`;
  }

  private choose(k: number): void {
    const r = this.r;
    const h = this.focusH;
    if (h < 0 || r.phase !== 'cards') return;
    const prev = { ...r.res };
    const a = `P${h}.${k}`;
    if (!act(r, a)) {
      toast('Not possible right now');
      return;
    }
    this.save();
    this.learn();
    try {
      navigator.vibrate?.(12);
    } catch {
      // no vibration
    }
    $('focus').innerHTML = this.backFace(h, true);
    this.renderRes(prev);
    this.renderWhere();
    this.renderHand();
    this.renderDock();
  }

  private afterOutcome(): void {
    this.closeFocus();
    if (this.r.phase === 'over') setTimeout(() => this.showEnd(), 250);
  }

  private closeFocus(now = false): void {
    const f = $('focus');
    this.focusH = -1;
    f.classList.remove('open');
    if (now) {
      f.hidden = true;
      f.innerHTML = '';
      return;
    }
    setTimeout(() => {
      if (this.focusH < 0) {
        f.hidden = true;
        f.innerHTML = '';
      }
    }, 200);
  }

  // ---------------------------------------------------------------- the road

  private walk(k: number): void {
    const r = this.r;
    if (r.phase !== 'road') return;
    this.walking = true;
    $('hand').classList.add('leaving');
    const prev = { ...r.res };
    setTimeout(() => {
      act(r, `M${k}`);
      this.save();
      this.learn();
      $('hand').classList.remove('leaving');
      this.walking = false;
      this.renderRes(prev);
      this.renderMap();
      this.renderWhere();
      this.renderHand(true);
      this.renderDock();
      const leg = r.legs[r.stop];
      if (r.phase === 'over') setTimeout(() => this.showEnd(), 500);
      else if (Object.keys(leg).length) toast(`The road: ${RES.filter((x) => leg[x]).map((x) => `${leg[x]! > 0 ? '+' : '−'}${Math.abs(leg[x]!)} ${RES_INFO[x].icon}`).join(' ')}`);
    }, 320);
  }

  // ---------------------------------------------------------------- journal and the end

  /** Adds what this run has shown to the journal. */
  private learn(): void {
    const r = this.r;
    const p = loadProfile();
    let changed = false;
    for (const l of r.log) if (!p.cards.includes(l.id)) (p.cards.push(l.id), (changed = true));
    for (const c of r.met) if (!p.comps.includes(c)) (p.comps.push(c), (changed = true));
    if (changed) store.save('profile', p);
  }

  private recorded = '';
  showEnd(): void {
    const r = this.r;
    const e = r.end!;
    const end = ENDING[e.ending];
    const arrivedHome = end.kind === 'arrive';
    const key = `${r.seed}:${r.actions.join(',')}`;
    let newEnding = false;
    if (this.recorded !== key && store.load('lastRecorded', '') !== key) {
      this.recorded = key;
      store.save('lastRecorded', key);
      const p = loadProfile();
      p.runs++;
      if (arrivedHome) {
        p.arrivals++;
        p.best = Math.max(p.best, e.score);
        p.bestStars = Math.max(p.bestStars, e.stars);
      }
      if (!p.endings.includes(e.ending)) {
        p.endings.push(e.ending);
        newEnding = true;
      }
      store.save('profile', p);
      if (this.daily) recordDaily(store, arrivedHome ? 100 + e.score : r.stop, arrivedHome ? `${stars(e.stars)} ${e.score}` : `stop ${r.stop}`, this.daily);
    }
    const p = loadProfile();
    const daily = this.daily ? loadDaily(store) : null;
    const res = RES.map((k) => `<span class="pillsm">${RES_INFO[k].icon} ${r.res[k]}</span>`).join('');
    let body = '';
    if (arrivedHome) {
      const kept = e.kept.map((pr) => `<p class="kept">${PROMISES[pr].icon} <b>${PROMISES[pr].name}</b>: ${PROMISES[pr].kept}</p>`).join('');
      const nextStar = STARS.find((s) => s > e.score);
      body = `<p class="starline">${stars(e.stars)}</p>
        <table class="score">
          <tr><td>Food, oil, health, trust</td><td>${r.res.f + r.res.o + r.res.h + r.res.t}</td></tr>
          <tr><td>Coin ${r.res.c} ÷ 2</td><td>${Math.floor(r.res.c / 2)}</td></tr>
          <tr><td>${plural(r.band.length, 'companion')} × ${TUNE.compPts}</td><td>${TUNE.compPts * r.band.length}</td></tr>
          <tr><td>${plural(e.kept.length, 'promise')} kept × ${TUNE.promisePts}</td><td>${TUNE.promisePts * e.kept.length}</td></tr>
          <tr class="sum"><td>Score</td><td>${e.score}</td></tr></table>
        <p class="meta2">Stars at ${STARS[1]} and ${STARS[2]}${nextStar ? ` · ${nextStar - e.score} more for the next` : ''}</p>${kept}
        ${r.band.length ? `<p class="meta2">With you: ${r.band.map((b) => `${COMPANIONS[b.id].icon} ${COMPANIONS[b.id].name}`).join(', ')}</p>` : ''}`;
    } else {
      body = `<p class="meta2">Out of ${RES_INFO[e.cause!].short} at ${esc(nodeOf(r).name)}, stop ${r.stop} of ${LAST - 1}.</p>`;
    }
    const recap = r.log
      .map((l) => `<li><span>${l.stop}</span> ${esc(telling(l).title)}: <i>${esc(CARD[l.id].choices[l.pick].t)}</i>${l.won === undefined ? '' : l.won ? ' 🎲✓' : ' 🎲✗'}</li>`)
      .join('');
    showCard(
      `<div class="ending ${end.kind}"><div class="eicon">${end.icon}</div><h2>${end.title}${newEnding ? '<span class="new">New ending</span>' : ''}</h2>
       <p class="etext">${end.text}</p><div class="endres">${res}</div>${body}
       <details class="recap"><summary>The journey, card by card</summary><ol>${recap}</ol></details>
       ${daily ? `<p class="meta2">Today’s best: ${daily.label} · ${plural(daily.plays, 'try', 'tries')}</p>` : `<p class="meta2">Journal: ${p.endings.length}/${ENDINGS.length} endings · ${p.cards.length}/${CARDS.length} events · ${p.arrivals}/${p.runs} reached Hollin</p>`}</div>`,
      [
        { label: 'A new journey', primary: true, onClick: () => this.newGame() },
        { label: this.daily ? 'The daily again' : 'Same road again', onClick: () => this.start(this.r.seed, [], this.daily) },
        { label: 'Journal', onClick: () => this.showJournal(() => this.showEnd()) },
        { label: 'All games', onClick: () => (location.href = '../') },
      ],
      false,
    );
  }

  private back(): void {
    if (this.r.phase === 'over') this.showEnd();
    else closeOverlay();
  }

  showJournal(back = () => this.back()): void {
    const p = loadProfile();
    const ends = ENDINGS.map((e) =>
      p.endings.includes(e.id)
        ? `<div class="jend ${e.kind}"><span class="ji">${e.icon}</span><div><b>${e.title}</b><small>${e.text}</small></div></div>`
        : `<div class="jend unknown"><span class="ji">?</span><div><b>???</b><small>${e.kind === 'arrive' ? 'A way to reach Hollin.' : 'A way for the journey to end.'}</small></div></div>`,
    ).join('');
    const comps = COMP_IDS.map((id) => {
      const c = COMPANIONS[id];
      return p.comps.includes(id)
        ? `<div class="jcomp"><span class="ji">${c.icon}</span><div><b>${c.name}</b> · ${c.trait}<small>${c.blurb}</small></div></div>`
        : `<div class="jcomp unknown"><span class="ji">?</span><div><b>Someone on the road</b><small>Not met yet.</small></div></div>`;
    }).join('');
    const regions = [0, 1, 2, 3].map((g) => {
      const label = ['The Lowlands', 'The Greyback Hills', 'The Teeth', 'Anywhere, and callbacks'][g];
      const list = CARDS.filter((c) => (g === 3 ? c.cb || (c.at[0] <= 3 && c.at[1] >= 8) : !c.cb && !(c.at[0] <= 3 && c.at[1] >= 8) && regionOf(c.at[0]) === g));
      const seen = list.filter((c) => p.cards.includes(c.id));
      return `<h3>${label} <small>${seen.length}/${list.length}</small></h3><div class="jcards">${list
        .map((c) => (p.cards.includes(c.id) ? `<span class="jc">${c.art.match(/\p{Extended_Pictographic}/u)?.[0] ?? '·'} ${esc(c.title)}</span>` : `<span class="jc unknown">· · ·</span>`))
        .join('')}</div>`;
    }).join('');
    showCard(
      `<h2>Journal<span class="sub">${p.arrivals}/${p.runs} journeys reached Hollin${p.best ? ` · best ${stars(p.bestStars)} ${p.best}` : ''}</span></h2>
       <h3>Endings <small>${p.endings.length}/${ENDINGS.length}</small></h3><div class="jlist">${ends}</div>
       <h3>Companions <small>${p.comps.length}/${COMP_IDS.length}</small></h3><div class="jlist">${comps}</div>
       <h3>Events <small>${p.cards.length}/${CARDS.length}</small></h3><p class="small">Every card you have faced. Some only appear if you made a certain choice earlier, or travel with a certain companion.</p>${regions}`,
      [{ label: 'Back', primary: true, onClick: back }],
    );
  }

  showRoute(): void {
    const r = this.r;
    const rows = r.map
      .map((col, row) => {
        if (row === 0) return '';
        const now = row === r.stop;
        const past = row < r.stop;
        const cells = col
          .map((n, k) => {
            const taken = row <= r.stop && r.path[row] === k;
            const icon = row === LAST ? '🏡' : KIND_INFO[n.kind].icon;
            return `<div class="rcell${taken ? ' taken' : ''}${past && !taken ? ' gone' : ''}">${icon} ${esc(n.name)}<small>${row === LAST ? 'free' : legChips(legCost(r, k, row)).replace(/<[^>]+>/g, ' ')}</small></div>`;
          })
          .join('');
        return `<div class="rrow${now ? ' now' : ''}"><span class="rno">${row === LAST ? '🏁' : row}</span>${cells}</div>`;
      })
      .join('');
    const kinds = (Object.keys(KIND_INFO) as (keyof typeof KIND_INFO)[])
      .map((k) => `<li>${KIND_INFO[k].icon} <b>${KIND_INFO[k].word}</b>: ${KIND_INFO[k].note}</li>`)
      .join('');
    showCard(
      `<h2>The road to Hollin<span class="sub">Leg costs as they stand now (companions change the food)</span></h2>
       <div class="route">${rows}</div>
       <p class="small">Every leg costs food: ${TUNE.legFood} in the lowlands, ${TUNE.legFoodHills} in the hills and the Teeth, +${TUNE.bandFood} for each pair of companions. Most places cost 1 🪔 to reach (the heights 2; villages, inns and rivers none). The heights and rivers also cost ❤️, the forest 🤝.</p>
       <ul class="kinds">${kinds}</ul>`,
      [{ label: 'Back', primary: true, onClick: () => this.back() }],
    );
  }

  private showComp(id: CompId): void {
    const r = this.r;
    const c = COMPANIONS[id];
    const opens = CARDS.filter((x) => x.choices.some((ch) => ch.need === id)).length;
    const b = r.band.find((x) => x.id === id);
    showCard(
      `<h2>${c.icon} ${c.name}<span class="sub">${c.trait}${b ? ` · with you since stop ${b.at}` : ''}</span></h2>
       <p>${c.blurb}</p>
       <p>Opens a special choice on ${opens} kinds of event, and has a story of their own a couple of stops after joining.</p>
       <p class="small">The band eats: every pair of companions costs +${TUNE.bandFood} 🍞 a leg. Each companion who reaches Hollin adds ${TUNE.compPts} to the score.</p>`,
      [{ label: 'Back', primary: true, onClick: () => this.back() }],
    );
  }

  private showPromise(p: string): void {
    showCard(
      `<h2>${PROMISES[p].icon} ${PROMISES[p].name}</h2><p>A promise you carry to Hollin. Kept, it adds ${TUNE.promisePts} to the score, and something good happens there.</p><p class="small">The road may test it.</p>`,
      [{ label: 'Back', primary: true, onClick: () => this.back() }],
    );
  }

  private showDog(): void {
    showCard(`<h2>🐕 The dog</h2><p>It followed the mule, you fed it, and now it’s yours. It has a nose for things buried in the snow.</p>`, [
      { label: 'Back', primary: true, onClick: () => this.back() },
    ]);
  }

  private showRes(k: Res): void {
    const lines: Record<Res, string> = {
      f: `Every leg eats ${TUNE.legFood} in the lowlands and ${TUNE.legFoodHills} beyond, plus ${TUNE.bandFood} for each pair of companions. At 0 the journey ends.`,
      o: 'Lamps for the dark legs: roads, forests, shrines and huts cost 1 to reach, the heights 2; villages, inns and rivers none. At 0 the journey ends.',
      c: 'Buys food, oil, beds and favours. It can run out without ending the journey; you just can’t pay. Half of it counts at Hollin.',
      h: 'Hurts, cold and tired feet. Rivers and the heights cost 1 to reach. At 0 the journey ends.',
      t: 'How much the band believes in you. Dark forests cost 1 to cross. At 0 they turn back, and the journey ends.',
    };
    showCard(`<h2>${RES_INFO[k].icon} ${RES_INFO[k].name}: ${this.r.res[k]}<span class="sub">at most ${MAX[k]()}</span></h2><p>${lines[k]}</p>`, [
      { label: 'Back', primary: true, onClick: () => this.back() },
    ]);
  }

  showHelp(): void {
    store.save('seenHelp', true);
    showCard(
      `<h2>Tidings<span class="sub">The winter post to Hollin</span></h2>
       <p>Snow is coming to the Teeth. Lead the post carriers and their mule from Tarrow Bridge to Hollin, eleven stops away, before the pass closes.</p>
       <ul>
         <li>At each stop you are dealt <b>three event cards</b>. <b>Face two</b> of them; the third passes by. A <b>⚑</b> card can’t be passed by.</li>
         <li>Every choice shows exactly what it costs and gives: 🍞 food, 🪔 oil, 🪙 coin, ❤️ health, 🤝 trust. A <b>🎲 gamble</b> shows its odds and both outcomes.</li>
         <li>Then pick the road. Each leg costs food, and some cost oil, health or trust; the strip at the top shows the whole route.</li>
         <li>If food, oil, health or trust hits <b>0</b>, the journey ends. Coin can run out safely.</li>
         <li><b>Companions</b> open special choices, but every pair of them eats an extra 🍞 each leg. Some choices are <b>remembered</b> (✦): a stranger you helped may turn up again.</li>
         <li>Reach Hollin for a score: what you have left, ½ your coin, ${TUNE.compPts} per companion and ${TUNE.promisePts} per <b>promise</b> kept. Stars at ${STARS[1]} and ${STARS[2]}.</li>
         <li>The <b>📖 journal</b> keeps every event, companion and ending you’ve found.</li>
       </ul>`,
      [{ label: 'Set out', primary: true, onClick: () => this.back() }],
    );
  }

  showMenu(): void {
    const r = this.r;
    showCard(`<h2>Tidings${this.daily ? ' · daily' : ''}<span class="sub">${r.stop >= LAST ? 'Hollin' : `Stop ${r.stop} of ${LAST - 1}`} · ${esc(nodeOf(r).name)}</span></h2>`, [
      { label: 'Resume', primary: true, onClick: () => this.back() },
      { label: 'Journal', onClick: () => this.showJournal(() => this.showMenu()) },
      { label: 'The road to Hollin', onClick: () => this.showRoute() },
      { label: 'How to play', onClick: () => this.showHelp() },
      {
        label: 'A new journey',
        onClick: () =>
          showCard('<h2>Set out again?</h2><p>This journey will be lost (the journal keeps what you found).</p>', [
            { label: 'Keep going', primary: true, onClick: () => this.back() },
            { label: 'A new journey', onClick: () => this.newGame() },
          ]),
      },
      { label: 'Copy bug report', onClick: () => this.copyReport() },
      { label: 'All games', onClick: () => (location.href = '../') },
    ]);
  }

  private async copyReport(): Promise<void> {
    toast((await copyText(`TIDINGS v${RULES_VERSION} seed=${this.r.seed} a=${this.r.actions.join(',')}`)) ? 'Bug report copied' : 'Copy failed');
  }
}

