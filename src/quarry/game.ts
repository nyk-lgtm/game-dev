// Quarry controller: draws the hex face as DOM tiles, turns a finger drag into
// a trail of tiles, plays words, animates tiles falling, runs the perk picks
// between depths, saves after every action, and keeps the profile and the daily.

import { closeOverlay, showCard } from '../shared/cards';
import { dailySeed, leaveDaily, loadDaily, recordDaily, todayKey } from '../shared/daily';
import { copyText, toast } from '../shared/debug';
import { randomSeed } from '../shared/rng';
import { reducedFx } from '../shared/settings';
import { makeStore } from '../shared/storage';
import {
  DEPTHS,
  DEPTH_NAMES,
  H,
  N,
  RULES_VERSION,
  SPARE_WORD,
  TARGETS,
  VALUES,
  W,
  WORDS,
  act,
  adjacent,
  col,
  depthReached,
  evaluate,
  face,
  has,
  isScore,
  perkDef,
  replay,
  row,
  spell,
  type Dict,
  type Outcome,
  type Run,
  type Score,
  type Tile,
} from './core';
import { Sounds } from './audio';

export const store = makeStore('quarry.');
const $ = (id: string) => document.getElementById(id)!;
const SQ3 = Math.sqrt(3);

interface Profile {
  runs: number;
  best: number;
  bestDepth: number;
  wins: number;
  bestWord: { word: string; points: number } | null;
}
const loadProfile = () => store.load<Profile>('profile', { runs: 0, best: 0, bestDepth: 0, wins: 0, bestWord: null });

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const fmt = (n: number) => n.toLocaleString('en-US');
const upper = (w: string) => w.toUpperCase();

export class Game {
  r!: Run;
  dict!: Dict;
  daily: string | null = null;
  private sfx = new Sounds();
  private path: number[] = [];
  private pointer = -1;
  private pickMode = false;
  /** Between a cleared depth (or the end) and its card: input waits. */
  private busy = false;
  /** Hex radius and the face's offset inside the stage. */
  private R = 36;
  private ox = 0;
  private oy = 0;
  /** Line under the word box when nothing is being traced. */
  private msg: string | null = null;
  private bannerTimer = 0;
  private els: HTMLElement[] = [];

  constructor() {
    const stage = $('stage');
    stage.addEventListener('pointerdown', (e) => this.down(e));
    stage.addEventListener('pointermove', (e) => this.move(e));
    stage.addEventListener('pointerup', (e) => this.up(e));
    stage.addEventListener('pointercancel', () => this.cancel());
    $('shakeBtn').onclick = () => this.shake();
    $('pickBtn').onclick = () => {
      this.sfx.unlock();
      if (this.busy || this.r.phase !== 'play' || this.r.picks <= 0) return;
      this.pickMode = !this.pickMode;
      this.msg = this.pickMode ? '⛏️ <b>Tap any tile</b> to knock it out. Tap ⛏️ again to cancel.' : null;
      this.render();
    };
    $('perkBar').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button');
      if (!b?.dataset.p) return;
      const p = perkDef(b.dataset.p as never);
      this.msg = `${p.icon} <b>${p.name}</b>: ${p.text}`;
      this.renderWord();
    });
    let size = '';
    new ResizeObserver(() =>
      requestAnimationFrame(() => {
        const now = `${stage.clientWidth}x${stage.clientHeight}`;
        if (now === size || !this.r) return;
        size = now;
        this.layout();
        this.renderBoard();
      }),
    ).observe(stage);
  }

  // ---------------------------------------------------------------- runs

  start(seed: number, actions: string[] = [], daily: string | null = null): void {
    closeOverlay();
    this.daily = daily;
    this.r = replay(seed, actions, this.dict);
    this.path = [];
    this.pickMode = false;
    this.busy = false;
    this.msg = null;
    this.save();
    this.layout();
    this.render(true);
    if (this.r.phase === 'over') this.showEnd();
    else if (this.r.phase === 'perk') this.showPerks();
    else this.announce();
  }

  newRun(): void {
    leaveDaily();
    this.start(randomSeed());
  }

  playDaily(): void {
    const day = todayKey();
    const saved = store.load<{ v: number; seed: number; a: string; day: string } | null>('dailyRun', null);
    const seed = dailySeed('quarry', day);
    if (saved && saved.v === RULES_VERSION && saved.day === day && saved.seed === seed) this.start(seed, saved.a ? saved.a.split(',') : [], day);
    else this.start(seed, [], day);
  }

  private save(): void {
    const data = { v: RULES_VERSION, seed: this.r.seed, a: this.r.actions.join(',') };
    if (this.daily) store.save('dailyRun', { ...data, day: this.daily });
    else store.save('run', data);
  }

  // ---------------------------------------------------------------- geometry

  private layout(): void {
    const s = $('stage');
    const w = s.clientWidth;
    const h = s.clientHeight;
    // Width: 1.5R per column plus half a hex at each side; height: √3R per row plus half a row.
    this.R = Math.max(18, Math.min((w - 12) / (1.5 * (W - 1) + 2), (h - 10) / (SQ3 * (H + 0.5)), 46));
    const R = this.R;
    this.ox = (w - R * (1.5 * (W - 1) + 2)) / 2 + R;
    this.oy = Math.max(4, (h - SQ3 * R * (H + 0.5)) / 2) + (SQ3 / 2) * R;
    const b = $('board');
    b.style.setProperty('--tw', `${2 * R * 0.95}px`);
    b.style.setProperty('--th', `${SQ3 * R * 0.95}px`);
    b.style.setProperty('--fs', `${R * 0.82}px`);
  }

  private center(i: number): { x: number; y: number } {
    const c = col(i);
    return { x: this.ox + 1.5 * this.R * c, y: this.oy + SQ3 * this.R * (row(i) + (c % 2 ? 0.5 : 0)) };
  }

  /** The cell under a stage point, if it's within `tol`·R of the cell's center. */
  private cellAt(x: number, y: number, tol: number): number {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < N; i++) {
      const c = this.center(i);
      const d = (c.x - x) ** 2 + (c.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return Math.sqrt(bd) <= tol * this.R ? best : -1;
  }

  private local(e: PointerEvent): { x: number; y: number } {
    const rect = $('stage').getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // ---------------------------------------------------------------- input

  private down(e: PointerEvent): void {
    this.sfx.unlock();
    if (this.busy || !this.r || this.r.phase !== 'play' || this.pointer !== -1) return;
    const p = this.local(e);
    const i = this.cellAt(p.x, p.y, 0.92);
    if (i < 0) return;
    if (this.pickMode) {
      this.pickMode = false;
      this.apply(`X${i}`);
      return;
    }
    if (this.r.board[i].rock) {
      this.msg = 'Rocks can’t be spelled with. Play a word <b>next to</b> one to break it.';
      this.nudge([i]);
      this.renderWord();
      return;
    }
    this.pointer = e.pointerId;
    try {
      $('stage').setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    this.path = [i];
    this.sfx.tick(1);
    this.renderTrail();
  }

  private move(e: PointerEvent): void {
    if (e.pointerId !== this.pointer || !this.path.length) return;
    const p = this.local(e);
    const i = this.cellAt(p.x, p.y, 0.74);
    if (i < 0) return;
    const path = this.path;
    const last = path[path.length - 1];
    if (i === last) return;
    if (path.length >= 2 && i === path[path.length - 2]) {
      path.pop();
      this.sfx.untick();
    } else if (!path.includes(i) && adjacent(last, i) && !this.r.board[i].rock && path.length < 8) {
      path.push(i);
      this.sfx.tick(path.length);
      navigator.vibrate?.(4);
    } else return;
    this.renderTrail();
  }

  private up(e: PointerEvent): void {
    if (e.pointerId !== this.pointer) return;
    this.pointer = -1;
    const path = this.path;
    this.path = [];
    if (path.length === 1) this.msg = 'Drag through <b>touching tiles</b> to spell a word, then lift your finger.';
    if (path.length >= 2) this.submit(path);
    else this.renderTrail();
  }

  private cancel(): void {
    this.pointer = -1;
    this.path = [];
    this.renderTrail();
  }

  private submit(path: number[]): void {
    const e = evaluate(this.r, path, this.dict);
    if (!isScore(e)) {
      this.sfx.nope();
      const text = path.map((i) => face(this.r.board[i])).join('');
      this.msg = e.error === 'short' ? 'Words need <b>3 letters</b> or more.' : `<b>${text}</b> isn’t in the word list.`;
      this.nudge(path);
      this.renderTrail();
      return;
    }
    this.apply(`W${path.join('.')}`, path);
  }

  private shake(): void {
    this.sfx.unlock();
    if (this.busy || this.r.phase !== 'play' || this.r.shakes <= 0) return;
    this.pickMode = false;
    this.apply('S');
  }

  /** Plays an action, saves, animates and redraws. */
  private apply(a: string, path: number[] = []): Outcome | null {
    const r = this.r;
    const before = new Map<number, number>();
    r.board.forEach((t, i) => before.set(t.id, i));
    const prev = r.board.slice();
    const pts = path.map((i) => this.center(i));
    const o = act(r, a, this.dict);
    if (!o) return null;
    this.save();
    this.effects(o, prev, pts);
    this.renderBoard(before);
    this.renderTrail();
    this.render();
    return o;
  }

  // ---------------------------------------------------------------- feedback

  private effects(o: Outcome, prev: Tile[], pts: { x: number; y: number }[]): void {
    const r = this.r;
    if (o.kind === 'word') {
      const s = o.score!;
      this.sfx.word(s.word.length);
      navigator.vibrate?.(s.word.length >= 6 ? [12, 30, 20] : 12);
      // The word's tiles lift away, glowing.
      o.path!.forEach((i, k) => this.ghost(prev[i], pts[k] ?? this.center(i), 'gone', k * 25));
      for (const i of o.blasted ?? []) this.ghost(prev[i], this.center(i), 'blasted', 60);
      for (const i of o.broken ?? []) this.ghost(prev[i], this.center(i), 'crumble', 40);
      if (o.broken?.length || o.cracked?.length) setTimeout(() => this.sfx.crack(), 80);
      if (o.blasted?.length) {
        const f = o.path!.find((i) => prev[i].fuse)!;
        this.boom(this.center(f));
        setTimeout(() => this.sfx.boom(), 40);
      }
      if (o.blown?.length) {
        for (const i of o.blown) this.ghost(prev[i], this.center(i), 'blasted', 250);
        const fuse = o.blown.find((i) => prev[i].fuse) ?? o.blown[0];
        setTimeout(() => (this.boom(this.center(fuse)), this.sfx.boom()), 250);
        navigator.vibrate?.([30, 40, 60]);
      }
      this.floatPts(`+${o.total}`);
      this.msg = this.resultLine(s, o);
      if (o.reshuffled) this.msg += ' <span class="warn">No words were left, so the face was shaken.</span>';
    } else if (o.kind === 'shake') {
      this.sfx.shake();
      this.msg = o.reshuffled ? 'Shaken (and again, for a face with words on it).' : `Shaken. ${plural(r.shakes, 'shake')} left on this depth.`;
    } else if (o.kind === 'pick') {
      this.sfx.crack();
      this.msg = 'Knocked out.';
    }
    if (o.cleared) {
      this.busy = true;
      setTimeout(() => this.sfx.clear(), 300);
      navigator.vibrate?.([30, 40, 30]);
      const name = DEPTH_NAMES[r.won ? DEPTHS - 1 : r.depth];
      this.banner(r.won ? 'Through the bedrock!' : `${name} cleared`, o.bonus ? `+${o.bonus} for ${plural(o.bonus / (SPARE_WORD * (r.depth + 1)), 'spare word')}` : 'Just made it');
    }
    if (o.over) {
      this.busy = true;
      this.recordEnd();
      setTimeout(() => this.sfx.over(r.won), r.won ? 700 : 350);
      setTimeout(() => ((this.busy = false), this.showEnd()), o.kind === 'quit' ? 100 : 1600);
    } else if (o.cleared) setTimeout(() => ((this.busy = false), this.showPerks(o)), 1600);
  }

  private resultLine(s: Score, o: Outcome): string {
    const bits = [`${s.base} × ${s.mult}`, ...s.extras];
    if (o.blastPts) bits.push(`+${o.blastPts} blast`);
    if (o.rockPts) bits.push(`+${o.rockPts} ${o.broken!.length === 1 ? 'rock' : 'rocks'}`);
    let line = `<b>${upper(s.word)}</b> +${o.total} <span class="dim">(${bits.join(' · ')})</span>`;
    if (o.lostWords) line += ` <span class="warn">A fuse blew: −${plural(o.lostWords, 'word')}.</span>`;
    return line;
  }

  /** Brief shake of some tiles (a miss). */
  private nudge(cells: number[]): void {
    if (reducedFx()) return;
    for (const i of cells) {
      const el = this.els[i];
      if (!el) continue;
      el.animate([{ translate: '0 0' }, { translate: '-5px 0' }, { translate: '5px 0' }, { translate: '-3px 0' }, { translate: '0 0' }], { duration: 300 });
    }
  }

  /** A copy of a tile at a stage point that animates away in the fx layer. */
  private ghost(t: Tile | undefined, at: { x: number; y: number }, kind: 'gone' | 'blasted' | 'crumble', delay: number): void {
    if (!t) return;
    const stage = $('stage').getBoundingClientRect();
    const b = $('board');
    const div = document.createElement('div');
    div.innerHTML = this.tileHtml(t, -1);
    const el = div.firstElementChild as HTMLElement;
    el.classList.add('ghost', kind === 'gone' ? 'ok' : kind);
    for (const v of ['--tw', '--th', '--fs']) el.style.setProperty(v, b.style.getPropertyValue(v));
    el.style.left = `${stage.left + at.x}px`;
    el.style.top = `${stage.top + at.y}px`;
    $('fx').appendChild(el);
    const quick = reducedFx();
    const frames: Keyframe[] =
      kind === 'gone'
        ? [{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(1.15)', opacity: 1, offset: 0.35 }, { transform: `translate(-50%,${quick ? -50 : -160}%) scale(0.5)`, opacity: 0 }]
        : kind === 'blasted'
          ? [{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: `translate(-50%,-50%) scale(${quick ? 1 : 1.5}) rotate(${quick ? 0 : 20}deg)`, opacity: 0 }]
          : [{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: `translate(-50%,${quick ? -50 : -10}%) scale(0.6) rotate(${quick ? 0 : -25}deg)`, opacity: 0 }];
    const anim = el.animate(frames, { duration: quick ? 180 : 420, delay: quick ? 0 : delay, easing: 'ease-out', fill: 'backwards' });
    anim.onfinish = anim.oncancel = () => el.remove();
  }

  private boom(at: { x: number; y: number }): void {
    if (reducedFx()) return;
    const stage = $('stage').getBoundingClientRect();
    const b = document.createElement('div');
    b.className = 'boom';
    b.style.left = `${stage.left + at.x}px`;
    b.style.top = `${stage.top + at.y}px`;
    $('fx').appendChild(b);
    b.animate([{ opacity: 1, transform: 'scale(0.3)' }, { opacity: 0, transform: 'scale(1.8)' }], { duration: 450, easing: 'ease-out' }).onfinish = () => b.remove();
  }

  private floatPts(text: string): void {
    const r = $('wordBox').getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'float';
    el.textContent = text;
    el.style.left = `${r.left + r.width / 2}px`;
    el.style.top = `${r.top + r.height / 2}px`;
    $('fx').appendChild(el);
    el.animate(
      [
        { opacity: 0, transform: 'translate(-50%, -20%) scale(0.8)' },
        { opacity: 1, transform: 'translate(-50%, -70%) scale(1.15)', offset: 0.2 },
        { opacity: 0, transform: 'translate(-50%, -150%) scale(1)' },
      ],
      { duration: 1000, easing: 'ease-out' },
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
    if (r.phase !== 'play' || r.played) return;
    this.banner(`Depth ${r.depth + 1} · ${DEPTH_NAMES[r.depth]}`, `${r.target} points in ${plural(r.wordsLeft, 'word')}`);
  }

  // ---------------------------------------------------------------- render

  render(drop = false): void {
    const r = this.r;
    $('depthNo').textContent = `${depthReached(r)}/${DEPTHS}`;
    $('wordsLeft').textContent = String(r.wordsLeft);
    $('wordsLeft').classList.toggle('low', r.phase === 'play' && r.wordsLeft <= 2);
    $('score').textContent = fmt(r.score);
    $('dailyTag').hidden = !this.daily;
    $('layer').textContent = `${DEPTH_NAMES[Math.min(r.depth, DEPTHS - 1)]}`;
    document.body.dataset.depth = String(r.depth);
    if (drop) this.renderBoard(new Map(), true);
    $('perkBar').innerHTML = r.perks
      .map((id) => `<button data-p="${id}" aria-label="${perkDef(id).name}">${perkDef(id).icon}</button>`)
      .join('');
    const shakeBtn = $('shakeBtn') as HTMLButtonElement;
    shakeBtn.disabled = r.shakes <= 0 || r.phase !== 'play';
    $('shakeN').textContent = String(r.shakes);
    const pick = $('pickBtn') as HTMLButtonElement;
    pick.hidden = !has(r, 'pick');
    pick.disabled = r.picks <= 0 || r.phase !== 'play';
    pick.classList.toggle('on', this.pickMode);
    $('pickN').textContent = String(r.picks);
    $('board').classList.toggle('picking', this.pickMode);
    this.renderGoal(0);
    this.renderWord();
  }

  private renderGoal(preview: number): void {
    const r = this.r;
    const done = r.phase !== 'play' && r.log.length > r.depth ? r.log[r.depth] : null;
    const got = done ? done.score : r.got;
    const target = done ? done.target : r.target;
    $('goalText').innerHTML = `<b>${fmt(got)}</b>${preview ? `<span class="pv"> +${preview}</span>` : ''} / ${fmt(target)}`;
    $('barFill').style.width = `${Math.min(100, (got / target) * 100)}%`;
    const el = $('barPrev');
    el.style.left = `${Math.min(100, (got / target) * 100)}%`;
    el.style.width = `${Math.max(0, Math.min(100 - (got / target) * 100, (preview / target) * 100))}%`;
    $('goal').classList.toggle('made', got + preview >= target);
  }

  private tileHtml(t: Tile, i: number, pos = ''): string {
    if (t.rock) return `<div class="tile rock${t.rock > 1 ? ' granite' : ''}" data-i="${i}" ${pos}><span class="cr"></span></div>`;
    const cls = ['tile', t.gold ? 'gold' : '', t.fuse ? 'fuse' : '', t.ch === '*' ? 'blank' : '', t.ch === 'q' ? 'qu' : ''].join(' ');
    const v = VALUES[t.ch] ?? 0;
    return `<div class="${cls}" data-i="${i}" ${pos}><b>${face(t)}</b>${t.ch === '*' ? '' : `<i>${v}</i>`}${t.fuse ? `<em class="${t.fuse === 1 ? 'hot' : ''}">${t.fuse}</em>` : ''}</div>`;
  }

  /**
   * Draws the face. `from` maps tile ids to the cells they were in, so moved tiles
   * slide from there and new ones drop in from above; `all` drops every tile in.
   */
  private renderBoard(from?: Map<number, number>, all = false): void {
    const r = this.r;
    const b = $('board');
    b.innerHTML = r.board
      .map((t, i) => {
        const c = this.center(i);
        return this.tileHtml(t, i, `style="left:${c.x.toFixed(1)}px;top:${c.y.toFixed(1)}px"`);
      })
      .join('');
    this.els = [...b.children] as HTMLElement[];
    this.renderTrail();
    if (!from) return;
    const quick = reducedFx();
    const rowH = SQ3 * this.R;
    const fresh = Array(W).fill(0);
    r.board.forEach((t, i) => {
      if (all || !from.has(t.id)) fresh[col(i)]++;
    });
    r.board.forEach((t, i) => {
      const el = this.els[i];
      const now = this.center(i);
      let dx = 0;
      let dy = 0;
      let delay = 0;
      if (!all && from.has(t.id)) {
        const was = this.center(from.get(t.id)!);
        dx = was.x - now.x;
        dy = was.y - now.y;
        if (!dx && !dy) return;
      } else {
        // New tiles start just above the face, stacked in their column.
        dy = -(fresh[col(i)] + 0.6) * rowH - (all ? (H - row(i)) * rowH * 0.15 : 0);
        delay = all ? col(i) * 30 : 60;
      }
      const dist = Math.hypot(dx, dy) / rowH;
      const dur = quick ? 140 : Math.min(620, 170 + 70 * Math.sqrt(dist) * 2);
      const frames: Keyframe[] = quick || dx
        ? [{ transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))` }, { transform: 'translate(-50%, -50%)' }]
        : [
            { transform: `translate(-50%, calc(-50% + ${dy}px))`, easing: 'cubic-bezier(.45,0,.9,.6)' },
            { transform: 'translate(-50%, calc(-50% + 4px))', offset: 0.82, easing: 'ease-out' },
            { transform: 'translate(-50%, -50%)' },
          ];
      el.animate(frames, { duration: dur, delay: quick ? 0 : delay, fill: 'backwards', easing: quick || dx ? 'cubic-bezier(.3,.7,.4,1)' : 'linear' });
    });
  }

  /** Selection marks, the trail line, the live word and the goal preview. */
  private renderTrail(): void {
    const path = this.path;
    const e = path.length ? evaluate(this.r, path, this.dict) : null;
    const ok = !!e && isScore(e);
    this.els.forEach((el, i) => {
      const on = path.includes(i);
      el.classList.toggle('sel', on);
      el.classList.toggle('ok', on && ok);
    });
    const line = $('trailLine');
    line.setAttribute(
      'points',
      path
        .map((i) => {
          const c = this.center(i);
          return `${c.x.toFixed(1)},${c.y.toFixed(1)}`;
        })
        .join(' '),
    );
    $('trail').classList.toggle('ok', ok);
    line.style.strokeWidth = `${this.R * 0.36}px`;
    this.renderGoal(ok ? (e as Score).points : 0);
    this.renderWord(e);
  }

  private renderWord(e: ReturnType<typeof evaluate> | null = null): void {
    const word = $('word');
    const sub = $('wordSub');
    const box = $('wordBox');
    const r = this.r;
    box.classList.remove('ok', 'bad', 'idle');
    if (this.path.length) {
      const letters = this.path.map((i) => face(r.board[i])).join('');
      if (e && isScore(e)) {
        box.classList.add('ok');
        word.textContent = upper(e.word);
        const bits = [`${e.base} × ${e.mult}`, ...e.extras];
        sub.innerHTML = `<b>+${e.points}</b> <span class="dim">${bits.join(' · ')}</span>`;
      } else {
        box.classList.add('bad');
        word.textContent = letters.toUpperCase();
        const n = this.path.map((i) => spell(r.board[i])).join('').length;
        sub.innerHTML = `<span class="dim">${n < 3 ? '3+ letters' : 'not a word (yet)'}</span>`;
      }
      return;
    }
    box.classList.add('idle');
    word.textContent = '';
    let html = this.msg;
    if (!html && r.phase === 'play') {
      const fuse = r.board.find((t) => t.fuse);
      if (r.depth === 0 && r.played === 0) html = 'Drag through <b>touching tiles</b> to spell a word (3+ letters). Lift to play it.';
      else if (fuse && fuse.fuse! <= 2) html = `🧨 Use the fuse in a word: it blows after <b>${plural(fuse.fuse!, 'more word')}</b> and costs you a word.`;
      else if (r.wordsLeft <= 2 && r.got < r.target) html = `<b>${fmt(r.target - r.got)}</b> to go in <b>${plural(r.wordsLeft, 'word')}</b>. Go long!`;
      else html = `${fmt(Math.max(0, r.target - r.got))} to go · ${plural(r.wordsLeft, 'word')} left`;
    }
    sub.innerHTML = html ?? '&nbsp;';
  }

  // ---------------------------------------------------------------- cards

  private strip(): string {
    const r = this.r;
    return `<div class="strip">${DEPTH_NAMES.map((n, d) => {
      const l = r.log[d];
      const cls = l ? (l.score >= l.target ? 'done' : 'fell') : d === r.depth && r.phase === 'play' ? 'now' : '';
      return `<span class="${cls}" title="${n}">${d + 1}</span>`;
    }).join('')}</div>`;
  }

  private showPerks(o?: Outcome): void {
    const r = this.r;
    if (r.phase !== 'perk') return;
    const next = r.depth + 1;
    const words = WORDS[next] + (has(r, 'shift') ? 1 : 0);
    const spare = o?.bonus ? ` +${o.bonus} for spare words.` : '';
    showCard(
      `<h2>${DEPTH_NAMES[r.depth]} cleared</h2>${this.strip()}
       <p>${fmt(r.log[r.depth].score)} of ${fmt(r.log[r.depth].target)} in ${plural(r.log[r.depth].words, 'word')}.${spare} Next: <b>${DEPTH_NAMES[next]}</b>, ${TARGETS[next]} points in ${words} words. Take a perk:</p>
       <div class="perks">${r.offer
         .map((id) => {
           const p = perkDef(id);
           return `<button class="perk" data-p="${id}"><span class="ic">${p.icon}</span><span><b>${p.name}</b><span class="t">${p.text}</span></span></button>`;
         })
         .join('')}</div>${r.perks.length ? `<p class="meta2">Yours: ${r.perks.map((p) => perkDef(p).icon).join(' ')}</p>` : ''}`,
      [],
      false,
    );
    document.querySelectorAll<HTMLElement>('#overlay .perk').forEach((b) => {
      b.onclick = () => {
        this.sfx.unlock();
        if (!act(this.r, `P${b.dataset.p}`, this.dict)) return;
        this.sfx.perk();
        this.save();
        closeOverlay();
        this.msg = null;
        this.render(true);
        this.announce();
      };
    });
  }

  private recordEnd(): void {
    const r = this.r;
    const p = loadProfile();
    p.runs++;
    p.best = Math.max(p.best, r.score);
    p.bestDepth = Math.max(p.bestDepth, depthReached(r));
    if (r.won) p.wins++;
    if (r.best && (!p.bestWord || r.best.points > p.bestWord.points)) p.bestWord = r.best;
    store.save('profile', p);
    if (this.daily) recordDaily(store, r.score, `${fmt(r.score)}${r.won ? ' ★' : ` · depth ${depthReached(r)}`}`, this.daily);
  }

  showEnd(): void {
    const r = this.r;
    const p = loadProfile();
    const daily = this.daily ? loadDaily(store) : null;
    const last = r.log[r.log.length - 1];
    const why = r.won
      ? 'All eight depths dug'
      : last && last.score < last.target
        ? `${DEPTH_NAMES[r.depth]}: ${fmt(last.score)} of ${fmt(last.target)}`
        : `Stopped on depth ${r.depth + 1}`;
    const perks = r.perks.map((id) => perkDef(id).icon).join(' ');
    showCard(
      `<h2>${r.won ? 'Through the bedrock!' : this.daily ? 'Daily dig over' : 'The seam ran out'}</h2>${this.strip()}
       <p class="big">${fmt(r.score)}</p>
       <p class="meta2">${why}${perks ? ` · ${perks}` : ''}</p>
       <p class="meta2">${plural(r.words, 'word')}${r.best ? ` · best <b>${upper(r.best.word)}</b> ${r.best.points}` : ''}${r.longest ? ` · longest <b>${upper(r.longest)}</b>` : ''}</p>
       ${daily ? `<p class="meta2">Today’s best: ${daily.label} · ${plural(daily.plays, 'try')}</p>` : p.runs ? `<p class="meta2">Best ${fmt(p.best)} · ${plural(p.runs, 'run')}${p.wins ? ` · ${plural(p.wins, 'win')}` : ''}</p>` : ''}`,
      [
        { label: 'New run', primary: true, onClick: () => this.newRun() },
        { label: this.daily ? 'Dig the daily again' : 'Same quarry again', onClick: () => this.start(this.r.seed, [], this.daily) },
        { label: 'All games', onClick: () => (location.href = '../') },
      ],
    );
  }

  showHelp(): void {
    store.save('seenHelp', true);
    showCard(
      `<h2>Quarry</h2>
       <p>Dig words out of a wall of letter stones, eight depths down.</p>
       <ul>
         <li><b>Drag through touching tiles</b> to spell a word of 3+ letters, then lift your finger. The tiles go and the ones above fall in.</li>
         <li>Points: <b>letter values × length</b> (3 letters ×1, 4 ×2, 5 ×3…). Long words pay.</li>
         <li>Reach each depth’s <b>target</b> before its words run out. Spare words pay a bonus, then you pick a <b>perk</b>.</li>
         <li><span class="chip gold">A</span> Gold doubles the word. <span class="chip rock"></span> Rocks break when you spell <b>beside</b> them. <span class="chip fuse">E<em>3</em></span> Use a fuse within its count: it blasts its neighbours for points. Left alone, it blows and <b>costs a word</b>.</li>
         <li>🌀 <b>Shake</b> jumbles the face, once per depth.</li>
       </ul>`,
      [{ label: 'Start digging', primary: true, onClick: closeOverlay }],
    );
  }

  showMenu(): void {
    const r = this.r;
    if (!r) return;
    const owned = r.perks.length
      ? `<div class="owned">${r.perks
          .map((id) => {
            const p = perkDef(id);
            return `<div>${p.icon} <b>${p.name}</b>: ${p.text}</div>`;
          })
          .join('')}</div>`
      : '<p>No perks yet: you take one after each depth.</p>';
    showCard(`<h2>Quarry${this.daily ? ' · daily' : ''}</h2>${this.strip()}${owned}`, [
      { label: 'Resume', primary: true, onClick: closeOverlay },
      { label: 'How to play', onClick: () => this.showHelp() },
      {
        label: 'New run',
        onClick: () =>
          showCard('<h2>New run?</h2><p>This dig will be lost.</p>', [
            { label: 'Keep digging', primary: true, onClick: closeOverlay },
            { label: 'New run', onClick: () => this.newRun() },
          ]),
      },
      { label: 'Copy bug report', onClick: () => this.copyReport() },
      { label: 'All games', onClick: () => (location.href = '../') },
    ]);
  }

  private async copyReport(): Promise<void> {
    toast((await copyText(`QUARRY v${RULES_VERSION} seed=${this.r.seed} a=${this.r.actions.join(',')}`)) ? 'Bug report copied' : 'Copy failed');
  }
}
