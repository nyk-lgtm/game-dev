// Rewild controller: owns the run (seed + actions), the hand, the island
// canvas and the panels. All rules live in core/; this file only asks
// questions of it and shows the answers.

import { Sfx } from '../afterglow/audio';
import { closeOverlay, showCard } from '../shared/cards';
import { copyText, toast } from '../shared/debug';
import { makeStore } from '../shared/storage';
import {
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
  seasonOf,
  starsFor,
  weatherFor,
  yearOf,
  type Action,
  type Cell,
  type GameState,
  type SimEvent,
  type SpeciesId,
  type Terrain,
  type Weather,
} from './core';
import { COLORS, drawIcon } from './render/art';
import { Board, iconCanvas, type Mark } from './render/board';

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

  start(seed: number, a = '', fromLink = false) {
    this.seed = seed;
    this.replayOnly = fromLink;
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
    this.refresh(false);
    this.queueBanner(`${SEASON_NAMES[seasonOf(this.s.season)]}, year ${yearOf(this.s.season)}`);
    if (this.s.over) setTimeout(() => this.showEnd(), 300);
  }

  private persist() {
    if (this.replayOnly) return;
    store.save('run', this.s.over ? null : { v: RULES_VERSION, seed: this.seed, a: this.actions.map(encode).join(',') });
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
    this.start((Math.random() * 0xffffffff) >>> 0);
    this.persist();
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
    const ev = this.act({ type: 'end' });
    if (!ev) return;
    this.sfx.click();
    this.card = -1;
    const keep = this.cell;
    this.cell = -1;
    this.refresh(true, ev);
    this.cell = keep;
    const log = this.s.log[this.s.log.length - 1];
    this.busyUntil = performance.now() + 900;
    document.body.classList.add('busy');
    setTimeout(() => {
      document.body.classList.remove('busy');
      this.render();
    }, 900);
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
    const now = this.now();
    this.board.set(this.s, this.wet, fade, now);
    if (ev.length) this.board.play(ev, now);
    this.board.fireAt = this.s.weather === 'fire' ? this.s.fireAt : -1;
    this.computeMarks();
    this.render();
  }

  private computeMarks() {
    this.marks = new Map();
    if (this.card >= 0 && this.s.hand[this.card]) {
      const id = this.s.hand[this.card];
      const base = clone(this.s);
      apply(base, { type: 'end' });
      const baseUnits = units(base, id);
      const start = SPECIES[id].kind === 'plant' ? PLANTS[id as keyof typeof PLANTS].start : ANIMALS[id as keyof typeof ANIMALS].start;
      for (let i = 0; i < this.s.cells.length; i++) {
        if (placeError(this.s, this.card, i) !== null) continue;
        const t = clone(this.s);
        apply(t, { type: 'place', card: this.card, cell: i });
        apply(t, { type: 'end' });
        const d = units(t, id) - baseUnits;
        this.marks.set(i, d >= start ? 'good' : d > 0 ? 'weak' : 'bad');
      }
    }
    this.board.marks = this.marks;
  }

  render() {
    const s = this.s;
    this.board.selected = this.cell;
    const season = Math.min(s.season, SEASONS - 1);
    $('when').textContent = s.over ? 'Done' : `${yearOf(season)} · ${SEASON_NAMES[seasonOf(season)]}`;
    $('score').textContent = String(s.score);
    const wb = $('weatherBtn');
    wb.innerHTML = `<span class="dot" style="background:${WEATHER_COLOR[s.weather]}"></span>${WEATHER_NAME[s.weather]}`;
    const done = s.goals.filter((g) => g.done).length;
    $('goalsCount').textContent = `★${done}/${s.goals.length}`;
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
      b.appendChild(iconCanvas(id, 56, (g, r) => drawIcon(g, r, r, r * 0.92, id)));
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
      const good = [...this.marks.values()].filter((m) => m === 'good').length;
      const weak = [...this.marks.values()].filter((m) => m === 'weak').length;
      const where =
        this.marks.size === 0
          ? `<span class="warn">Nowhere to put it yet.</span>`
          : good
            ? `<span class="good">${good} cells</span> where it will thrive${weak ? `, <span class="warn">${weak}</span> where it will struggle` : ''}.`
            : `<span class="warn">It would struggle anywhere right now.</span>`;
      info.innerHTML = `<div class="row"><span class="title">${SPECIES[id].name}</span><span class="tag">${needsText(id)}</span></div><div>${SPECIES[id].text}</div><div>${where}</div>`;
      return;
    }
    if (this.cell >= 0) {
      info.innerHTML = this.cellInfo(this.cell) + undo;
      $('undoBtn')?.addEventListener('click', () => this.undo());
      return;
    }
    const left = s.plays;
    const w = s.weather === 'fair' ? '' : `<div><b style="color:${WEATHER_COLOR[s.weather]}">${WEATHER_NAME[s.weather]}.</b> ${WEATHER_TEXT[s.weather].replace(/^[^:]*: /, '').replace(/^./, (ch) => ch.toUpperCase())}</div>`;
    info.innerHTML =
      `<div class="title">${left > 0 ? `Play up to ${left} more card${left > 1 ? 's' : ''}` : 'Ready for the season'}</div>` +
      w +
      `<div>${left > 0 ? 'Pick a card, then a glowing cell. Tap any cell to inspect it.' : 'End the season to watch the island grow.'}${undo}</div>`;
    $('undoBtn')?.addEventListener('click', () => this.undo());
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
    apply(next, { type: 'end' });
    const nc = next.cells[i];
    const parts: string[] = [];
    if (c.plant) parts.push(`<b>${SPECIES[c.plant.id].name}</b> ${dots(c.plant.n)}`);
    if (c.animal) {
      const a = c.animal;
      const need = needOf(a.id, a.n, s.weather, sea);
      const food = foodAt(s.cells, i, a.id, sea);
      parts.push(`<b>${SPECIES[a.id].name}</b> ${dots(a.n)} <span class="${food >= need ? 'good' : 'warn'}">food ${food}/${need}</span>`);
    }
    if (parts.length) lines.push(`<div>${parts.join(' · ')}</div>`);
    lines.push(`<div>Next season: ${this.forecast(c, nc)}</div>`);
    return lines.join('');
  }

  private forecast(c: Cell, n: Cell): string {
    const out: string[] = [];
    if (n.t !== c.t) out.push(`becomes ${TERRAIN_NAME[n.t].toLowerCase()}`);
    const pop = (a: { id: SpeciesId; n: number } | null, b: { id: SpeciesId; n: number } | null) => {
      if (a && (!b || b.id !== a.id)) out.push(`<span class="warn">${SPECIES[a.id].name.toLowerCase()} ${a.id === 'lichen' && n.t === 'soil' ? 'crumbles into soil' : 'gone'}</span>`);
      else if (a && b && b.n > a.n) out.push(`<span class="good">${SPECIES[a.id].name.toLowerCase()} grows</span>`);
      else if (a && b && b.n < a.n) out.push(`<span class="warn">${SPECIES[a.id].name.toLowerCase()} shrinks</span>`);
      if (b && (!a || a.id !== b.id)) out.push(`<span class="good">${SPECIES[b.id].name.toLowerCase()} arrives</span>`);
    };
    pop(c.plant, n.plant);
    pop(c.animal, n.animal);
    if (n.fert > c.fert && n.t === 'soil') out.push('richer soil');
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
        <li>Then <b>end the season</b>. Plants grow, spread and change the land; animals eat, breed, move or starve.</li>
        <li>Life changes the land: <b>lichen</b> turns rock into soil, <b>grass</b> and <b>fungi</b> enrich it, <b>reeds</b> silt shallows into marsh, <b>beavers</b> dam ponds. Wet ground lets flowers, shrubs and oaks take hold.</li>
        <li>Every season scores <b>species²/2 + life/5</b>: variety matters most. Hunters keep grazers in check; grazers left alone strip the land.</li>
        <li>Watch the weather: droughts dry the land, lightning starts wildfires in dry meadows, harsh winters starve animals.</li>
        <li>Tap any cell to see what lives there and what will happen to it next season.</li>
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
      const unlock = d.tier > this.s.tier ? ` <i>(arrives once ${UNLOCK[d.tier - 2].species} species live here)</i>` : '';
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

  private recordEnd() {
    if (this.replayOnly) return;
    const p = store.load<Profile>('profile', { best: 0, bestStars: 0, runs: 0 });
    p.runs++;
    p.best = Math.max(p.best, this.s.score);
    p.bestStars = Math.max(p.bestStars, starsFor(this.s.score));
    store.save('profile', p);
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
    showCard(
      `<h2>Five years on</h2>
      <div class="stars">${'★'.repeat(stars)}<span class="off">${'★'.repeat(3 - stars)}</span></div>
      <p>Score <b>${s.score}</b>${best ? ` · best ${best}` : ''}. ${species.size} species live on the island now; at its peak, ${s.stats.maxSpecies}.</p>
      <p style="font-size:12px">Stars at ${STARS.join(' / ')}.</p>
      <h3>Species, season by season</h3><div class="chart">${chart}</div>
      <h3>Goals</h3>${this.goalsHtml()}`,
      [
        { label: 'New island', primary: true, onClick: () => this.newIsland() },
        { label: 'Look at the island', onClick: closeOverlay },
        { label: 'Back to Game Lab', onClick: () => (location.href = '../') },
      ],
    );
  }

  async copyReport() {
    const a = this.actions.map(encode).join(',');
    const url = `${location.origin}${location.pathname}?seed=${this.seed}&a=${a || '-'}`;
    const text = `REWILD v${RULES_VERSION} seed=${this.seed} a=${a}\n${url}`;
    toast((await copyText(text)) ? 'Bug report copied' : 'Copy failed');
  }
}
