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
  SETTLE_AFTER,
  SETTLED_BONUS,
  WEATHER_TEXT,
  apply,
  census,
  clone,
  encode,
  isPlant,
  moisture,
  newGame,
  placeError,
  placeReason,
  replay,
  decodeAll,
  seasonReport,
  seasonOf,
  track,
  starsFor,
  weatherFor,
  yearOf,
  type Action,
  type BlockKind,
  type Cell,
  type Fate,
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

/** How a population placed at size `start` fares: thrives, struggles or won't last. */
function judge(f: Fate, start: number): Mark {
  // Full lichen crumbling its rock into soil is the point of lichen.
  if (!f.alive) return f.id === 'lichen' && !f.hits.length && !f.shadedBy ? 'good' : 'bad';
  if (f.fled || f.wandered || f.n < start) return 'weak';
  return 'good';
}

const hungerWhy = (h: { why: string }) => h.why === 'hungry' || h.why === 'starved';

/** Why a placement would struggle or fail, in the words of the cell forecast. */
function placeWhy(f: Fate): string {
  if (f.shadedBy) return `${lower(f.shadedBy)} would shade it out`;
  const last = f.hits[f.hits.length - 1];
  if (last && !f.alive) return hungerWhy(last) ? 'not enough food in reach' : causeNow(last.why, f.id, last.by);
  if (f.fled) return 'it would flee the wolves nearby';
  if (f.wandered) return 'it would wander off to find food';
  const hit = f.hits[0];
  if (hit) return hungerWhy(hit) ? 'not enough food in reach' : causeNow(hit.why, f.id, hit.by);
  if (f.grazedBy.length) return `${f.grazedBy.map(lower).join(' and ')} would crop it`;
  return 'it would barely grow';
}

/** Seasons to look ahead when judging a placement: sleepers placed in winter and
 * plants placed out of their growing season are judged once they get going. */
function lookFor(s: GameState, id: SpeciesId): number {
  const left = SEASONS - s.season;
  if (isPlant(id)) {
    for (let k = 0; k < 4; k++) if (PLANTS[id].grows.includes(seasonOf(s.season + k))) return Math.max(1, Math.min(left, k + 1));
    return 1;
  }
  return ANIMALS[id].hibernates && seasonOf(s.season) === 3 ? Math.max(1, Math.min(left, 2)) : 1;
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
  /** Seasons the marks look ahead (more than 1 for sleepers and resting plants). */
  private look = 1;
  /** Cells this season's wildfire would burn as things stand. */
  private burnPlan: number[] = [];
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
    $('info').addEventListener('scroll', () => this.updateMore(), { passive: true });
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
    this.burnPlan = [];
    let strike = -1;
    if (!this.s.over) {
      const t = clone(this.s);
      const before = clone(t);
      const tev = apply(t, { type: 'end' });
      if (tev) {
        this.risk = seasonReport(before, tev, t);
        for (const e of tev) {
          if (e.type === 'burn') this.burnPlan.push(e.cell);
          if (e.type === 'strike') strike = e.cell;
        }
      }
    }
    const now = this.now();
    this.board.set(this.s, this.wet, fade, now);
    if (ev.length) this.board.play(ev, now);
    const s = this.s;
    this.board.fireAt = !s.over && s.weather === 'fire' ? s.fireAt : -1;
    this.board.catchAt = strike;
    this.board.burnPlan = new Set(this.burnPlan);
    // Next season's lightning, marked faintly a season ahead.
    const next = !s.over && s.season + 1 < SEASONS ? weatherFor(s.seed, s.season + 1) : null;
    this.board.nextFireAt = next?.weather === 'fire' ? next.fireAt : -1;
    this.computeMarks();
    this.render();
  }

  private computeMarks() {
    this.marks = new Map();
    this.markWhy = new Map();
    this.armed = -1;
    if (this.card >= 0 && this.s.hand[this.card] && this.s.plays > 0) {
      const id = this.s.hand[this.card];
      // Each glowing cell is judged by the placed population itself, from the
      // same exact trial season the cell readout shows once it is placed.
      const look = (this.look = lookFor(this.s, id));
      const run = (t: GameState) => {
        const ev: SimEvent[] = [];
        for (let k = 0; k < look; k++) ev.push(...(apply(t, { type: 'end' }) ?? []));
        return ev;
      };
      const start = isPlant(id) ? PLANTS[id].start : ANIMALS[id].start;
      for (let i = 0; i < this.s.cells.length; i++) {
        if (placeError(this.s, this.card, i, this.wet) !== null) continue;
        const t = clone(this.s);
        apply(t, { type: 'place', card: this.card, cell: i });
        const f = track(run(t), i, id, t.cells);
        const m = judge(f, start);
        this.marks.set(i, m);
        if (m !== 'good') this.markWhy.set(i, placeWhy(f));
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
    const info = $('info');
    const html = info.innerHTML;
    this.renderInfo();
    if (info.innerHTML !== html) info.scrollTop = 0;
    this.updateMore();
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
      const anywhere = this.s.cells.some((_, k) => placeError(this.s, i, k, this.wet) === null);
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

  /** Marks the panel when its text runs past the bottom, so it reads as scrollable. */
  private updateMore() {
    const info = $('info');
    const more = info.scrollHeight - info.scrollTop - info.clientHeight > 4;
    info.classList.toggle('more', more);
    $('panel').classList.toggle('more', more);
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
      // Plants out of season and sleepers in winter are judged once they get going.
      const sea = seasonOf(s.season);
      const later = this.look > 1 ? SEASON_NAMES[seasonOf(s.season + this.look - 1)].toLowerCase() : '';
      const resting = isPlant(id) ? !PLANTS[id].grows.includes(sea) : ANIMALS[id].hibernates && sea === 3;
      const note = resting && later ? `${isPlant(id) ? `Doesn't grow in ${SEASON_NAMES[sea].toLowerCase()}` : 'Sleeps through winter'}; judged by ${later}: ` : '';
      const thrive = later ? 'it will do well' : 'it will thrive';
      const where =
        this.marks.size === 0
          ? `<span class="warn">Nowhere to put it yet.</span> ${this.nowhereHint(id)}`
          : good
            ? `${note}<span class="good">${good} cell${good > 1 ? 's' : ''}</span> where ${thrive}${weak ? `, <span class="warn">${weak}</span> where it will struggle${why ? ` (${why})` : ''}` : doomed ? `; on dark cells it won't last${why ? ` (${why})` : ''}` : ''}.`
            : `${note}<span class="warn">It would struggle anywhere right now${why ? `: ${why}` : ''}.</span>`;
      info.innerHTML = `<div class="row"><span class="title">${SPECIES[id].name}</span><span class="tag">${needsText(id)}</span></div><div>${where}</div><div class="desc">${SPECIES[id].text}</div>`;
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
    let weather = '';
    if (s.weather === 'fire') {
      const n = this.burnPlan.length;
      weather =
        `<b style="color:${WEATHER_COLOR.fire}">Lightning:</b> ` +
        (n
          ? `<span class="warn">the wildfire would burn ${n} cell${n > 1 ? 's' : ''}</span> (flames on the island).`
          : 'nothing within 3 cells of the strike is grown and dry enough to burn.') +
        ' Grazed plants, seedlings, damp ground and water don\'t burn; sparks jump one-cell gaps.';
    } else if (s.weather !== 'fair') {
      weather = `<b style="color:${WEATHER_COLOR[s.weather]}">${WEATHER_NAME[s.weather]}:</b> ${WEATHER_TEXT[s.weather].replace(/^[^:]*: /, '')}`;
    }
    // Summary lines stay one line each, except the died-out line, which wraps so no species is cut.
    const lines = rep
      ? summaryLines(rep, this.risk, weather ? 3 : 4).map((l) => `<div class="line${l.includes('✖') ? ' wrap' : ''}">${l}</div>`)
      : [`<div>${left > 0 ? 'Pick a card, then a glowing cell. Tap any cell to see what lives there.' : 'End the season to watch the island grow.'}</div>`];
    info.innerHTML =
      `<div class="row head"><span class="title">${title}</span>${undo}${rep ? '<button class="act" id="repBtn">Report</button>' : ''}</div>` +
      (weather ? `<div>${weather}</div>` : '') +
      lines.join('');
    $('undoBtn')?.addEventListener('click', () => this.undo());
    $('repBtn')?.addEventListener('click', () => this.showReport());
  }

  /** The most common reason placements on amber or dark cells would struggle. */
  private topWhy(): string {
    const n = new Map<string, number>();
    for (const w of this.markWhy.values()) n.set(w, (n.get(w) ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  }

  /** Names what actually stops a card going anywhere: no ground, too dry, too poor, taken… */
  private nowhereHint(id: SpeciesId): string {
    const s = this.s;
    const blocks = s.cells.map((_, i) => placeReason(s, id, i, this.wet));
    const drying = s.weather === 'drought' || s.weather === 'fire' ? ` (this season's ${s.weather === 'fire' ? 'lightning' : 'drought'} dries every cell)` : '';
    const dampTip = `Damp ground lies beside ponds and marsh, on the coast or by a full oak${drying}.`;
    if (!isPlant(id)) {
      const on = ANIMALS[id].on.map((t) => TERRAIN_NAME[t].toLowerCase()).join(', ');
      return blocks.some((b) => b?.kind === 'animal') ? `It lives on ${on}, and every such cell already has an animal.` : `It lives on ${on}.`;
    }
    const d = PLANTS[id];
    let cells = s.cells.map((_, i) => i).filter((i) => d.on.includes(s.cells[i].t));
    let where = `${d.on.map((t) => TERRAIN_NAME[t].toLowerCase()).join(' or ')} cell`;
    if (id === 'fungi') {
      const woody = (j: number) => s.cells[j].plant?.id === 'tree' || s.cells[j].plant?.id === 'shrub';
      if (!s.cells.some((_, j) => woody(j))) return 'Fungi grow beside an oak or shrub: grow one first.';
      cells = cells.filter((i) => ADJ[i].some(woody));
      if (!cells.length) return 'None of your oaks or shrubs has soil beside it.';
      where = 'soil cell beside an oak or shrub';
    }
    if (!cells.length) {
      if (d.on.includes('soil')) return 'There is no soil yet: lichen turns rock and sand into soil.';
      return `There is no ${d.on.map((t) => TERRAIN_NAME[t].toLowerCase()).join(' or ')} here.`;
    }
    const n = new Map<BlockKind, number>();
    for (const i of cells) {
      const k = blocks[i]?.kind;
      if (k) n.set(k, (n.get(k) ?? 0) + 1);
    }
    const text: Partial<Record<BlockKind, string>> = {
      dry: `too dry (needs moisture ${d.minWet})`,
      poor: `too poor (needs richness ${d.minFert})`,
      rich: 'too rich (it is crowded out)',
      occupied: `already growing something${d.over ? ` other than ${d.over.map((o) => PLANTS[o].name.toLowerCase()).join(' or ')}` : ''}`,
    };
    const ranked = [...n].filter(([k]) => text[k]).sort((a, b) => b[1] - a[1]);
    if (!ranked.length) return '';
    const all = cells.length;
    const parts = ranked.map(([k, c]) => `${c === all ? (all > 1 ? 'all ' : '') : `${c} `}${text[k]}`);
    const tips: Partial<Record<BlockKind, string>> = {
      dry: dampTip,
      poor: 'Grass and wildflowers enrich poor soil each autumn; full oaks, fungi and wildfire ash do too.',
    };
    return `Of ${all} ${where}${all > 1 ? 's' : ''}: ${parts.join(', ')}. ${tips[ranked[0][0]] ?? ''}`;
  }

  showReport() {
    if (!this.report) return;
    showCard(reportHtml(this.report, this.risk, PLAYS - this.s.plays), [{ label: 'Close', primary: true, onClick: closeOverlay }]);
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
    // Everything below comes from one exact trial of the season (if nothing more is played).
    const next = clone(s);
    const ev = apply(next, { type: 'end' }) ?? [];
    const fp = c.plant ? track(ev, i, c.plant.id, next.cells) : null;
    const fa = c.animal ? track(ev, i, c.animal.id, next.cells) : null;
    const parts: string[] = [];
    if (c.plant) parts.push(`<b>${SPECIES[c.plant.id].name}</b> ${dots(c.plant.n)}`);
    if (c.animal && fa) {
      const a = c.animal;
      const asleep = ANIMALS[a.id].hibernates && sea === 3;
      parts.push(`<b>${SPECIES[a.id].name}</b> ${dots(a.n)} ${asleep ? 'asleep' : this.foodTag(fa)}`);
    }
    if (parts.length) lines.push(`<div>${parts.join(' · ')}</div>`);
    lines.push(`<div>This season: ${this.forecast(c, next.cells[i], i, ev, fp, fa)}</div>`);
    return lines.join('');
  }

  /** Food in reach when the animal eats (after the plants grow and earlier animals act). */
  private foodTag(f: Fate): string {
    const tag = (x: { food: number; need: number }, word = 'food ') => `<span class="${x.food >= x.need ? 'good' : 'warn'}">${word}${x.food}/${x.need}</span>`;
    const [a, b] = f.feeds;
    if (!a) return '';
    if (b) return `${tag(a)} ${f.fled ? 'after fleeing' : 'here'}, ${tag(b, '')} where they move`;
    return `${tag(a)}${f.fled ? ' after fleeing' : ''}`;
  }

  /** What this season does to cell i, with reasons, from the trial's events and the tracked populations. */
  private forecast(c: Cell, n: Cell, i: number, ev: SimEvent[], fp: Fate | null, fa: Fate | null): string {
    const out: string[] = [];
    const good = (t: string) => out.push(`<span class="good">${t}</span>`);
    const bad = (t: string) => out.push(`<span class="warn">${t}</span>`);
    const p = c.plant;
    const crumbles = !!fp && p?.id === 'lichen' && !fp.alive && !fp.hits.length && !fp.shadedBy && n.t === 'soil';
    if (n.t !== c.t && !crumbles) out.push(`becomes ${TERRAIN_NAME[n.t].toLowerCase()}`);
    const sea = seasonOf(this.s.season);
    if (p && fp) {
      const last = fp.hits[fp.hits.length - 1];
      const by = fp.grazedBy.map(lower).join(', ');
      if (crumbles) good(`lichen crumbles the ${TERRAIN_NAME[c.t].toLowerCase()} into soil`);
      else if (fp.shadedBy) bad(`${say(fp.shadedBy, 'shades', 'shade')} out the ${lower(p.id)}`);
      else if (!fp.alive) bad(fate(p.id, last?.why, last?.by, true));
      else if (fp.n > p.n) good(say(p.id, 'grows', 'grow'));
      else if (fp.n < p.n) bad(last ? fate(p.id, last.why, last.by, false) : `${say(p.id, 'is', 'are')} grazed by ${by}`);
      else if (by) bad(`${say(p.id, 'is', 'are')} kept short by ${by}`);
      else if (p.n < 3 && !PLANTS[p.id].grows.includes(sea)) {
        const next = [1, 2, 3].map((k) => (sea + k) % 4).find((x) => PLANTS[p.id].grows.includes(x))!;
        out.push(`${say(p.id, 'rests', 'rest')} until ${SEASON_NAMES[next].toLowerCase()}`);
      }
      if (fp.alive && fp.young) good(`${say(p.id, 'spreads', 'spread')} to ${fp.young} cell${fp.young > 1 ? 's' : ''}`);
    }
    const q = n.plant;
    if (q && (!p || p.id !== q.id)) good(p ? say(q.id, 'takes root', 'take root') : say(q.id, 'spreads here', 'spread here'));
    const a = c.animal;
    if (a && fa) {
      const name = lower(a.id);
      if (fa.fled) bad(`${name} flee from the wolves`);
      if (fa.wandered) bad(`${name} move ${fa.fled ? 'on' : 'away'} to find food`);
      if (fa.hits.length) bad(fa.hits.map((h) => fate(a.id, h.why, h.by, h.die)).join(', then ') + (fa.alive ? '' : ' (none left)'));
      if (fa.alive && fa.grew) good(`${name} have young`);
      if (fa.young) good(`${name} send young out`);
    }
    const b = n.animal;
    // Newcomers: another animal (or this one's young) moving in, not the one that was here.
    const stayed = !!fa && fa.alive && fa.at === i;
    if (b && !stayed && ev.some((e) => (e.type === 'move' || e.type === 'spread') && e.to === i && e.id === b.id)) good(`${lower(b.id)} arrive`);
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
        <li>A species alive at the end of <b>${SETTLE_AFTER} seasons in a row</b> is <b>settled</b> and earns <b>+${SETTLED_BONUS}</b> every season after. If it dies out, its streak starts over, so keep the balance rather than replanting.</li>
        <li>Watch the weather: droughts dry the land, harsh winters starve animals, and summer lightning sets grown, bone-dry meadows alight, and animals caught in the fire die. The island shows which cells would burn; plants grazed that summer, seedlings, damp ground by ponds and marsh, and water don't burn, but sparks jump one-cell gaps.</li>
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
      const run = this.s.stats.streak[id] ?? 0;
      const settled = run >= SETTLE_AFTER ? ` <span style="color:var(--accent);font-weight:700">· settled</span>` : run > 0 ? ` <span style="color:var(--muted)">· ${run}/${SETTLE_AFTER} seasons</span>` : '';
      t.innerHTML = `<b>${d.name} <span style="color:var(--muted);font-weight:400">· ${d.kind}</span>${settled}</b>${needsText(id)}. ${d.text}${unlock}`;
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
    if (s.weather === 'fire') {
      const n = this.burnPlan.length;
      rows.push(
        `<p>The bolt in a dashed hex marks where lightning will strike${n ? `; flames mark the ${n} cell${n > 1 ? 's' : ''} that would burn as things stand` : ''}. The fire comes at the end of summer, after grazing, so you can still stop it: put rabbits or deer by a meadow (a plant grazed this summer won't burn), or plant into it. Sparks jump one-cell gaps, so a firebreak must be two cells wide, and animals caught in the fire die.</p>`,
      );
    } else if (weatherFor(s.seed, s.season + 1).weather === 'fire' && s.season + 1 < SEASONS) rows.push('<p>The faint bolt on the island marks where next season’s lightning will strike.</p>');
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
