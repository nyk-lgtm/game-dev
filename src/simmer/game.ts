// Simmer controller: the morning planner (forecast, menu and prices, pantry and
// market, recipes and upgrades) as DOM, the evening on a canvas with a log of
// every guest, the night's ledger, the season's end, saves and the daily.

import { closeOverlay, showCard } from '../shared/cards';
import { dailySeed, leaveDaily, loadDaily, recordDaily, todayKey } from '../shared/daily';
import { copyText, toast } from '../shared/debug';
import { randomSeed } from '../shared/rng';
import { reducedFx } from '../shared/settings';
import { makeStore } from '../shared/storage';
import {
  DISHES,
  INGS,
  MAX_PRICE,
  OPEN_MINUTES,
  REP_MAX,
  RULES_VERSION,
  SPECIES,
  STARS,
  TAG_WORD,
  TUNE,
  UPGRADES,
  UP,
  WEATHER,
  act,
  actError,
  ctxOf,
  delights,
  demand,
  expiring,
  forecast,
  marketPrice,
  menuSize,
  onHand,
  openAction,
  patienceOf,
  purseRange,
  speciesWeights,
  replay,
  scoreOf,
  starsOf,
  stovesOf,
  upCost,
  worthOf,
  QUEUE_WARN,
  helperPayback,
  wageOf,
  learnCost,
  askPrice,
  fillNeed as fillNeedOf,
  allocateStock,
  isRequest,
  dishCost,
  fillNeed,
  recipePreview,
  upgradePayback,
  type Ledger,
  type MenuItem,
  type NightCtx,
  type Run,
  type Visit,
  type Why,
} from './core';
import { Scene, spriteURL } from './scene';
import { Sounds } from './audio';

export const store = makeStore('simmer.');
const $ = (id: string) => document.getElementById(id)!;

interface Profile {
  seasons: number;
  best: number;
  bestStars: number;
}
const loadProfile = () => store.load<Profile>('profile', { seasons: 0, best: 0, bestStars: 0 });

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const plural = (n: number, w: string, ws = `${w}s`) => `${n} ${n === 1 ? w : ws}`;
const clockOf = (min: number) => {
  const m = Math.max(0, Math.min(OPEN_MINUTES + 30, Math.round(min)));
  return `${18 + Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};
const sprite = (sp: number, size = 28) => `<img class="sprite" src="${spriteURL(sp, 40)}" width="${size}" height="${size}" alt="${SPECIES[sp].name}">`;
const tagsOf = (d: number) => DISHES[d].tags.map((t) => TAG_WORD[t]).join(' · ');
const usesOf = (d: number) => `<span class="nw">${DISHES[d].uses.map((u) => INGS[u].icon).join('')}</span>`;
/** "2" or "1–3": a likely range of guests. */
const spanOf = ([a, b]: number[]) => (a === b ? `${a}` : `${a}–${b}`);
/** A likely range for a count expected to average n (most nights fall inside). */
const likely = (n: number): number[] => [Math.max(0, Math.round(n - 1.5 * Math.sqrt(n))), Math.round(n + 1.5 * Math.sqrt(n))];
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);

const WHY_TEXT: Record<Why, string> = {
  pricey: 'too pricey for their purse',
  worth: 'not worth the price to them',
  soldout: 'what they wanted was sold out',
  nolike: 'nothing on the menu they fancy',
  slow: 'waited too long and gave up',
  closed: 'still queueing at closing time',
};
const WHY_SHORT: Record<Why, string> = { pricey: 'too pricey', worth: 'not worth it', soldout: 'sold out', nolike: 'nothing they like', slow: 'waited too long', closed: 'closing time' };
const WHY_ICON: Record<Why, string> = { pricey: '💸', worth: '🤨', soldout: '❌', nolike: '😕', slow: '⌛', closed: '🌙' };

function weatherNote(ctx: NightCtx): string {
  const wx = WEATHER[ctx.weather];
  const bits = Object.entries(wx.tags).map(([t, x]) => `${TAG_WORD[t as keyof typeof TAG_WORD]} dishes ×${x}`);
  if (wx.crowd !== 1) bits.push(`${wx.crowd < 1 ? 'fewer' : 'more'} passers-by (×${wx.crowd})`);
  if (ctx.festival) bits.push(`festival: crowd ×${TUNE.festival}, purses ×${TUNE.festPurse}, sweets ×${TUNE.festSweet}`);
  if (ctx.payday) bits.push(`payday: purses ×${TUNE.payday}`);
  if (ctx.rival) bits.push(`rival stall: passers-by ×${TUNE.rivalCrowd}, every dish worth ×${TUNE.rivalWorth} (they compare)`);
  return bits.join(' · ') || 'nothing special';
}

interface Draft {
  buys: number[];
  menu: MenuItem[];
  helper: boolean;
  /** The pantry was filled by "Fill to forecast" and is shown folded. */
  filled?: boolean;
  /** The last fill ran out of coins before buying everything. */
  fillShort?: boolean;
}

export class Game {
  r!: Run;
  daily: string | null = null;
  private draft: Draft = { buys: [], menu: [], helper: false };
  private mode: 'morning' | 'evening' = 'morning';
  private scene: Scene;
  private sfx = new Sounds();
  private tally = { coins: 0, served: 0, left: 0 };
  private speeds = [8, 24];
  private speedIx = 0;
  private clockText = '';
  private savedT = 0;
  private muted = false;
  /** The evening has finished playing (the ledger is up or was closed). */
  private nightOver = false;

  constructor() {
    this.scene = new Scene($('scene') as HTMLCanvasElement, {
      onVisit: (v) => this.onVisit(v),
      onOrder: () => {},
      onDone: () => this.nightDone(),
      onTap: (v) => this.explain(v, this.lastLedger()!),
      onFrame: (t) => {
        // Remember roughly where the evening is, so a reload can pick it up there.
        if (t - this.savedT >= 15) {
          this.savedT = t;
          if (!this.nightOver) store.save('evening', { seed: this.r.seed, n: this.r.actions.length, t });
        }
        const c = t < 0 ? 'Opening…' : clockOf(Math.min(t, OPEN_MINUTES));
        if (this.clockText !== c) $('clock').textContent = this.clockText = c;
      },
    });
    this.scene.reduced = reducedFx();
    this.speedIx = store.load('speed', 0) ? 1 : 0;
    $('openBtn').onclick = () => this.tryOpen();
    $('skipBtn').onclick = () => this.scene.skip();
    $('ledgerBtn').onclick = () => this.showLedger();
    $('nextBtn').onclick = () => this.toMorning();
    $('speedBtn').onclick = () => {
      this.speedIx = 1 - this.speedIx;
      store.save('speed', this.speedIx);
      this.scene.speed = this.speeds[this.speedIx];
      this.renderSpeed();
    };
    $('bookBtn').onclick = () => this.showBook();
    $('morning').addEventListener('click', (e) => this.morningClick(e));
    $('log').addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-g]');
      const n = this.r.night;
      if (!el || !n) return;
      const v = n.visits.find((x) => x.g.id === Number(el.dataset.g));
      if (v) this.explain(v, this.lastLedger()!);
    });
    document.addEventListener('pointerdown', () => this.sfx.unlock(), { capture: true });
    window.addEventListener('resize', () => this.mode === 'evening' && this.scene.resize());
  }

  // ---------------------------------------------------------------- runs

  start(seed: number, actions: string[] = [], daily: string | null = null): void {
    closeOverlay();
    this.scene.stop();
    this.daily = daily;
    this.r = replay(seed, actions);
    $('dailyTag').hidden = !daily;
    this.save();
    this.loadDraft();
    // A reload while the stall was open plays that evening again (its ledger follows).
    const pend = store.load<{ seed: number; n: number; t?: number; done?: boolean } | null>('evening', null);
    const last = this.r.actions[this.r.actions.length - 1];
    // A night that had already closed (ledger up) goes on to the next morning or the season's end.
    if (pend?.done && pend.seed === this.r.seed && pend.n === this.r.actions.length) store.save('evening', null);
    else if (pend && pend.seed === this.r.seed && pend.n === this.r.actions.length && last?.[0] === 'o' && this.r.night) return this.playEvening(pend.t ?? 0);
    this.setMode('morning');
    if (this.r.over) this.showEnd();
  }

  newGame(): void {
    leaveDaily();
    this.start(randomSeed());
  }

  playDaily(): void {
    const day = todayKey();
    const saved = store.load<{ v: number; seed: number; a: string; day: string } | null>('dailyRun', null);
    const seed = dailySeed('simmer', day);
    if (saved && saved.v === RULES_VERSION && saved.day === day && saved.seed === seed) this.start(seed, saved.a ? saved.a.split(',') : [], day);
    else this.start(seed, [], day);
  }

  private save(): void {
    const data = { v: RULES_VERSION, seed: this.r.seed, a: this.r.actions.join(',') };
    if (this.daily) store.save('dailyRun', { ...data, day: this.daily });
    else store.save('run', data);
  }

  private saveDraft(): void {
    store.save('draft', { seed: this.r.seed, n: this.r.actions.length, d: this.draft });
  }

  /** The morning's plan: kept across reloads; a new morning starts from last night's menu. */
  private loadDraft(): void {
    const r = this.r;
    const saved = store.load<{ seed: number; n: number; d: Draft } | null>('draft', null);
    if (saved && saved.seed === r.seed && saved.n === r.actions.length && saved.d?.menu) {
      this.draft = saved.d;
      this.fixDraft();
      return;
    }
    this.draft = { buys: INGS.map(() => 0), menu: r.lastMenu.map((m) => ({ ...m })), helper: false };
    // A dish priced down for last night's request goes back to its listed price.
    const lastReq = r.ledgers[r.ledgers.length - 1]?.ctx.req;
    for (const m of this.draft.menu) if (lastReq && m.dish === lastReq.dish) m.price = DISHES[m.dish].base;
    this.fixDraft();
  }

  private fixDraft(): void {
    const r = this.r;
    const d = this.draft;
    d.buys = INGS.map((_, i) => Math.max(0, Math.min(99, Math.floor(d.buys[i] ?? 0))));
    d.menu = d.menu.filter((m, i, a) => r.known[m.dish] && a.findIndex((x) => x.dish === m.dish) === i).slice(0, menuSize(r));
    for (const m of d.menu) m.price = Math.max(1, Math.min(MAX_PRICE, Math.round(m.price)));
    if (d.helper && this.spend() + wageOf(r) > r.coins) d.helper = false;
    while (this.spend() > r.coins) {
      const i = d.buys.findIndex((b) => b > 0);
      if (i < 0) break;
      d.buys[i]--;
    }
  }

  /** Coins the draft's purchases cost. */
  private spend(): number {
    return this.draft.buys.reduce((a, n, u) => a + n * marketPrice(this.r.seed, this.r.day, u).price, 0) + (this.draft.helper ? wageOf(this.r) : 0);
  }

  private lastLedger(): Ledger | undefined {
    return this.r.ledgers[this.r.ledgers.length - 1];
  }

  private setMode(m: 'morning' | 'evening'): void {
    this.mode = m;
    $('morning').hidden = m !== 'morning';
    $('evening').hidden = m !== 'evening';
    $('dockMorning').hidden = m !== 'morning';
    $('dockEvening').hidden = m !== 'evening';
    if (m === 'morning') this.renderMorning();
    this.renderHud();
  }

  private renderHud(): void {
    const r = this.r;
    const l = this.lastLedger();
    $('dayNo').textContent = `${this.mode === 'evening' && l ? l.day + 1 : Math.min(r.day + 1, TUNE.days)}/${TUNE.days}`;
    $('coins').textContent = fmt(this.mode === 'evening' ? this.tally.coins : r.coins);
    const rv = this.mode === 'evening' && l && !this.nightOver ? l.repAfter - l.rep : r.rep;
    $('rep').innerHTML = `♥ ${rv}${rv >= REP_MAX ? '<small class="full">full</small>' : ''}`;
  }

  // ---------------------------------------------------------------- morning

  private renderMorning(): void {
    const r = this.r;
    $('dockMorning').hidden = r.over;
    if (r.over) {
      $('morning').innerHTML = `<section class="panel"><h3>The season is over</h3><p class="note">Score ${fmt(scoreOf(r))} ${stars(starsOf(scoreOf(r)))}</p><button class="add" data-end="1">See the season</button></section>`;
      return;
    }
    const d = this.draft;
    const f = forecast(r);
    const stoves = stovesOf(r, d.helper);
    const dem = demand(r, d.menu, f, stoves);
    const have = onHand(r);
    const exp = expiring(r);
    const after = have.map((h, u) => h + d.buys[u]);
    const need = INGS.map(() => 0);
    d.menu.forEach((m, i) => DISHES[m.dish].uses.forEach((u) => (need[u] += dem.orders[i])));
    const ctx = f.ctx;
    const wx = WEATHER[ctx.weather];
    const next = [1, 2, 3]
      .filter((k) => r.day + k < TUNE.days)
      .map((k) => {
        const c = ctxOf(r, r.day + k);
        return `<span class="nx"><small>N${r.day + k + 1}</small>${WEATHER[c.weather].icon}${c.festival ? '🏮' : ''}${c.payday ? '💰' : ''}${c.rival ? '⚔️' : ''}</span>`;
      })
      .join('');
    const kinds = f.mix
      .map((n, sp) => ({ n, sp }))
      .filter((k) => k.n > 0.05)
      .sort((a, b) => b.n - a.n)
      .map((k) => `<button class="kind" data-sp="${k.sp}">${sprite(k.sp, 30)}<span>~${k.n < 1 ? '<1' : Math.round(k.n)}</span></button>`)
      .join('');
    const gift = r.giftFor === r.day ? `<p class="note">Nearly broke: a neighbour topped you up to ${TUNE.safety}¢ to get going again.</p>` : '';
    const tonight = `<section class="panel tonight">
      <div class="wx"><span class="wxi">${wx.icon}</span><div><b>${wx.name} night</b>${ctx.festival ? ' <span class="badge fest">🏮 Lantern festival</span>' : ''}${ctx.payday ? ' <span class="badge pay">💰 Payday</span>' : ''}${ctx.rival ? ' <span class="badge rival">⚔️ Rival stall</span>' : ''}
        <small>${weatherNote(ctx)}</small></div></div>
      <div class="next">${next ? `Coming up ${next}` : '<b>Last night of the season!</b>'}</div>
      <button class="crowd" data-crowd="1">Expect <b>~${Math.round(f.street + f.friends)}</b> guests <small>(${f.lo + f.friends}–${f.hi + f.friends}${f.friends ? `, ${plural(f.friends, 'friend')} of last night’s delighted guests` : ''}) ⓘ</small></button>
      <div class="kinds">${kinds}</div>${gift}${this.requestHtml()}
    </section>`;

    // Menu.
    const size = menuSize(r);
    const covered = allocateStock(d.menu, dem.orders, after);
    const rows = d.menu
      .map((m, i) => {
        const dish = DISHES[m.dish];
        const who = dem.kinds
          .filter((k) => k.share[i] * k.n >= 0.3)
          .sort((a, b) => b.share[i] * b.n - a.share[i] * a.n)
          .map((k) => sprite(k.sp, 20))
          .join('');
        const can = covered[i];
        const cost = dish.uses.reduce((a, u) => a + marketPrice(r.seed, r.day, u).price, 0);
        const exp = dem.orders[i];
        const short = can < Math.round(exp);
        const asked = ctx.req && ctx.req.dish === m.dish ? ` <b class="love">asked for by ${SPECIES[ctx.req.sp].plural.toLowerCase()}</b>` : '';
        return `<div class="dish">
          <button class="dname" data-swap="${i}"><span class="di">${dish.icon}</span><span><b>${dish.name}</b><small>${tagsOf(m.dish)} · ${usesOf(m.dish)}</small></span></button>
          <div class="price"><button data-price="${i}" data-dp="-1" aria-label="Cheaper">−</button><span>${m.price}¢</span><button data-price="${i}" data-dp="1" aria-label="Dearer">+</button></div>
          <div class="dinfo"><span class="${short ? 'warn' : ''}">${exp > 0 && exp < 0.5 ? '<1 order' : `~${plural(Math.round(exp), 'order')}`} · ${short ? `stock covers ~${can}` : 'stock covers them'}</span>${asked}<span class="who">${who || '<small>no takers at this price</small>'}</span>${
            m.price < cost ? `<b class="bad">below cost (${cost}¢): a loss on every one</b>` : `<small>costs ${cost}¢ · listed ${dish.base}¢</small>`
          }</div>
        </div>`;
      })
      .join('');
    const canAdd = d.menu.length < size && r.known.some((k, i) => k && !d.menu.some((m) => m.dish === i));
    const q = d.menu.length ? helperPayback(r, d.menu) : null;
    const queued = q ? (d.helper ? q.after : q.before) : 0;
    const range = q ? (d.helper ? q.rangeAfter : q.range) : [0, 0];
    const qNote = !q
      ? ''
      : range[1] === 0
        ? `The queue keeps moving: in sample evenings nobody gives up${d.helper ? ' with your helper' : ''}.`
        : `Queue: in sample evenings ${spanOf(range)} guests give up or are still waiting at closing${d.helper ? ' even with your helper' : ''}.${
            !d.helper && q.saved >= 0.5 ? ` A helper (${q.wage}¢) would make it ${spanOf(q.rangeAfter)} (worth ~${Math.round(q.value)}¢).` : ''
          }`;
    const full = d.menu.reduce((a, m, i) => a + dem.orders[i] * m.price, 0);
    const stocked = d.menu.reduce((a, m, i) => a + Math.min(dem.orders[i], covered[i]) * m.price, 0);
    const takings = stocked + (dem.revenue - full) * (full > 0 ? stocked / full : 1);
    const menu = `<section class="panel"><h3>Tonight’s menu <small>${d.menu.length}/${size} dishes · tap a dish to swap it</small></h3>${rows}
      ${canAdd ? '<button class="add" data-add="1">＋ Add a dish</button>' : ''}
      <p class="note ${queued >= QUEUE_WARN ? 'warn' : ''}">${qNote} Expected takings ~${Math.round(takings)}¢${takings + 1 < dem.revenue ? ` with this stock (~${Math.round(dem.revenue)}¢ if every order could be cooked)` : ''}.</p></section>`;

    // Pantry and market.
    const pantry = INGS.map((g, u) => {
      const mp = marketPrice(r.seed, r.day, u);
      const want = Math.ceil(need[u]);
      const keeps = INGS[u].keeps + (r.ups[UP.cool] ? 1 : 0);
      return `<div class="ing ${want > after[u] ? 'short' : ''}">
        <span class="ii">${g.icon}</span>
        <span class="iname"><b>${g.name}</b><small>have ${have[u]}${exp[u] ? ` <em>(${exp[u]} spoil tonight)</em>` : ''} · need ~${want} · keeps ${plural(keeps, 'night')}</small></span>
        <span class="ip ${mp.mood}">${mp.price}¢${mp.mood !== 'usual' ? `<small>${mp.mood}</small>` : ''}</span>
        <span class="buy"><button data-buy="${u}" data-db="-1" aria-label="Buy fewer">−</button><span>${d.buys[u] ? `+${d.buys[u]}` : '0'}</span><button data-buy="${u}" data-db="1" aria-label="Buy more">+</button></span>
      </div>`;
    }).join('');
    const buying = d.buys.map((n, u) => (n ? `${n}${INGS[u].icon}` : '')).filter(Boolean).join(' ');
    const spoil = exp.some((n) => n > 0);
    const market = d.filled
      ? `<section class="panel"><h3>Pantry &amp; market <button class="mini" data-unfold="1">Change</button></h3>
         <p class="note">Filled to the forecast: buying ${buying ? `<span class="nw">${buying}</span>` : 'nothing (enough on hand)'} for ${
           this.spend() - (d.helper ? wageOf(r) : 0)
         }¢.${d.fillShort ? ' <b class="warn">Short: your coins don’t cover all of it.</b>' : ''}${spoil ? ' <em class="warn">Some stock spoils tonight.</em>' : ''}</p></section>`
      : `<section class="panel"><h3>Pantry &amp; market <button class="mini" data-fill="1">Fill to forecast</button></h3>${pantry}
      <p class="note">Each dish uses one of each ingredient shown with it. Anything left on its last night is thrown out.</p></section>`;

    const learnable = r.known.filter((k) => !k).length;
    const ups = UPGRADES.filter((_, k) => upCost(r, k) !== null).length;
    const shop = `<section class="panel shop">
      <button class="secondary" data-recipes="1">📜 Recipes${learnable ? ` <small>${learnable} to learn</small>` : ''}</button>
      <button class="secondary" data-ups="1">🛠️ Upgrades${ups ? ` <small>${ups} to buy</small>` : ''}</button>
      <label class="helper"><input type="checkbox" data-helper="1" ${d.helper ? 'checked' : ''}> Hire a helper tonight <small>${wageOf(r)}¢ (12¢ + 1¢ per expected guest) · cooks alongside you (${stovesOf(r) + 1} at once)</small></label>
    </section>`;
    $('morning').innerHTML = tonight + menu + market + shop;
    const sp = this.spend();
    $('spend').innerHTML = `Spend <b>${sp}¢</b> · ${fmt(r.coins - sp)}¢ left`;
    this.renderHud();
  }

  private morningClick(e: Event): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('button, input');
    if (!el) return;
    const r = this.r;
    const d = this.draft;
    const ds = el.dataset;
    if (ds.price !== undefined) {
      const m = d.menu[Number(ds.price)];
      m.price = Math.max(1, Math.min(MAX_PRICE, m.price + Number(ds.dp)));
    } else if (ds.buy !== undefined) {
      const u = Number(ds.buy);
      const dn = Number(ds.db);
      const p = marketPrice(r.seed, r.day, u).price;
      if (dn > 0 && this.spend() + p > r.coins) {
        toast('Not enough coins');
        return;
      }
      d.buys[u] = Math.max(0, Math.min(99, d.buys[u] + dn));
    } else if (ds.fill) (this.fill(), (d.filled = true));
    else if (ds.unfold) d.filled = false;
    else if (ds.swap !== undefined) return this.pickDish(Number(ds.swap));
    else if (ds.add) return this.pickDish(-1);
    else if (ds.sp !== undefined) return this.showKind(Number(ds.sp));
    else if (ds.crowd) return this.showCrowd();
    else if (ds.reqLearn) return this.buy(`l${ds.reqLearn}`, () => this.addRequested());
    else if (ds.reqAdd) return this.addRequested();
    else if (ds.end) return this.showEnd();
    else if (ds.recipes) return this.showRecipes();
    else if (ds.ups) return this.showUpgrades();
    else if (ds.helper) {
      if (!d.helper && this.spend() + wageOf(r) > r.coins) {
        (el as HTMLInputElement).checked = false;
        toast('Not enough coins for a helper');
        return;
      }
      d.helper = !d.helper;
    } else return;
    // A folded, filled pantry follows menu, price and helper changes.
    if (d.filled && !ds.fill) this.fill(true);
    this.saveDraft();
    this.renderMorning();
  }

  /** Tonight's request, with a button to learn the dish or put it on the menu. */
  private requestHtml(): string {
    const r = this.r;
    const q = ctxOf(r).req;
    if (!q) return '';
    const dish = DISHES[q.dish];
    const on = this.draft.menu.some((m) => m.dish === q.dish);
    const btn = on
      ? '<span class="ok">✓ on the menu</span>'
      : r.known[q.dish]
        ? '<button class="mini" data-req-add="1">Put it on</button>'
        : `<button class="mini" data-req-learn="${q.dish}" ${learnCost(q.dish) > r.coins ? 'disabled' : ''}>Learn ${learnCost(q.dish)}¢</button>`;
    const f = forecast(r);
    const n = f.mix[q.sp];
    let odds = '';
    const i = this.draft.menu.findIndex((m) => m.dish === q.dish);
    if (i >= 0) {
      const d = demand(r, this.draft.menu, f);
      const k = d.kinds.find((x) => x.sp === q.sp);
      const theirs = k ? k.share[i] * k.n : 0;
      const others = d.orders[i] - theirs;
      odds = ` At ${this.draft.menu[i].price}¢ ~${Math.round(theirs)} of the ~${Math.round(n)} expected order it${others >= 0.5 ? `, and other kinds want ~${Math.round(others)} more: stock for both` : ''}.`;
      if (k && theirs + 0.5 < k.n) odds += ` Their purses: ${purseRange(q.sp, f.ctx).join('–')}¢.`;
    }
    return `<div class="request">${sprite(q.sp, 30)}<span><b>${SPECIES[q.sp].plural} ask for ${dish.icon} ${dish.name}</b><small>${TUNE.reqGuests} more come just for it. They take it whenever they can afford it (worth ×${TUNE.reqWorth} to them); each one served is delighted (unless the wait is long) and tips ${TUNE.reqTip}¢.${odds}</small></span>${btn}</div>`;
  }

  /** Puts the asked-for dish on the menu, in place of the dish with the fewest expected orders if it's full. */
  private addRequested(): void {
    const r = this.r;
    const d = this.draft;
    const q = ctxOf(r).req;
    if (!q || !r.known[q.dish] || d.menu.some((m) => m.dish === q.dish)) return;
    // Priced so most of the asking kind can afford it.
    const item = { dish: q.dish, price: askPrice(ctxOf(r)) };
    if (d.menu.length < menuSize(r)) d.menu.push(item);
    else {
      const dem = demand(r, d.menu);
      let worst = 0;
      d.menu.forEach((_, i) => dem.orders[i] < dem.orders[worst] && (worst = i));
      toast(`${DISHES[d.menu[worst].dish].name} makes room`);
      d.menu[worst] = item;
    }
    if (d.filled) this.fill(true);
    this.saveDraft();
    this.renderMorning();
  }

  /** Buys what tonight's expected orders need, with a little spare, as far as coins go. */
  private fill(quiet = false): void {
    const r = this.r;
    const d = this.draft;
    const need = fillNeed(r, d.menu, stovesOf(r, d.helper));
    const have = onHand(r);
    d.buys = INGS.map(() => 0);
    const want = need.map((n, u) => Math.max(0, n - have[u]));
    let budget = r.coins - (d.helper ? wageOf(r) : 0);
    const total = want.reduce((a, n, u) => a + n * marketPrice(r.seed, r.day, u).price, 0);
    const scale = total > budget ? budget / total : 1;
    want.forEach((n, u) => {
      const p = marketPrice(r.seed, r.day, u).price;
      const k = Math.min(Math.floor(n * scale), Math.floor(budget / p), 99);
      d.buys[u] = k;
      budget -= k * p;
    });
    d.fillShort = scale < 1;
    if (scale < 1 && !quiet) toast('Coins only cover part of it');
  }

  private pickDish(slot: number): void {
    const r = this.r;
    const d = this.draft;
    const opts = DISHES.map((_, i) => i).filter((i) => r.known[i] && !d.menu.some((m) => m.dish === i));
    const items = opts
      .map((i) => `<button class="pick" data-d="${i}"><span class="di">${DISHES[i].icon}</span><span><b>${DISHES[i].name}</b><small>${tagsOf(i)} · ${usesOf(i)} · listed ${DISHES[i].base}¢ · ${DISHES[i].cook} min</small></span></button>`)
      .join('');
    showCard(
      `<h2>${slot < 0 ? 'Add a dish' : `Swap ${DISHES[d.menu[slot].dish].name}`}</h2>${items || '<p>No other recipes known yet: learn some under 📜 Recipes.</p>'}`,
      [
        ...(slot >= 0 && d.menu.length > 1 ? [{ label: 'Take it off the menu', onClick: () => (d.menu.splice(slot, 1), this.saveDraft(), closeOverlay(), this.renderMorning()) }] : []),
        { label: 'Back', primary: true, onClick: () => closeOverlay() },
      ],
    );
    $('overlay').querySelectorAll<HTMLElement>('.pick').forEach((b) => {
      b.onclick = () => {
        const dish = Number(b.dataset.d);
        const item = { dish, price: DISHES[dish].base };
        if (slot < 0) d.menu.push(item);
        else d.menu[slot] = item;
        if (d.filled) this.fill(true);
        this.saveDraft();
        closeOverlay();
        this.renderMorning();
      };
    });
  }

  private showRecipes(): void {
    const r = this.r;
    const d = this.draft;
    const today = this.boughtToday();
    const rows = DISHES.map((x, i) => ({ x, i }))
      .filter(({ i }) => !r.known[i] || today.has(`l${i}`))
      .map(({ x, i }) => {
        const undo = today.has(`l${i}`);
        let pay = '';
        if (!undo) {
          const p = recipePreview(r, i, d.menu);
          const n = Math.round(p.orders);
          pay = `<span class="pay">${p.orders > 0 && p.orders < 0.5 ? '<1 order' : `~${plural(n, 'order')}`} tonight at ${x.base}¢${p.replaces >= 0 ? ` in place of ${DISHES[d.menu[p.replaces].dish].icon}` : ''} · loved by ${p.lovers.map((sp) => sprite(sp, 18)).join('')}</span>`;
        }
        return `<div class="shoprow"><span class="di">${x.icon}</span><span><b>${x.name}</b><small>${tagsOf(i)} · ${usesOf(i)} · listed ${x.base}¢ · ${x.cook} min</small>${pay}</span>${
          undo ? `<button class="secondary small" data-undo="l${i}">Undo +${learnCost(i)}¢</button>` : `<button class="primary small" data-learn="${i}" ${learnCost(i) > r.coins ? 'disabled' : ''}>${learnCost(i)}¢</button>`
        }</div>`;
      })
      .join('');
    showCard(`<h2>Recipes<span class="sub">Learned for good; coins spent count against your score. Changed your mind? Undo this morning’s.</span></h2>${rows || '<p>You know every recipe.</p>'}`, [
      { label: 'Back', primary: true, onClick: () => closeOverlay() },
    ]);
    this.wireShop(() => this.showRecipes());
  }

  /** Recipes and upgrades bought this morning (they can still be taken back). */
  private boughtToday(): Set<string> {
    const a = this.r.actions;
    const out = new Set<string>();
    for (let i = a.length - 1; i >= 0 && a[i][0] !== 'o'; i--) if (a[i][0] === 'l' || a[i][0] === 'u') out.add(a[i]);
    return out;
  }

  private wireShop(again: () => void): void {
    $('overlay').querySelectorAll<HTMLElement>('[data-learn]').forEach((b) => (b.onclick = () => this.buy(`l${b.dataset.learn}`, again)));
    $('overlay').querySelectorAll<HTMLElement>('[data-up]').forEach((b) => (b.onclick = () => this.buy(`u${b.dataset.up}`, again)));
    $('overlay').querySelectorAll<HTMLElement>('[data-undo]').forEach((b) => (b.onclick = () => this.undoBuy(b.dataset.undo!, again)));
  }

  /** Takes back this morning's purchase: the season replays without it. */
  private undoBuy(a: string, again: () => void): void {
    const acts = this.r.actions.slice();
    let i = acts.length - 1;
    while (i >= 0 && acts[i][0] !== 'o' && acts[i] !== a) i--;
    if (i < 0 || acts[i] !== a) return;
    // Upgrades come off top level first.
    if (a[0] === 'u') for (let k = acts.length - 1; k > i; k--) if (acts[k] === a) i = k;
    acts.splice(i, 1);
    this.r = replay(this.r.seed, acts);
    this.sfx.tap();
    this.save();
    this.fixDraft();
    this.saveDraft();
    this.renderMorning();
    again();
  }

  private showUpgrades(): void {
    const r = this.r;
    const today = this.boughtToday();
    const left = TUNE.days - r.day;
    const rows = UPGRADES.map((u, k) => {
      const c = upCost(r, k);
      const lv = r.ups[k];
      const undo = today.has(`u${k}`);
      const p = c !== null ? upgradePayback(r, k, this.draft.menu) : null;
      const pay = p ? `<span class="pay">${p.text}${p.perNight >= 0.5 ? ` · pays back ~${Math.round(p.perNight * left)}¢ over ${plural(left, 'night')}` : ''}</span>` : '';
      const btn = undo
        ? `<button class="secondary small" data-undo="u${k}">Undo +${Math.round(UPGRADES[k].cost[lv - 1] * TUNE.upMul)}¢</button>`
        : c === null
          ? '<span class="owned">✓</span>'
          : `<button class="primary small" data-up="${k}" ${c > r.coins ? 'disabled' : ''}>${c}¢</button>`;
      return `<div class="shoprow"><span class="di">${u.icon}</span><span><b>${u.name}${u.cost.length > 1 ? ` ${lv}/${u.cost.length}` : ''}</b><small>${u.text}</small>${pay}</span>${btn}</div>`;
    }).join('');
    showCard(`<h2>Upgrades<span class="sub">They last the season; ${plural(left, 'night')} left to pay back. Estimates are for tonight’s menu.</span></h2>${rows}`, [
      { label: 'Back', primary: true, onClick: () => closeOverlay() },
    ]);
    this.wireShop(() => this.showUpgrades());
  }

  /** A shop purchase: applied at once (it's an action), the draft's buys trimmed to fit. */
  private buy(a: string, again: () => void, sure = false): void {
    const err = actError(this.r, a);
    if (err) return void toast(err);
    const r = this.r;
    const price = a[0] === 'l' ? learnCost(Number(a.slice(1))) : (upCost(r, Number(a.slice(1))) ?? 0);
    const need = fillNeedOf(r, this.draft.menu);
    const have = onHand(r);
    const stock = need.reduce((t, n, u) => t + Math.max(0, n - have[u]) * marketPrice(r.seed, r.day, u).price, 0);
    if (!sure && r.coins - price < stock) {
      showCard(
        `<h2>Short for tonight?</h2><p>After this you’d have ${fmt(r.coins - price)}¢, but tonight’s ingredients need ~${stock}¢. Guests who find their dish sold out leave let down, and a season that runs out of stock is slow to recover.</p>`,
        [
          { label: 'Keep the coins', primary: true, onClick: () => again() },
          { label: `Buy anyway (${price}¢)`, onClick: () => this.buy(a, again, true) },
        ],
      );
      return;
    }
    act(this.r, a);
    this.sfx.coin();
    this.save();
    this.fixDraft();
    this.saveDraft();
    this.renderMorning();
    again();
  }

  private tryOpen(): void {
    const r = this.r;
    const d = this.draft;
    if (!d.menu.length) return void toast('Put at least one dish on the menu');
    const dem = demand(r, d.menu, forecast(r), stovesOf(r, d.helper));
    const after = onHand(r).map((h, u) => h + d.buys[u]);
    const need = INGS.map(() => 0);
    d.menu.forEach((m, i) => DISHES[m.dish].uses.forEach((u) => (need[u] += dem.orders[i])));
    const short = INGS.map((g, u) => (need[u] > after[u] + 1.5 ? g.icon : '')).join('');
    const q = helperPayback(r, d.menu);
    const queued = d.helper ? q.after : q.before;
    const busy = queued >= QUEUE_WARN || (d.helper ? q.rangeAfter[1] : q.range[1]) >= 2;
    const pays = !d.helper && q.value > q.wage;
    const loss = d.menu.filter((m) => m.price < dishCost(r, m.dish));
    const warn: string[] = [];
    if (short) warn.push(`<p><b>Short on stock:</b> tonight’s expected orders need more ${short} than you’ll have. Guests who find their dish sold out leave let down.</p>`);
    if (busy)
      warn.push(
        `<p><b>A long queue:</b> in sample evenings tonight ${spanOf(d.helper ? q.rangeAfter : q.range)} guests give up waiting or are still queueing at closing${d.helper ? ', even with your helper' : ''}, let down.${
          d.helper
            ? ''
            : ` A helper (${q.wage}¢) would make that ${spanOf(q.rangeAfter)}: ~${Math.round(q.saved)} saved, worth ~${Math.round(q.value)}¢ (their orders and renown)${pays ? '' : ', less than the wage'}.`
        }${q.after >= QUEUE_WARN ? ' One helper isn’t enough tonight; a second stove (🛠️ Upgrades) cooks alongside you every night.' : ''}</p>`,
      );
    if (loss.length) warn.push(`<p><b>Below cost:</b> ${loss.map((m) => `${DISHES[m.dish].icon} ${m.price}¢ costs ${dishCost(r, m.dish)}¢`).join(', ')} to make, so each one sold loses coins.</p>`);
    if (warn.length) {
      const canHire = busy && !d.helper && this.spend() + wageOf(r) <= r.coins;
      // The default is whatever pays: the helper when it saves more than the wage, else open as planned.
      const hire = { label: `Hire a helper (${wageOf(r)}¢) and open`, primary: canHire && pays, onClick: () => ((d.helper = true), this.open()) };
      const go = { label: 'Open anyway', primary: !(canHire && pays) && !short && !loss.length, onClick: () => this.open() };
      const back = { label: 'Back to planning', primary: !hire.primary && !go.primary, onClick: () => closeOverlay() };
      showCard(`<h2>Before you open</h2>${warn.join('')}<p class="small">Let-downs cost renown: half a ♥ each, rounded up, at most ${TUNE.lossCap} a night.</p>`, [
        ...(canHire && pays ? [hire] : []),
        ...(go.primary ? [go] : []),
        ...(canHire && !pays ? [hire] : []),
        back,
        ...(go.primary ? [] : [go]),
      ]);
      return;
    }
    this.open();
  }

  private open(): void {
    closeOverlay();
    const r = this.r;
    const d = this.draft;
    const acts = d.buys.map((n, u) => (n > 0 ? `b${u}.${n}` : '')).filter(Boolean);
    acts.push(openAction(d.menu, d.helper));
    for (const a of acts) {
      if (!act(r, a)) {
        toast(actError(r, a) ?? 'Can’t open');
        this.renderMorning();
        return;
      }
    }
    this.save();
    this.sfx.bell();
    const l = this.lastLedger()!;
    // The next morning starts from tonight's menu.
    this.draft = { buys: INGS.map(() => 0), menu: l.menu.map((m) => ({ ...m })), helper: false };
    if (l.ctx.req) for (const m of this.draft.menu) if (m.dish === l.ctx.req.dish) m.price = DISHES[m.dish].base;
    this.saveDraft();
    this.playEvening();
  }

  /** Plays the last opened night (also after a reload mid-evening). */
  private playEvening(resumeAt = 0): void {
    const r = this.r;
    const l = this.lastLedger()!;
    store.save('evening', { seed: r.seed, n: r.actions.length, t: resumeAt });
    this.savedT = resumeAt;
    this.nightOver = false;
    this.tally = { coins: l.coins - l.revenue - l.tips, served: 0, left: 0 };
    $('log').innerHTML = '';
    this.setMode('evening');
    this.renderEveningDock();
    this.scene.resize();
    this.scene.speed = this.speeds[this.speedIx];
    this.renderSpeed();
    this.renderTally();
    this.scene.play(r.night!, l.ctx, l.menu, stovesOf(r, l.helper));
    if (resumeAt > 0) {
      this.muted = true;
      this.scene.seek(resumeAt);
      this.muted = false;
      if (resumeAt < OPEN_MINUTES) toast(`Back at the stall: ${clockOf(resumeAt)}`);
    }
  }

  private renderEveningDock(): void {
    const over = this.nightOver;
    $('speedBtn').hidden = $('skipBtn').hidden = over;
    $('ledgerBtn').hidden = $('nextBtn').hidden = !over;
    $('nextBtn').textContent = this.r.over ? 'See the season ▶' : `Night ${this.r.day + 1} ▶`;
  }

  /** Leave the evening for the next morning (or the season's end). */
  private toMorning(): void {
    store.save('evening', null);
    closeOverlay();
    this.scene.stop();
    this.nightOver = false;
    if (this.r.over) return this.showEnd();
    this.setMode('morning');
    $('morning').scrollTop = 0;
  }

  // ---------------------------------------------------------------- evening

  private renderSpeed(): void {
    $('speedBtn').textContent = this.speedIx ? '▶▶ Fast' : '▶ Normal';
  }

  private renderTally(): void {
    $('tally').innerHTML = `<span>🍽️ ${this.tally.served}</span><span>🚶 ${this.tally.left}</span>`;
    $('coins').textContent = fmt(this.tally.coins);
  }

  private onVisit(v: Visit): void {
    const l = this.lastLedger()!;
    const sp = SPECIES[v.g.sp];
    let line: string;
    if (v.pick >= 0) {
      this.tally.served++;
      this.tally.coins += v.paid;
      const dishes = [v.pick, v.pick2].filter((i) => i >= 0).map((i) => DISHES[l.menu[i].dish].icon).join(' + ');
      const mood = v.mood === 'delighted' ? '<b class="love">delighted ♥</b>' : v.mood === 'meh' ? 'grumbled at the wait' : 'happy';
      line = `${dishes} for ${v.paid - (v.tip ?? 0)}¢${v.tip ? ` + ${v.tip}¢ tip` : ''} · ${mood}`;
      if (this.muted) void 0;
      else if (v.mood === 'delighted') this.sfx.heart();
      else this.sfx.coin();
    } else {
      this.tally.left++;
      line = `${WHY_ICON[v.why!]} left: ${WHY_SHORT[v.why!]}${v.rep < 0 ? ' <b class="bad">let down</b>' : ''}`;
      if (v.rep < 0 && !this.muted) this.sfx.sad();
    }
    const el = document.createElement('button');
    el.className = 'logline';
    el.dataset.g = String(v.g.id);
    const at = v.pick >= 0 ? v.ready : v.t;
    el.dataset.t = String(at);
    el.innerHTML = `<small>${clockOf(at)}</small>${sprite(v.g.sp, 22)}<span><b>${sp.name}</b>${v.g.friend ? ' <small>(friend)</small>' : ''} ${line}</span><i>?</i>`;
    const log = $('log');
    // Newest first, by the time each guest finished (a walk-off can resolve before an earlier sale shows).
    const later = [...log.children].find((c) => Number((c as HTMLElement).dataset.t) <= at);
    if (later) log.insertBefore(el, later);
    else log.appendChild(el);
    while (log.children.length > 60) log.lastElementChild?.remove();
    this.renderTally();
  }

  private nightDone(): void {
    this.renderTally();
    this.nightOver = true;
    store.save('evening', { seed: this.r.seed, n: this.r.actions.length, done: true });
    this.renderHud();
    $('coins').textContent = fmt(this.lastLedger()!.coins);
    this.renderEveningDock();
    $('clock').textContent = this.clockText = 'Closed';
    setTimeout(() => this.mode === 'evening' && this.showLedger(), 350);
  }

  /** Why a guest did what they did, every number spelled out. */
  private explain(v: Visit, l: Ledger): void {
    const sp = SPECIES[v.g.sp];
    const ctx = l.ctx;
    const [lo, hi] = SPECIES[v.g.sp].purse;
    const pm = [ctx.payday ? `payday ×${TUNE.payday}` : '', ctx.festival ? `festival ×${TUNE.festPurse}` : ''].filter(Boolean).join(', ');
    const n = this.r.night!;
    const rows = l.menu
      .map((m, i) => {
        const w = worthOf(m.dish, v.g.sp, ctx);
        const calc = w.parts.length ? `${DISHES[m.dish].base} × ${w.parts.map((p) => `${p.x} <small>(${p.label})</small>`).join(' × ')} = <b>${w.w}</b>` : `<b>${w.w}</b> <small>(listed)</small>`;
        let verdict: string;
        if (i === v.pick) verdict = '<b class="good">✓ chosen</b>';
        else if (i === v.pick2) verdict = '<b class="good">✓ second helping</b>';
        else if (m.price > w.w) verdict = 'not worth the price';
        else if (m.price > v.g.purse) verdict = 'beyond their purse';
        else if (n.soldOutAt[i] >= 0 && n.soldOutAt[i] <= v.t && v.why !== 'slow' && v.why !== 'closed') verdict = '<b class="bad">sold out</b>';
        else if (v.why === 'slow' || v.why === 'closed') verdict = 'never reached the counter';
        else verdict = `less left over (${w.w - m.price}¢)`;
        return `<tr><td>${DISHES[m.dish].icon}</td><td>${calc}</td><td>${m.price}¢</td><td>${verdict}</td></tr>`;
      })
      .join('');
    let outcome: string;
    if (v.pick >= 0) {
      const m = l.menu[v.pick];
      const w = worthOf(m.dish, v.g.sp, ctx).w;
      const loved = DISHES[m.dish].tags.includes(sp.loves);
      const share = Math.round((100 * (w - m.price)) / w);
      const del = delights(m.dish, v.g.sp, w, m.price, ctx);
      const asked = isRequest(ctx, m.dish, v.g.sp);
      outcome = `Bought ${DISHES[m.dish].icon} for ${m.price}¢: worth ${w}, so ${w - m.price}¢ (${share}%) left over. `;
      if (v.mood === 'delighted' && asked) outcome += `<b class="love">Delighted ♥</b>: the dish they asked for tonight. They tipped ${v.tip ?? 0}¢, spread the word and bring a friend tomorrow.`;
      else if (v.mood === 'delighted') outcome += `<b class="love">Delighted ♥</b>: a dish they love (${TAG_WORD[sp.loves]}) with at least ${Math.round(TUNE.delight * 100)}% of its worth left over. They spread the word (renown) and bring a friend tomorrow.`;
      else if (del && v.slow) outcome += `It would have delighted them, but they waited ${v.waited} of their ${v.g.patience} minutes. Happy, no ♥.`;
      else if (del && v.wanted !== v.pick) outcome += `They settled for this because their first choice was sold out. Happy, no ♥.`;
      else if (v.mood === 'meh') outcome += `They grumbled at the wait (${v.waited} of ${v.g.patience} minutes).`;
      else outcome += loved ? `Happy, but ${share}% left over isn’t a bargain (needs ${Math.round(TUNE.delight * 100)}%) for a ♥.` : `Happy. Only a dish with something they love (${TAG_WORD[sp.loves]}) can delight them.`;
      if (v.pick2 >= 0) outcome += ` Badgers eat two: they had ${DISHES[l.menu[v.pick2].dish].icon} too (${l.menu[v.pick2].price}¢).`;
    } else {
      outcome = `Left: ${WHY_TEXT[v.why!]}.${v.rep < 0 ? ` Let down: half a ♥ each, rounded up, at most ${TUNE.lossCap} a night.` : ' No harm to your renown.'}`;
      if (v.why === 'slow') outcome += ` They queue at most ${v.g.patience} minutes.`;
    }
    showCard(
      `<h2>${sprite(v.g.sp, 34)} ${sp.name}<span class="sub">arrived ${clockOf(v.g.at)}${v.g.friend ? ' · a friend of last night’s delighted guest' : ''} · waited ${v.waited} min</span></h2>
       <p>Purse <b>${v.g.purse}¢</b> <small>(${sp.plural.toLowerCase()} carry ${lo}–${hi}¢${pm ? `, ${pm}` : ''})</small>. Loves <b>${TAG_WORD[sp.loves]}</b>, dislikes <b>${TAG_WORD[sp.dislikes]}</b>. Queues up to ${v.g.patience} min.</p>
       <p class="small">They pick the dish with the most worth left over after its price, if it’s in stock, worth its price and within their purse.</p>
       <table class="why"><tr><th></th><th>worth to them</th><th>price</th><th></th></tr>${rows}</table>
       <p>${outcome}</p>`,
      [{ label: 'Back', primary: true, onClick: () => closeOverlay() }],
    );
  }

  private showLedger(): void {
    const r = this.r;
    const l = this.lastLedger()!;
    const net = l.revenue - l.bought - l.shop - l.wage + l.tips;
    const lefts = (Object.entries(l.left) as [Why, number][]).map(([w, n]) => `<span>${WHY_ICON[w]} ${n} ${WHY_SHORT[w]}${['soldout', 'slow', 'closed'].includes(w) ? ' <b class="bad">let down</b>' : ''}</span>`).join('');
    const sold = l.menu.map((m, i) => `<span>${DISHES[m.dish].icon} ${l.sold[i]} × ${m.price}¢</span>`).join('');
    const waste = l.wasted.map((n, u) => (n ? `${n} ${INGS[u].icon}` : '')).filter(Boolean).join(', ');
    const before = l.repAfter - l.rep;
    const rows = [
      ['Takings', `+${l.revenue}¢`],
      ['Ingredients bought', l.bought ? `−${l.bought}¢` : '0¢'],
      ...(l.shop ? [['Recipes & upgrades', `−${l.shop}¢`]] : []),
      ...(l.wage ? [['Helper', `−${l.wage}¢`]] : []),
      ...(l.tips ? [['Regulars’ tips (full renown)', `+${l.tips}¢`]] : []),
    ]
      .map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`)
      .join('');
    const card = `<h2>Night ${l.day + 1} ledger<span class="sub">${WEATHER[l.ctx.weather].icon} ${WEATHER[l.ctx.weather].name}${l.ctx.festival ? ' · 🏮 festival' : ''}${l.ctx.payday ? ' · 💰 payday' : ''}</span></h2>
      <table class="ledger">${rows}<tr class="sum"><td>Today</td><td>${net >= 0 ? '+' : '−'}${Math.abs(net)}¢</td></tr><tr><td>Coins now</td><td><b>${fmt(l.coins)}¢</b></td></tr></table>
      <div class="chips">${sold}</div>
      <p><b>${l.served}</b> of ${l.guests} guests served${l.friends ? ` (${plural(l.friends, 'friend')} came)` : ''}. ${lefts ? `Walked off:` : 'Nobody walked off.'}</p>${lefts ? `<div class="chips">${lefts}</div>` : ''}
      <p>Renown ♥ ${before} → <b>${l.repAfter}</b>: ${l.delighted} delighted × ${Math.max(Math.round(TUNE.gainFloor * 100), REP_MAX - before)}% ${
        REP_MAX - before < TUNE.gainFloor * 100 ? `(a delight always spreads at least ${Math.round(TUNE.gainFloor * 100)}%)` : 'not yet heard of you'
      } = +${l.repGain}${
        l.letdowns ? `; ${plural(l.letdowns, 'guest')} let down = −${l.repLoss} (half a ♥ each, rounded up${l.letdowns * TUNE.lossPer > TUNE.lossCap ? `, capped at ${TUNE.lossCap}` : ''})` : ''
      }.${l.overflow ? ` Renown is full (${REP_MAX}): the ${plural(l.overflow, 'heart')} beyond it came back as ${l.tips}¢ in regulars’ tips (${TUNE.fullTip}¢ each).` : ''}${
        l.reqTips ? ` Tips from the dish guests asked for: ${l.reqTips}¢ (in the takings).` : ''
      } ${l.delighted && !r.over ? `${plural(Math.min(l.delighted, TUNE.friendCap), 'friend')} will come tomorrow.` : ''}</p>
      ${waste ? `<p class="warn">Thrown out: ${waste} (${l.wasteCost}¢ worth).</p>` : '<p>Nothing went to waste.</p>'}`;
    showCard(
      card,
      [
        r.over ? { label: 'See the season', primary: true, onClick: () => this.toMorning() } : { label: `Morning of night ${r.day + 1}`, primary: true, onClick: () => this.toMorning() },
        ...(this.mode === 'evening' ? [{ label: 'Read the guest log', onClick: () => closeOverlay() }] : []),
      ],
      false,
    );
  }

  // ---------------------------------------------------------------- season end

  private recorded = '';
  showEnd(): void {
    const r = this.r;
    const score = scoreOf(r);
    const st = starsOf(score);
    // One record per finished season (a reload shows the card again without counting it twice).
    let h = 0;
    for (const ch of r.actions.join(',')) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
    const key = `${r.seed}:${r.actions.length}:${h}`;
    if (this.recorded !== key && store.load('lastRecorded', '') !== key) {
      this.recorded = key;
      store.save('lastRecorded', key);
      const p = loadProfile();
      p.seasons++;
      p.best = Math.max(p.best, score);
      p.bestStars = Math.max(p.bestStars, st);
      store.save('profile', p);
      if (this.daily) recordDaily(store, score, `${fmt(score)} ${stars(st)}`, this.daily);
      if (st >= 2) this.sfx.fanfare();
    }
    const p = loadProfile();
    const daily = this.daily ? loadDaily(store) : null;
    const ls = r.ledgers;
    const served = ls.reduce((a, l) => a + l.served, 0);
    const guests = ls.reduce((a, l) => a + l.guests, 0);
    const delighted = ls.reduce((a, l) => a + l.delighted, 0);
    const waste = ls.reduce((a, l) => a + l.wasteCost, 0);
    const netOf = (l: Ledger) => l.revenue - l.bought - l.shop - l.wage + l.tips;
    const best = ls.reduce((b, l) => (netOf(l) > netOf(b) ? l : b), ls[0]);
    const next = STARS.find((s) => s > score);
    this.setMode('morning');
    showCard(
      `<h2>Season’s end<span class="sub">${plural(TUNE.days, 'night')} at the market</span></h2>
       <p class="big">${stars(st)}</p>
       <table class="ledger"><tr><td>Coins</td><td>${fmt(r.coins)}</td></tr><tr><td>Renown ♥ ${r.rep} × ${TUNE.repPts}</td><td>${fmt(TUNE.repPts * r.rep)}</td></tr><tr class="sum"><td>Score</td><td>${fmt(score)}</td></tr></table>
       <p class="meta2">Stars at ${STARS.map(fmt).join(' / ')}${next ? ` · ${fmt(next - score)} more for the next` : ''}</p>
       <div class="stats"><div><b>${served}/${guests}</b>guests served</div><div><b>${delighted}</b>delighted</div>
         <div><b>${best ? `+${netOf(best)}¢` : '-'}</b>best night, after costs (${best ? `N${best.day + 1}` : ''})</div><div><b>${waste}¢</b>thrown out</div></div>
       ${daily ? `<p class="meta2">Today’s best: ${daily.label} · ${plural(daily.plays, 'try', 'tries')}</p>` : p.seasons ? `<p class="meta2">Best ${fmt(p.best)} ${stars(p.bestStars)} · ${plural(p.seasons, 'season')}</p>` : ''}`,
      [
        { label: 'New season', primary: true, onClick: () => this.newGame() },
        { label: this.daily ? 'Play the daily again' : 'Same seed again', onClick: () => this.start(this.r.seed, [], this.daily) },
        { label: 'Season ledger', onClick: () => this.showSeason(() => this.showEnd()) },
        { label: 'All games', onClick: () => (location.href = '../') },
      ],
      false,
    );
  }

  // ---------------------------------------------------------------- cards

  private back(): void {
    if (this.r.over) this.showEnd();
    else closeOverlay();
  }

  showKind(sp: number): void {
    const r = this.r;
    const s = SPECIES[sp];
    const ctx = ctxOf(r);
    const [lo, hi] = purseRange(sp, ctx);
    const d = demand(r, this.draft.menu, forecast(r), stovesOf(r, this.draft.helper));
    const k = d.kinds.find((x) => x.sp === sp);
    const picks = this.draft.menu
      .map((m, i) => {
        const w = worthOf(m.dish, sp, ctx).w;
        const orders = k ? k.share[i] * k.n : 0;
        return `<tr><td>${DISHES[m.dish].icon}</td><td>worth <b>${w}</b></td><td>${m.price}¢</td><td>${orders >= 0.05 ? `~${orders < 1 ? orders.toFixed(1) : Math.round(orders)} ${orders >= 1.5 ? 'orders' : 'order'} from them` : m.price > w ? 'not worth it' : m.price > hi ? 'too pricey' : '—'}</td></tr>`;
      })
      .join('');
    showCard(
      `<h2>${sprite(sp, 34)} ${s.plural}<span class="sub">~${k ? (k.n < 1 ? '<1' : Math.round(k.n)) : 0} expected tonight${k ? ` (likely ${spanOf(likely(k.n))})` : ''}${
        ctxOf(r).req?.sp === sp ? `, including ${TUNE.reqGuests} who come for the dish they asked for` : ''
      }</span></h2>
       <p>Loves <b>${TAG_WORD[s.loves]}</b> (worth ×${TUNE.love}), dislikes <b>${TAG_WORD[s.dislikes]}</b> (×${TUNE.dislike}). Tonight they carry <b>${lo}–${hi}¢</b> and queue up to ${patienceOf(sp, r.ups[UP.bench] > 0)} min.${s.appetite > 1 ? ' They eat two dishes if their purse allows.' : ''}</p>
       <table class="why"><tr><th></th><th>to them</th><th>price</th><th>tonight</th></tr>${picks}</table>
       <p class="small">${k?.delight ? `~${Math.round(k.delight * 100)}% would leave delighted (♥).` : 'None would leave delighted: that takes a dish they love at no more than ¾ of what it’s worth to them.'}</p>`,
      [{ label: 'Back', primary: true, onClick: () => closeOverlay() }],
    );
  }

  /** Where the crowd estimate comes from. */
  showCrowd(): void {
    const r = this.r;
    const f = forecast(r);
    const ctx = f.ctx;
    const parts = [`(${TUNE.street0} + ${TUNE.streetK} × renown ${r.rep})`, `${WEATHER[ctx.weather].name.toLowerCase()} ×${WEATHER[ctx.weather].crowd}`];
    if (ctx.festival) parts.push(`festival ×${TUNE.festival}`);
    if (ctx.rival) parts.push(`rival stall ×${TUNE.rivalCrowd}`);
    if (r.ups[UP.lantern]) parts.push(`lanterns ×${TUNE.lanterns}`);
    const wts = speciesWeights(r.rep, ctx.weather);
    const tot = wts.reduce((a, b) => a + b, 0);
    const mix = wts
      .map((w, sp) => ({ w, sp }))
      .filter((x) => x.w > 0)
      .map((x) => `${sprite(x.sp, 22)} ${Math.round((100 * x.w) / tot)}%`)
      .join(' ');
    showCard(
      `<h2>Tonight’s crowd</h2>
       <p>Passers-by who stop: ${parts.join(' × ')} = <b>${f.street.toFixed(1)}</b>, give or take 15% (${f.lo}–${f.hi}).</p>
       <p>${f.friends ? `Plus <b>${plural(f.friends, 'friend')}</b> of last night’s delighted guests (at most ${TUNE.friendCap}).` : 'No friends tonight: only delighted guests bring one.'}</p>
       <p>Who they are, by share: ${mix}</p>${ctx.req ? `<p>Plus <b>${TUNE.reqGuests} ${SPECIES[ctx.req.sp].plural.toLowerCase()}</b> who come just for the ${DISHES[ctx.req.dish].name} they asked for.</p>` : ''}
       <p class="small">Each kind turns up more or less in some weather (see 📖), and new kinds start coming as your renown grows.</p>`,
      [{ label: 'Back', primary: true, onClick: () => closeOverlay() }],
    );
  }

  showBook(): void {
    const r = this.r;
    const rows = SPECIES.map((s, sp) => {
      const met = r.met[sp];
      const open = r.rep >= s.rep;
      const likes = Object.entries(s.likes)
        .map(([w, x]) => `${WEATHER[w as keyof typeof WEATHER].icon}${x === 0 ? ' never' : x > 1 ? ' more' : ' fewer'}`)
        .join(', ');
      const when = `${clockOf(s.window[0])}–${clockOf(s.window[1])}`;
      return `<div class="book ${met ? '' : 'unmet'}">${sprite(sp, 40)}<div><b>${s.plural}</b>${
        met
          ? `<small>love <b>${TAG_WORD[s.loves]}</b> · dislike <b>${TAG_WORD[s.dislikes]}</b> · purse ${s.purse[0]}–${s.purse[1]}¢ · queue ${s.patience} min · come ${when}${likes ? ` · ${likes}` : ''}${s.appetite > 1 ? ' · eat two' : ''}</small>`
          : `<small>${open ? 'Might turn up any night now.' : `Come once your renown reaches ♥ ${s.rep}.`}</small>`
      }</div></div>`;
    }).join('');
    showCard(`<h2>Guest book<span class="sub">Who visits, and what they like</span></h2>${rows}`, [{ label: 'Back', primary: true, onClick: () => this.back() }]);
  }

  showSeason(back: () => void): void {
    const rows = this.r.ledgers
      .map((l) => {
        const net = l.revenue - l.bought - l.shop - l.wage + l.tips;
        return `<tr><td>N${l.day + 1} ${WEATHER[l.ctx.weather].icon}${l.ctx.festival ? '🏮' : ''}${l.ctx.payday ? '💰' : ''}</td><td>${l.served}/${l.guests}</td><td>${net >= 0 ? '+' : '−'}${Math.abs(net)}¢</td><td>♥ ${l.repAfter}</td></tr>`;
      })
      .join('');
    showCard(`<h2>Season ledger</h2>${rows ? `<table class="ledger season"><tr><th>Night</th><th>Served</th><th>Net</th><th>Renown</th></tr>${rows}</table>` : '<p>No nights yet.</p>'}`, [
      { label: 'Back', primary: true, onClick: back },
    ]);
  }

  showHelp(): void {
    store.save('seenHelp', true);
    showCard(
      `<h2>Simmer</h2>
       <p>Run a little food stall at the night market for ${TUNE.days} nights. Critters come to eat; keep them happy and your coins growing.</p>
       <ul>
         <li><b>Morning:</b> pick tonight’s dishes and prices, and buy ingredients. The forecast says how many guests to expect, of which kinds, and roughly how many will order each dish. <b>Fill to forecast</b> buys what that needs.</li>
         <li>Ingredients keep a few nights (fish only one); what’s left on its last night is thrown out.</li>
         <li><b>Evening:</b> guests queue and pick the dish with the most <b>worth left over</b> after its price, if they can afford it. Worth depends on what each kind loves or dislikes and the weather. Tap any guest (or a line in the log) to see their numbers.</li>
         <li>A guest served a dish they <b>love</b> at ¾ of its worth or less is <b>delighted</b>: your renown ♥ grows and they bring a friend tomorrow. A long wait (over half their patience) or settling for a second choice cancels the delight.</li>
         <li>Guests <b>let down</b> (sold out, gave up queueing, still waiting at closing) grumble: they cost half a ♥ each, rounded up, at most ${TUNE.lossCap} a night. If the stove can’t keep up, hire a helper or buy a second stove.</li>
         <li>From night ${TUNE.reqFrom + 1}, one kind of guest <b>asks for a dish</b> each night: ${TUNE.reqGuests} more of them come for it, they take it whenever they can afford it, and each one served is delighted (unless the wait is long) and tips ${TUNE.reqTip}¢. Price it within their purses, and stock for other kinds who want it too. At full renown (♥ ${REP_MAX}) delights beyond it come back as regulars’ tips (${TUNE.fullTip}¢ a ♥).</li>
         <li>One late night a <b>rival stall</b> opens across the lane: fewer passers-by, and they compare (every dish worth ×${TUNE.rivalWorth}).</li>
         <li>Renown brings more guests and new kinds (see 📖). Recipes, upgrades and a helper cost coins now and pay back later.</li>
         <li><b>Score</b> = coins + ${TUNE.repPts} × renown at the season’s end. Stars at ${STARS.map(fmt).join(', ')}.</li>
       </ul>`,
      [{ label: 'Got it', primary: true, onClick: () => this.back() }],
    );
  }

  showMenu(): void {
    const r = this.r;
    showCard(`<h2>Simmer${this.daily ? ' · daily' : ''}<span class="sub">Night ${Math.min(r.day + 1, TUNE.days)} of ${TUNE.days} · ${fmt(r.coins)}¢ · ♥ ${r.rep} · score ${fmt(scoreOf(r))}</span></h2>`, [
      { label: 'Resume', primary: true, onClick: () => this.back() },
      { label: 'Guest book', onClick: () => this.showBook() },
      { label: 'Season ledger', onClick: () => this.showSeason(() => this.showMenu()) },
      { label: 'How to play', onClick: () => this.showHelp() },
      {
        label: 'New season',
        onClick: () =>
          showCard('<h2>New season?</h2><p>This season will be lost.</p>', [
            { label: 'Keep going', primary: true, onClick: () => this.back() },
            { label: 'New season', onClick: () => this.newGame() },
          ]),
      },
      { label: 'Copy bug report', onClick: () => this.copyReport() },
      { label: 'All games', onClick: () => (location.href = '../') },
    ]);
  }

  private async copyReport(): Promise<void> {
    toast((await copyText(`SIMMER v${RULES_VERSION} seed=${this.r.seed} a=${this.r.actions.join(',')}`)) ? 'Bug report copied' : 'Copy failed');
  }
}

