// Rewild controller: owns the run (seed + actions), the hand, the island
// canvas and the panels. All rules live in core/; this file only asks
// questions of it and shows the answers.

import { Sfx } from '../afterglow/audio';
import { closeOverlay, showCard } from '../shared/cards';
import { copyText, toast } from '../shared/debug';
import { makeStore } from '../shared/storage';
import { dailySeed, leaveDaily, loadDaily, prettyDay, recordDaily, todayKey } from '../shared/daily';
import {
  ADJ,
  ANIMALS,
  ALL_IDS,
  PLANTS,
  PLAYS,
  RULES_VERSION,
  SEASONS,
  SEASON_NAMES,
  SPECIES,
  STARS,
  UNLOCK,
  WEATHER_TEXT,
  apply,
  census,
  clone,
  encode,
  foodAt,
  isPlant,
  moisture,
  needOf,
  newGame,
  placeError,
  replay,
  decodeAll,
  seasonReport,
  simulate,
  seasonOf,
  starsFor,
  weatherFor,
  yearOf,
  type Action,
  type Cell,
  type GameState,
  type SeasonReport,
  type SimEvent,
  type SpeciesId,
  type Terrain,
  type Weather,
} from './core';
import { COLORS, drawIcon } from './render/art';
import { Board, iconCanvas, type Mark } from './render/board';
import { causeNow, fate, lower, reportHtml, say, summaryLines } from './story';

export const store = makeStore('rewild.');

const $ = (id: string) => document.getElementById(id)!;

const TERRAIN_NAME: Record<Terrain, string> = {
  sea: 'Sea',
  shallows: 'Shallows',
  sand: 'Sand',
  rock: 'Bare rock',
  soil: 'Soil',
  marsh: 'Marsh',
  pond: 'Pond',
};
const WEATHER_NAME: Record<Weather, string> = { fair: 'Fair', drought: 'Drought', fire: 'Lightning', storm: 'Storm', harsh: 'Harsh winter' };
const WEATHER_COLOR: Record<Weather, string> = { fair: '#9fd98a', drought: '#f0a24a', fire: '#ff7a2f', storm: '#7fb7ff', harsh: '#d8ecff' };
const TIER_MARK = ['', '', '◆', '◆◆'];

interface Profile {
  best: number;
  bestStars: number;
  runs: number;
}

function units(s: GameState, id: SpeciesId): number {
  let n = 0;
  for (const c of s.cells) {
    if (c.plant?.id === id) n += c.plant.n;
    if (c.animal?.id === id) n += c.animal.n;
  }
  return n;
}

/** Why a species placed on cell i would not thrive, from a trial season's events. */
function placeWhy(id: SpeciesId, i: number, ev: SimEvent[], after: GameState): string {
  for (const e of ev) {
    if (e.type === 'move' && e.from === i && e.id === id) return 'it would wander off to find food';
    if ((e.type === 'die' || e.type === 'shrink') && e.cell === i && e.id === id) {
      if (e.why === 'hungry' || e.why === 'starved') return 'not enough food in reach';
      return causeNow(e.why, id, e.by);
    }
  }
  if (isPlant(id)) {
    const sea = seasonOf(after.season - 1);
    if (!PLANTS[id].grows.includes(sea)) return `it doesn't grow in ${SEASON_NAMES[sea].toLowerCase()}`;
    if (ev.some((e) => e.type === 'eat' && e.prey === i)) return 'grazers would crop it';
    return 'it would barely grow';
  }
  return 'it would barely grow';
}

const cap = (t: string) => t.replace(/^./, (ch) => ch.toUpperCase());

const dots = (n: number, max = 3) => '●'.repeat(n) + '○'.repeat(Math.max(0, max - n));

export function needsText(id: SpeciesId): string {
  if (isPlant(id)) {
    const d = PLANTS[id];
    const on = d.on.map((t) => TERRAIN_NAME[t].toLowerCase()).join(', ');
    const parts = [`On ${on}`];
    if (d.minFert > 0) parts.push(`richness ${d.minFert}+`);
    if (d.maxFert < 3) parts.push(`richness ${d.maxFert} only`);
    if (d.minWet > 0) parts.push(`moisture ${d.minWet}+`);
    return parts.join(' · ');
  }
  const d = ANIMALS[id];
  const eats = d.eats.map((e) => SPECIES[e].name.toLowerCase()).join(', ');
  return `On ${d.on.map((t) => TERRAIN_NAME[t].toLowerCase()).join(', ')} · eats ${eats}${d.hibernates ? ' · sleeps in winter' : ''}`;
}

export class Game {
  s!: GameState;
  seed = 0;
  actions: Action[] = [];
  replayOnly = false;
  board: Board;
  sfx = new Sfx();
  /** Selected hand card, or -1. */
  card = -1;
  /** Inspected cell, or -1. */
  cell = -1;
  private wet: number[] = [];
  private marks = new Map<number, Mark>();
  /** Why a placement would struggle, per marked cell. */
  private markWhy = new Map<number, string>();
  /** A 'bad' cell tapped once: the next tap on it places anyway. */
  private armed = -1;
  /** What the last season did, and what the next one would do if nothing is played. */
  report: SeasonReport | null = null;
  risk: SeasonReport | null = null;
  private busyUntil = 0;
  private banners: { text: string; color?: string }[] = [];
  private bannerTimer = 0;

  constructor() {
    this.board = new Board($('board') as HTMLCanvasElement);
    this.sfx.setMuted(store.load('muted', false));
    const canvas = $('board');
    let down: { x: number; y: number } | null = null;
    canvas.addEventListener('pointerdown', (e) => {
      this.sfx.unlock();
      down = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved < 14) this.tapCell(this.board.cellAt(e.clientX, e.clientY));
    });
    $('endBtn').onclick = () => this.endSeason();
    $('rerollBtn').onclick = () => this.reroll();
    $('weatherBtn').onclick = () => this.showWeather();
    $('goalsBtn').onclick = () => this.showGoals();
    const loop = (t: number) => {
      this.board.draw(t / 1000);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------- run

  /** Today's date while playing the daily island, else null. */
  daily: string | null = null;

  start(seed: number, a = '', fromLink = false, daily: string | null = null) {
    this.seed = seed;
    this.replayOnly = fromLink;
    this.daily = daily;
    try {
      this.actions = decodeAll(a);
      this.s = replay(seed, this.actions);
    } catch (err) {
      console.warn('replay failed, starting fresh', err);
      this.actions = [];
      this.s = newGame(seed);
    }
    this.card = -1;
    this.cell = -1;
    this.report = this.lastReport();
    this.refresh(false);
    if (daily && this.actions.length === 0) this.queueBanner(`Daily island · ${prettyDay(daily)}`, '#f2c45a');
    this.queueBanner(`${SEASON_NAMES[seasonOf(this.s.season)]}, year ${yearOf(this.s.season)}`);
    if (this.s.over) setTimeout(() => this.showEnd(), 300);
  }

  /** Species alive at the start of the season that the first `n` actions are in. */
  private speciesAtSeasonStart(n: number): number {
    let k = n - 1;
    while (k >= 0 && this.actions[k].type !== 'end') k--;
    return census(replay(this.seed, this.actions.slice(0, k + 1)).cells).species.size;
  }

  /** Rebuilds the report of the last season played (after a reload). */
  private lastReport(): SeasonReport | null {
    let k = this.actions.length - 1;
    while (k >= 0 && this.actions[k].type !== 'end') k--;
    if (k < 0) return null;
    try {
      const s = replay(this.seed, this.actions.slice(0, k));
      const before = clone(s);
      const ev = apply(s, { type: 'end' });
      return ev ? seasonReport(before, ev, s, this.speciesAtSeasonStart(k)) : null;
    } catch {
      return null;
    }
  }

  /** Saves the island now (so a fresh one survives a reload). */
  save() {
    this.persist();
  }

  private persist() {
    if (this.replayOnly) return;
    // Finished islands stay saved too, so a reload shows the results instead of a new island.
    store.save(this.daily ? 'dailyRun' : 'run', { v: RULES_VERSION, seed: this.seed, a: this.actions.map(encode).join(','), day: this.daily });
  }

  private act(a: Action): SimEvent[] | null {
    const ev = apply(this.s, a);
    if (ev === null) return null;
    this.actions.push(a);
    this.persist();
    return ev;
  }

  newIsland() {
    closeOverlay();
    this.replayOnly = false;
    leaveDaily();
    this.start((Math.random() * 0xffffffff) >>> 0);
    this.persist();
  }

  /** Today's daily island: resume it if started, else begin it. */
  playDaily() {
    closeOverlay();
    const day = todayKey();
    const saved = store.load<{ v: number; seed: number; a: string; day: string } | null>('dailyRun', null);
    if (saved && saved.v === RULES_VERSION && saved.day === day) this.start(saved.seed, saved.a, false, day);
    else this.start(dailySeed('rewild', day), '', false, day);
  }

  // ---------------------------------------------------------------- input

  private now() {
    return performance.now() / 1000;
  }

  private busy() {
    return performance.now() < this.busyUntil;
  }

  selectCard(i: number) {
    if (this.busy() || this.s.over) return;
    this.sfx.click();
    this.card = this.card === i ? -1 : i;
    this.cell = -1;
    this.computeMarks();
    this.render();
  }

  private tapCell(i: number) {
    if (i < 0 || this.busy() || this.s.over) {
      if (i < 0 && this.card < 0) {
        this.cell = -1;
        this.render();
      }
      return;
    }
    if (this.card >= 0) {
      const err = placeError(this.s, this.card, i);
      if (err) {
        toast(err);
        return;
      }
      const id = this.s.hand[this.card];
      if (this.marks.get(i) === 'bad' && this.armed !== i) {
        // A doomed placement takes a second tap, after saying why.
        this.armed = i;
        this.sfx.click();
        this.render();
        return;
      }
      this.act({ type: 'place', card: this.card, cell: i });
      this.sfx.pickup();
      this.board.floatText(i, SPECIES[id].name, COLORS[id], this.now());
      this.card = -1;
      this.cell = i;
      this.refresh(false);
      return;
    }
    this.cell = this.cell === i ? -1 : i;
    this.render();
  }

  undo() {
    const last = this.actions[this.actions.length - 1];
    if (!last || last.type !== 'place' || this.busy()) return;
    this.actions.pop();
    this.s = replay(this.seed, this.actions);
    this.persist();
    this.card = -1;
    this.cell = -1;
    this.sfx.click();
    this.refresh(false);
  }

  private reroll() {
    if (this.busy() || this.s.rerolls <= 0 || this.s.plays < PLAYS) return;
    this.act({ type: 'reroll' });
    this.sfx.click();
    this.card = -1;
    this.refresh(false);
  }

  endSeason() {
    if (this.busy() || this.s.over) return;
    const before = this.s.season;
    const prev = clone(this.s);
    const startSpecies = this.speciesAtSeasonStart(this.actions.length);
    const ev = this.act({ type: 'end' });
    if (!ev) return;
    this.report = seasonReport(prev, ev, this.s, startSpecies);
    this.sfx.click();
    this.card = -1;
    // Clear the selection so the panel shows what the season did.
    this.cell = -1;
    this.refresh(true, ev);
    const log = this.s.log[this.s.log.length - 1];
    this.busyUntil = performance.now() + 900;
    document.body.classList.add('busy');
    setTimeout(() => {
      document.body.classList.remove('busy');
      this.render();
    }, 900);
    this.banners = []; // drop news of earlier seasons still waiting to show
    this.queueBanner(`${SEASON_NAMES[seasonOf(before)]}: +${log.points} points · ${log.species} species`, '#f2c45a');
    for (const e of ev) {
      if (e.type === 'goal') {
        const g = this.s.goals.find((x) => x.id === e.id)!;
        this.queueBanner(`Goal: ${g.text} +${g.reward}`, '#f2c45a');
        this.sfx.levelUp();
      }
      if (e.type === 'unlock') {
        this.queueBanner(`New species can now arrive`, '#7bd88f');
        this.sfx.evolve();
      }
    }
    const deaths = ev.filter((e) => e.type === 'die').length;
    if (deaths >= 4) this.sfx.hurt();
    if (this.s.over) {
      this.recordEnd();
      setTimeout(() => this.showEnd(), 1400);
      return;
    }
    if (this.s.weather !== 'fair') this.queueBanner(`${SEASON_NAMES[seasonOf(this.s.season)]}: ${WEATHER_NAME[this.s.weather]}`, WEATHER_COLOR[this.s.weather]);
    else if (seasonOf(this.s.season) === 0) this.queueBanner(`Year ${yearOf(this.s.season)} begins`);
  }

  // ---------------------------------------------------------------- view

  /** State changed: recompute moisture and hints, repaint everything. */
  private refresh(fade: boolean, ev: SimEvent[] = []) {
    this.wet = moisture(this.s.cells, this.s.weather);
    this.risk = null;
    if (!this.s.over) {
      const t = clone(this.s);
      const before = clone(t);
      const tev = apply(t, { type: 'end' });
      if (tev) this.risk = seasonReport(before, tev, t);
    }
    const now = this.now();
    this.board.set(this.s, this.wet, fade, now);
    if (ev.length) this.board.play(ev, now);
    this.board.fireAt = this.s.weather === 'fire' ? this.s.fireAt : -1;
    this.computeMarks();
    this.render();
  }

  private computeMarks() {
    this.marks = new Map();
    this.markWhy = new Map();
    this.armed = -1;
    if (this.card >= 0 && this.s.hand[this.card]) {
      const id = this.s.hand[this.card];
      // Sleepers placed in winter are judged by how they fare once they wake.
      const look = !isPlant(id) && ANIMALS[id].hibernates && seasonOf(this.s.season) === 3 && this.s.season < SEASONS - 1 ? 2 : 1;
      const run = (t: GameState) => {
        let ev: SimEvent[] = [];
        for (let k = 0; k < look; k++) ev = apply(t, { type: 'end' }) ?? [];
        return ev;
      };
      const base = clone(this.s);
      run(base);
      const baseUnits = units(base, id);
      const start = isPlant(id) ? PLANTS[id].start : ANIMALS[id].start;
      for (let i = 0; i < this.s.cells.length; i++) {
        if (placeError(this.s, this.card, i) !== null) continue;
        const t = clone(this.s);
        apply(t, { type: 'place', card: this.card, cell: i });
        const ev = run(t);
        const d = units(t, id) - baseUnits;
        const m: Mark = d >= start ? 'good' : d > 0 ? 'weak' : 'bad';
        this.marks.set(i, m);
        if (m !== 'good') this.markWhy.set(i, placeWhy(id, i, ev, t));
      }
    }
    this.board.marks = this.marks;
  }

  render() {
    const s = this.s;
    this.board.selected = this.armed >= 0 ? this.armed : this.cell;
    const season = Math.min(s.season, SEASONS - 1);
    $('when').textContent = s.over ? 'Done' : `${yearOf(season)} · ${SEASON_NAMES[seasonOf(season)]}`;
    $('score').textContent = String(s.score);
    const wb = $('weatherBtn');
    wb.innerHTML = `<span class="dot" style="background:${WEATHER_COLOR[s.weather]}"></span>${WEATHER_NAME[s.weather]}`;
    const done = s.goals.filter((g) => g.done).length;
    $('goalsCount').textContent = `⚑${done}/${s.goals.length}`;
    $('goalsBtn').classList.toggle('done', done === s.goals.length);
    this.renderHand();
    this.renderInfo();
    const end = $('endBtn') as HTMLButtonElement;
    end.textContent = s.plays > 0 ? 'End season' : 'End season ▶';
    end.classList.toggle('ready', s.plays === 0 && !s.over);
    end.disabled = s.over;
    const rr = $('rerollBtn') as HTMLButtonElement;
    rr.textContent = `New hand (${s.rerolls})`;
    rr.disabled = s.rerolls <= 0 || s.plays < PLAYS || s.over;
  }

  private renderHand() {
    const hand = $('hand');
    hand.innerHTML = '';
    this.s.hand.forEach((id, i) => {
      const b = document.createElement('button');
      b.className = 'card-sp';
      if (i === this.card) b.classList.add('sel');
      const anywhere = this.s.cells.some((_, k) => placeError(this.s, i, k) === null);
      if (!anywhere) b.classList.add('nowhere');
      if (this.s.plays <= 0) b.classList.add('nowhere');
      b.appendChild(iconCanvas(id, 48, (g, r) => drawIcon(g, r, r, r * 0.92, id)));
      const name = document.createElement('div');
      name.textContent = SPECIES[id].name;
      const kind = document.createElement('div');
      kind.className = 'kind';
      kind.textContent = SPECIES[id].kind;
      b.append(name, kind);
      if (SPECIES[id].tier > 1) {
        const t = document.createElement('span');
        t.className = 'tier';
        t.textContent = TIER_MARK[SPECIES[id].tier];
        b.appendChild(t);
      }
      b.onclick = () => {
        if (this.s.plays <= 0) {
          toast(`You've played ${PLAYS} cards this season. End the season.`);
          return;
        }
        this.selectCard(i);
      };
      hand.appendChild(b);
    });
  }

  private renderInfo() {
    const s = this.s;
    const info = $('info');
    if (s.over) {
      info.innerHTML = `<div class="title">The five years are over</div>Final score <b>${s.score}</b>. <button class="act" id="endCard">Results</button>`;
      $('endCard').onclick = () => this.showEnd();
      return;
    }
    const last = this.actions[this.actions.length - 1];
    const undo = last?.type === 'place' ? ' <button class="act" id="undoBtn">Undo</button>' : '';
    if (this.card >= 0 && s.hand[this.card]) {
      const id = s.hand[this.card];
      if (this.armed >= 0) {
        info.innerHTML =
          `<div class="title">${SPECIES[id].name} would not last here</div>` +
          `<div><span class="warn">${cap(this.markWhy.get(this.armed) ?? 'it would not survive')}.</span></div>` +
          `<div>Tap the cell again to place it anyway, or pick a glowing cell.</div>`;
        return;
      }
      const marks = [...this.marks.values()];
      const good = marks.filter((m) => m === 'good').length;
      const weak = marks.filter((m) => m === 'weak').length;
      const doomed = marks.length - good - weak;
      const why = this.topWhy();
      const where =
        this.marks.size === 0
          ? `<span class="warn">Nowhere to put it yet.</span> ${this.nowhereHint(id)}`
          : good
            ? `<span class="good">${good} cell${good > 1 ? 's' : ''}</span> where it will thrive${weak ? `, <span class="warn">${weak}</span> where it will struggle${why ? ` (${why})` : ''}` : doomed ? `; on dark cells it won't last${why ? ` (${why})` : ''}` : ''}.`
            : `<span class="warn">It would struggle anywhere right now${why ? `: ${why}` : ''}.</span>`;
      info.innerHTML = `<div class="row"><span class="title">${SPECIES[id].name}</span><span class="tag">${needsText(id)}</span></div><div>${SPECIES[id].text}</div><div>${where}</div>`;
      return;
    }
    if (this.cell >= 0) {
      info.innerHTML = this.cellInfo(this.cell) + undo;
      $('undoBtn')?.addEventListener('click', () => this.undo());
      return;
    }
    const left = s.plays;
    const title = left > 0 ? `Play up to ${left} more card${left > 1 ? 's' : ''}` : 'Ready for the season';
    const rep = this.report;
    const lines: string[] = [];
    if (s.weather !== 'fair') {
      lines.push(`<b style="color:${WEATHER_COLOR[s.weather]}">${WEATHER_NAME[s.weather]}:</b> ${WEATHER_TEXT[s.weather].replace(/^[^:]*: /, '')}`);
    }
    if (rep) lines.push(...summaryLines(rep, this.risk, lines.length ? 2 : 3));
    else lines.push(left > 0 ? 'Pick a card, then a glowing cell. Tap any cell to see what lives there.' : 'End the season to watch the island grow.');
    info.innerHTML =
      `<div class="row head"><span class="title">${title}</span>${undo}${rep ? '<button class="act" id="repBtn">Report</button>' : ''}</div>` +
      lines.map((l) => `<div class="${rep ? 'line' : ''}">${l}</div>`).join('');
    $('undoBtn')?.addEventListener('click', () => this.undo());
    $('repBtn')?.addEventListener('click', () => this.showReport());
  }

  /** The most common reason placements on amber or dark cells would struggle. */
  private topWhy(): string {
    const n = new Map<string, number>();
    for (const w of this.markWhy.values()) n.set(w, (n.get(w) ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  }

  private nowhereHint(id: SpeciesId): string {
    if (!isPlant(id)) return `It lives on ${ANIMALS[id].on.map((t) => TERRAIN_NAME[t].toLowerCase()).join(', ')}.`;
    if (id === 'fungi') return 'Grow an oak or shrub first.';
    const d = PLANTS[id];
    if (d.minFert >= 2) return 'Grass and fungi make soil richer each autumn.';
    if (d.on.includes('soil') && !d.on.includes('rock')) return 'Lichen turns rock and sand into soil.';
    return '';
  }

  showReport() {
    if (!this.report) return;
    showCard(reportHtml(this.report, this.risk), [{ label: 'Close', primary: true, onClick: closeOverlay }]);
  }

  private cellInfo(i: number): string {
    const s = this.s;
    const c = s.cells[i];
    const sea = seasonOf(s.season);
    const lines: string[] = [];
    const land = c.t !== 'shallows' && c.t !== 'pond' && c.t !== 'marsh';
    lines.push(
      `<div class="row"><span class="title">${TERRAIN_NAME[c.t]}</span>` +
        (land ? `<span class="tag">richness ${dots(c.fert)}</span>` : '') +
        `<span class="tag">moisture ${dots(this.wet[i])}</span>${c.burnt ? '<span class="tag">ash</span>' : ''}</div>`,
    );
    const next = clone(s);
    const ev = apply(next, { type: 'end' }) ?? [];
    const nc = next.cells[i];
    const parts: string[] = [];
    if (c.plant) parts.push(`<b>${SPECIES[c.plant.id].name}</b> ${dots(c.plant.n)}`);
    if (c.animal) {
      const a = c.animal;
      const need = needOf(a.id, a.n, s.weather, sea);
      // Animals eat after the plants have grown: count food as they will find it.
      const grown = clone(s);
      simulate(grown, true);
      const food = foodAt(grown.cells, i, a.id, sea);
      parts.push(need ? `<b>${SPECIES[a.id].name}</b> ${dots(a.n)} <span class="${food >= need ? 'good' : 'warn'}">food ${food}/${need}</span>` : `<b>${SPECIES[a.id].name}</b> ${dots(a.n)} asleep`);
    }
    if (parts.length) lines.push(`<div>${parts.join(' · ')}</div>`);
    lines.push(`<div>Next season: ${this.forecast(c, nc, i, ev)}</div>`);
    return lines.join('');
  }

  /** What next season does to cell i, with reasons, from a trial run's events. */
  private forecast(c: Cell, n: Cell, i: number, ev: SimEvent[]): string {
    const out: string[] = [];
    const good = (t: string) => out.push(`<span class="good">${t}</span>`);
    const bad = (t: string) => out.push(`<span class="warn">${t}</span>`);
    const crumbles = c.plant?.id === 'lichen' && !n.plant && n.t === 'soil';
    if (n.t !== c.t && !crumbles) out.push(`becomes ${TERRAIN_NAME[n.t].toLowerCase()}`);
    const hit = (id: SpeciesId) => ev.find((e) => (e.type === 'die' || e.type === 'shrink') && e.cell === i && e.id === id) as
      | Extract<SimEvent, { type: 'die' | 'shrink' }>
      | undefined;
    const grazers = [...new Set(ev.filter((e) => e.type === 'eat' && e.prey === i && c.plant && ANIMALS[e.id].eats.includes(c.plant.id)).map((e) => (e as { id: SpeciesId }).id))];
    const p = c.plant;
    const q = n.plant;
    const sea = seasonOf(this.s.season);
    if (p) {
      const h = hit(p.id);
      const by = grazers.map(lower).join(', ');
      if (crumbles) good(`lichen crumbles the ${TERRAIN_NAME[c.t].toLowerCase()} into soil`);
      else if (q && q.id !== p.id) bad(`${say(q.id, 'shades', 'shade')} out the ${lower(p.id)}`);
      else if (!q) bad(fate(p.id, h?.why, h?.by, true));
      else if (q.n > p.n) good(say(p.id, 'grows', 'grow'));
      else if (q.n < p.n) bad(h ? fate(p.id, h.why, h.by, false) : `${say(p.id, 'is', 'are')} grazed by ${by}`);
      else if (grazers.length) bad(`${say(p.id, 'is', 'are')} kept short by ${by}`);
      else if (p.n < 3 && !PLANTS[p.id].grows.includes(sea)) {
        const next = [1, 2, 3].map((k) => (sea + k) % 4).find((x) => PLANTS[p.id].grows.includes(x))!;
        out.push(`${say(p.id, 'rests', 'rest')} until ${SEASON_NAMES[next].toLowerCase()}`);
      }
    }
    if (q && (!p || p.id !== q.id)) good(p ? say(q.id, 'takes root', 'take root') : say(q.id, 'spreads here', 'spread here'));
    const a = c.animal;
    const b = n.animal;
    if (a) {
      const h = hit(a.id);
      const moved = ev.some((e) => e.type === 'move' && e.from === i);
      const wolves = a.id === 'deer' && ADJ[i].some((k) => this.s.cells[k].animal?.id === 'wolf');
      if (moved) bad(`${lower(a.id)} move away ${wolves ? 'from the wolves' : 'to find food'}`);
      else if (!b || b.n < a.n) bad(fate(a.id, h?.why, h?.by, !b));
      else if (b.n > a.n) good(`${lower(a.id)} have young`);
      if (ev.some((e) => e.type === 'spread' && e.from === i && e.id === a.id)) good(`${lower(a.id)} send young out`);
    }
    if (b && ev.some((e) => (e.type === 'move' || e.type === 'spread') && e.to === i)) good(`${lower(b.id)} arrive`);
    if (n.fert > c.fert && n.t === 'soil' && c.t === 'soil') out.push('richer soil');
    return out.length ? out.join(', ') : 'no change';
  }

  private queueBanner(text: string, color?: string) {
    this.banners.push({ text, color });
    if (!this.bannerTimer) this.nextBanner();
  }

  private nextBanner() {
    const el = $('banner');
    const b = this.banners.shift();
    if (!b) {
      el.classList.remove('show');
      this.bannerTimer = 0;
      return;
    }
    el.textContent = b.text;
    el.style.color = b.color ?? '';
    el.classList.add('show');
    this.bannerTimer = window.setTimeout(() => {
      el.classList.remove('show');
      this.bannerTimer = window.setTimeout(() => this.nextBanner(), 250);
    }, 1700);
  }

  // ---------------------------------------------------------------- cards

  showMenu() {
    const muted = this.sfx.muted;
    showCard('<h2>Rewild</h2>', [
      { label: 'Resume', primary: true, onClick: closeOverlay },
      { label: 'How to play', onClick: () => this.showHelp() },
      { label: 'Species', onClick: () => this.showSpecies() },
      { label: 'Goals', onClick: () => this.showGoals() },
      {
        label: muted ? 'Sound: off' : 'Sound: on',
        onClick: () => {
          this.sfx.setMuted(!muted);
          store.save('muted', !muted);
          this.showMenu();
        },
      },
      { label: 'Copy bug report', onClick: () => this.copyReport() },
      this.daily
        ? { label: 'Back to my island', onClick: () => this.resumeOwn() }
        : { label: `Daily island · ${loadDaily(store)?.label ?? 'not played'}`, onClick: () => this.playDaily() },
      { label: 'New island', onClick: () => this.confirmNew() },
      { label: 'Back to Game Lab', onClick: () => (location.href = '../') },
    ]);
  }

  private confirmNew() {
    if (this.s.over || this.actions.length === 0) return this.newIsland();
    showCard('<h2>Start a new island?</h2><p>This island will be lost.</p>', [
      { label: 'New island', primary: true, onClick: () => this.newIsland() },
      { label: 'Cancel', onClick: () => this.showMenu() },
    ]);
  }

  showHelp() {
    store.save('seenHelp', true);
    showCard(
      `<h2>Rewild</h2>
      <p>A bare island. Five years to bring it back to life.</p>
      <ul>
        <li>Each season you get <b>4 species cards</b> and may play <b>2</b>. Pick a card, then a glowing cell: <b style="color:#9effb4">green</b> cells are where it will thrive, <b style="color:#ffc46e">amber</b> where it will struggle.</li>
        <li>One animal per cell (plants can share with it). Cards marked <b>◆</b> and <b>◆◆</b> are later species: they join the deck once enough life is on the island.</li>
        <li>Then <b>end the season</b>. Plants grow, spread and change the land; animals eat, breed, move or starve.</li>
        <li>Life changes the land: <b>lichen</b> turns rock into soil, <b>grass</b> and <b>fungi</b> enrich it, <b>reeds</b> silt shallows into marsh, <b>beavers</b> dam ponds. Shrubs and oaks can be planted into grass once the soil is rich enough.</li>
        <li>Every season scores <b>species²/2 + life/5</b>: variety matters most. Grazers crop plants short so they can't spread; hunters keep grazers in check.</li>
        <li>Watch the weather: droughts dry the land, lightning starts wildfires in dry meadows, harsh winters starve animals.</li>
        <li>Tap any cell to see what lives there and what will happen to it next season. After each season, <b>Report</b> shows what grew, what died and why.</li>
      </ul>`,
      [{ label: 'Play', primary: true, onClick: closeOverlay }],
    );
  }

  showSpecies() {
    const o = $('overlay');
    showCard('<h2>Species</h2><div id="spList"></div>', [{ label: 'Close', primary: true, onClick: closeOverlay }]);
    const list = o.querySelector('#spList')!;
    for (const id of ALL_IDS) {
      const d = SPECIES[id];
      const row = document.createElement('div');
      row.className = 'sp' + (d.tier > this.s.tier ? ' locked' : '');
      row.appendChild(iconCanvas(id, 40, (g, r) => drawIcon(g, r, r, r * 0.92, id)));
      const t = document.createElement('div');
      const u = UNLOCK[d.tier - 2];
      const unlock = d.tier > this.s.tier ? ` <i>(arrives once ${u?.species} species live here, or by ${SEASON_NAMES[seasonOf(u?.season ?? 0)].toLowerCase()} of year ${yearOf(u?.season ?? 0)})</i>` : '';
      t.innerHTML = `<b>${d.name} <span style="color:var(--muted);font-weight:400">· ${d.kind}</span></b>${needsText(id)}. ${d.text}${unlock}`;
      row.appendChild(t);
      list.appendChild(row);
      list.appendChild(document.createElement('div')).style.height = '10px';
    }
  }

  private goalsHtml() {
    return this.s.goals
      .map((g) => {
        const pct = Math.min(100, Math.round((g.progress / g.target) * 100));
        return `<div class="goal${g.done ? ' done' : ''}"><div class="txt">${g.text}</div><div class="bar"><i style="width:${pct}%"></i></div><div class="pts">${g.done ? '✓' : `${g.progress}/${g.target}`} · ${g.reward}</div></div>`;
      })
      .join('');
  }

  showGoals() {
    showCard(`<h2>Goals</h2><p>Each goal pays its points once, the first season it's met.</p>${this.goalsHtml()}`, [
      { label: 'Close', primary: true, onClick: closeOverlay },
    ]);
  }

  showWeather() {
    const s = this.s;
    if (s.over) return;
    const rows: string[] = [];
    for (let k = 0; k < 2 && s.season + k < SEASONS; k++) {
      const w = k === 0 ? s.weather : weatherFor(s.seed, s.season + k).weather;
      rows.push(
        `<p><b style="color:${WEATHER_COLOR[w]}">${k === 0 ? 'This' : 'Next'} season (${SEASON_NAMES[seasonOf(s.season + k)]}): ${WEATHER_NAME[w]}</b><br>${WEATHER_TEXT[w]}</p>`,
      );
    }
    if (s.weather === 'fire') rows.push('<p>The dashed ring on the island marks where lightning will strike. Wet ground, water and bare cells stop a fire.</p>');
    showCard(`<h2>Weather</h2>${rows.join('')}`, [{ label: 'Close', primary: true, onClick: closeOverlay }]);
  }

  private dailyResult: ReturnType<typeof recordDaily> | null = null;

  private recordEnd() {
    if (this.replayOnly) return;
    const p = store.load<Profile>('profile', { best: 0, bestStars: 0, runs: 0 });
    p.runs++;
    p.best = Math.max(p.best, this.s.score);
    p.bestStars = Math.max(p.bestStars, starsFor(this.s.score));
    store.save('profile', p);
    if (this.daily) this.dailyResult = recordDaily(store, this.s.score, `${this.s.score} · ${'★'.repeat(starsFor(this.s.score)) || 'no stars'}`, this.daily);
    this.persist();
  }

  showEnd() {
    const s = this.s;
    const stars = starsFor(s.score);
    this.sfx.victory();
    const max = Math.max(...s.log.map((l) => l.species), 1);
    const chart = s.log.map((l) => `<i style="height:${Math.round((l.species / max) * 100)}%" title="${l.species}"></i>`).join('');
    const best = store.load<Profile>('profile', { best: 0, bestStars: 0, runs: 0 }).best;
    const { species } = census(s.cells);
    const landCells = s.cells.filter((c) => c.t !== 'shallows' && c.t !== 'pond' && c.t !== 'sea');
    const land = landCells.length;
    const green = landCells.filter((c) => c.plant).length;
    showCard(
      `<h2>Five years on</h2>
      <div class="stars">${'★'.repeat(stars)}<span class="off">${'★'.repeat(3 - stars)}</span></div>
      <p>Score <b>${s.score}</b>${best ? ` · best ${best}` : ''}. ${species.size} species live on the island now; at its peak, ${s.stats.maxSpecies}.</p>
      <p>Plants cover <b>${green}</b> of ${land} land cells. Life made <b>${s.stats.soilMade}</b> new soil${s.stats.pondsMade ? ` and <b>${s.stats.pondsMade}</b> pond${s.stats.pondsMade > 1 ? 's' : ''}` : ''}.</p>
      <p style="font-size:12px">Stars at ${STARS.join(' / ')}.</p>
      ${this.daily ? `<p><b style="color:var(--gold)">Daily island · ${prettyDay(this.daily)}</b><br>${this.dailyResult?.improved ? 'New best for today!' : `Today's best: ${loadDaily(store, this.daily)?.score ?? s.score}`}</p>` : ''}
      <h3>Species, season by season</h3><div class="chart">${chart}</div>
      <h3>Goals</h3>${this.goalsHtml()}`,
      [
        { label: 'New island', primary: true, onClick: () => this.newIsland() },
        ...(this.daily ? [{ label: 'Replay today’s island', onClick: () => this.restartDaily() }] : []),
        { label: 'Look at the island', onClick: closeOverlay },
        { label: 'Back to Game Lab', onClick: () => (location.href = '../') },
      ],
    );
  }

  /** Leave the daily and pick up your own saved island (or a fresh one). */
  resumeOwn() {
    closeOverlay();
    leaveDaily();
    const saved = store.load<{ v: number; seed: number; a: string } | null>('run', null);
    if (saved && saved.v === RULES_VERSION) this.start(saved.seed, saved.a);
    else {
      this.start((Math.random() * 0xffffffff) >>> 0);
      this.persist();
    }
  }

  /** Start today's daily island over from the beginning. */
  restartDaily() {
    closeOverlay();
    const day = todayKey();
    this.start(dailySeed('rewild', day), '', false, day);
    this.persist();
  }

  async copyReport() {
    const a = this.actions.map(encode).join(',');
    const url = `${location.origin}${location.pathname}?seed=${this.seed}&a=${a || '-'}`;
    const text = `REWILD v${RULES_VERSION} seed=${this.seed} a=${a}\n${url}`;
    toast((await copyText(text)) ? 'Bug report copied' : 'Copy failed');
  }
}
