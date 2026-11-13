// Trestle controller: building by touch (drag peg to peg, tap to remove,
// pinch or the zoom button), undo/clear, test runs played live from the fixed-
// step sim, stars, the trail of levels, the daily, saves and cards.

import { closeOverlay, showCard } from '../shared/cards';
import { copyText, toast } from '../shared/debug';
import { dailySeed, leaveDaily, loadDaily, prettyDay, recordDaily, todayKey, wantsDaily } from '../shared/daily';
import { reducedFx } from '../shared/settings';
import { makeStore } from '../shared/storage';
import {
  COLS,
  DAILY_D,
  HZ,
  MATS,
  ROWS,
  RULES_VERSION,
  Sim,
  TUTORIALS,
  WON,
  addMember,
  addToken,
  costOf,
  delToken,
  lenOf,
  makeLevel,
  memberCost,
  pegs,
  pt,
  px,
  py,
  replayBuild,
  starsFor,
  trailLevel,
  whyNot,
  type Level,
  type Mat,
  type Member,
  type Outcome,
} from './core';
import { Sounds } from './audio';
import { clampView, drawLoupe, drawScene, fitView, matSvg, toWorld, type Scene, type Spark, type View } from './render/draw';

export const store = makeStore('trestle.');

const $ = (id: string) => document.getElementById(id)!;

interface Profile {
  /** Best stars and cheapest clearing cost per trail level. */
  stars: Record<string, number>;
  best: Record<string, number>;
  /** Highest level open (cleared + 1). */
  top: number;
  runs: number;
}
const loadProfile = (): Profile => ({ stars: {}, best: {}, top: 1, runs: 0, ...store.load<Partial<Profile>>('profile', {}) });

type Mode = 'trail' | 'daily' | 'link';

interface Press {
  id: number;
  x: number;
  y: number;
  kind: 'peg' | 'member' | 'pan' | 'none';
  peg: number;
  member: number;
  dragging: boolean;
  target: number;
  why: string | null;
  /** View when a pan started. */
  view: View | null;
}

const stars = (n: number) => `${'★'.repeat(n)}${'☆'.repeat(3 - n)}`;
const plural = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 's'}`;
const OUTCOME_TEXT: Record<Outcome, string> = {
  crossed: 'Made it across!',
  held: 'The lantern holds!',
  fell: 'The cart fell into the stream.',
  stalled: 'The cart got stuck. Is the road joined up all the way, and not too steep?',
  dropped: 'The lantern fell.',
  sagged: 'The lantern sagged out of its ring.',
  nohook: 'Put a peg on the ring first.',
};

export class Game {
  mode: Mode = 'trail';
  n = 1;
  day: string | null = null;
  level!: Level;
  a = '';
  members: Member[] = [];
  private undoDepth = 0;
  mat: Mat = 0;
  sim: Sim | null = null;
  /** Seconds since the run's outcome (−1 while undecided). */
  private after = -1;
  private finished = false;
  private hot: Map<string, number> | null = null;
  private canvas = $('board') as HTMLCanvasElement;
  private ctx = this.canvas.getContext('2d')!;
  private view!: View;
  private fit!: View;
  private zoomed = false;
  private press: Press | null = null;
  private touches = new Map<number, [number, number]>();
  private pinch: { d: number; cx: number; cy: number; view: View } | null = null;
  private finger: [number, number] | null = null;
  private time = 0;
  private last = 0;
  private acc = 0;
  private sparks: Spark[] = [];
  private seenBreaks = 0;
  private creakT = 0;
  private sounds = new Sounds();
  private fx = !reducedFx();
  private busy = false;
  private linkSeed = 0;
  private linkD = 0;

  constructor() {
    this.canvas.addEventListener('pointerdown', (e) => this.down(e));
    addEventListener('pointermove', (e) => this.move(e));
    addEventListener('pointerup', (e) => this.up(e));
    addEventListener('pointercancel', (e) => this.cancel(e));
    new ResizeObserver(() => this.resize()).observe(this.canvas);
    $('undoBtn').onclick = () => this.undo();
    $('clearBtn').onclick = () => this.askClear();
    $('zoomBtn').onclick = () => this.toggleZoom();
    $('goBtn').onclick = () => this.goButton();
    document.querySelectorAll<HTMLButtonElement>('#mats button').forEach((b) => {
      const m = Number(b.dataset.m) as Mat;
      b.querySelector('.ic')!.innerHTML = matSvg(m, 26);
      b.onclick = () => {
        this.mat = m;
        this.sounds.unlock();
        this.refresh();
      };
    });
    addEventListener('pointerdown', () => this.sounds.unlock(), { once: true });
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------------------------------------------------------------- levels

  /** Opens trail level n (generating and caching it if needed). */
  openTrail(n: number, actions?: string, link = false): void {
    closeOverlay();
    leaveDaily();
    if (!link) store.save('mode', 'trail');
    this.load(
      () => this.trailCached(n),
      (l) => {
        this.mode = link ? 'link' : 'trail';
        this.n = n;
        this.day = null;
        if (!link) store.save('n', n);
        const saved = store.load<{ v: number; a: string } | null>(`b${n}`, null);
        this.begin(l, actions ?? (saved && saved.v === RULES_VERSION ? saved.a : ''));
      },
    );
  }

  playDaily(): void {
    closeOverlay();
    const day = todayKey();
    store.save('mode', 'daily');
    if (!wantsDaily()) history.replaceState(null, '', `${location.pathname}?daily`);
    this.load(
      () => this.genCached(`gd${day}`, () => ({ ...makeLevel(dailySeed('trestle', day), DAILY_D), id: `d${day}` })),
      (l) => {
        this.mode = 'daily';
        this.day = day;
        const saved = store.load<{ v: number; day: string; a: string } | null>('dailyRun', null);
        this.begin(l, saved && saved.v === RULES_VERSION && saved.day === day ? saved.a : '');
      },
    );
  }

  /** A generated level straight from a seed (bug reports). */
  openSeed(seed: number, d: number, actions: string): void {
    closeOverlay();
    this.load(
      () => makeLevel(seed, d),
      (l) => {
        this.mode = 'link';
        this.linkSeed = seed;
        this.linkD = d;
        this.day = null;
        this.begin(l, actions);
      },
    );
  }

  resumeTrail(): void {
    const p = loadProfile();
    this.openTrail(Math.min(p.top, store.load<number>('n', p.top)));
  }

  private trailCached(n: number): Level {
    if (n <= TUTORIALS.length) return trailLevel(n);
    return this.genCached(`g${n}`, () => trailLevel(n));
  }

  private genCached(key: string, make: () => Level): Level {
    const c = store.load<{ v: number; l: Level } | null>(key, null);
    if (c && c.v === RULES_VERSION && c.l?.goal) return c.l;
    const l = make();
    store.save(key, { v: RULES_VERSION, l });
    return l;
  }

  /** Runs a (maybe slow) level maker after the "surveying" note has painted. */
  private load(make: () => Level, then: (l: Level) => void): void {
    if (this.busy) return;
    this.busy = true;
    this.info('<i>Surveying the gap…</i>');
    setTimeout(() => {
      try {
        then(make());
      } finally {
        this.busy = false;
      }
    }, 30);
  }

  private begin(l: Level, actions: string): void {
    this.level = l;
    this.a = actions;
    this.stopRun();
    this.hot = null;
    this.zoomed = false;
    this.rebuild();
    this.resize();
    this.info(this.intro());
    this.save();
  }

  private intro(): string {
    const l = this.level;
    const tip = l.tip ? `${l.tip} ` : l.goal.kind === 'cross' ? 'Get the cart over to the flag. ' : 'Hold the lantern up at the ring. ';
    return `${tip}<br><span class="th">${this.thresholds()}</span>`;
  }

  private thresholds(): string {
    const l = this.level;
    return `★ cost ≤ ${l.budget} · ★★ ≤ ${l.par} · ★★★ also ≤ ${plural(l.parParts, 'part')}`;
  }

  private save(): void {
    if (this.mode === 'trail') store.save(`b${this.n}`, { v: RULES_VERSION, a: this.a });
    else if (this.mode === 'daily') store.save('dailyRun', { v: RULES_VERSION, day: this.day, a: this.a });
  }

  // ---------------------------------------------------------------- building

  private rebuild(): void {
    const b = replayBuild(this.level, this.a);
    this.members = b.members;
    this.undoDepth = b.undo.length;
    this.refresh();
  }

  private act(tok: string): void {
    this.a += tok;
    this.hot = null;
    this.rebuild();
    this.save();
  }

  private undo(): void {
    if (this.sim) {
      if (!this.finished) return;
      this.stopRun();
    }
    if (!this.undoDepth) return;
    this.act('U');
    this.sounds.remove();
    this.info(this.intro());
  }

  private askClear(): void {
    if (this.sim) {
      if (!this.finished) return;
      this.stopRun();
    }
    if (!this.members.length) return;
    showCard('<h2>Clear the build?</h2><p>Everything you built comes down (Undo puts it back).</p>', [
      { label: 'Keep it', primary: true, onClick: closeOverlay },
      {
        label: 'Clear it',
        onClick: () => {
          closeOverlay();
          this.act('C');
          this.info(this.intro());
        },
      },
    ]);
  }

  private toggleZoom(): void {
    if (this.zoomed) {
      this.zoomed = false;
      this.view = this.fit;
    } else {
      this.zoomed = true;
      const g = this.level.goal;
      const [cx, cy] = g.kind === 'cross' ? [(px(g.from) + px(g.to)) / 2, py(g.from) + 0.5] : [px(g.ring) - 1, py(g.ring) + 0.5];
      const r = this.canvas.getBoundingClientRect();
      this.view = clampView(fitView(r.width, r.height, 1.7, cx, cy), this.fit);
    }
    this.refresh();
  }

  // ---------------------------------------------------------------- input

  private local(e: PointerEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  /** Nearest peg to a screen point (within reach of a finger), or −1. */
  private pegAt(X: number, Y: number): number {
    const [x, y] = toWorld(this.view, X, Y);
    const r = Math.max(22, this.view.s * 0.55) / this.view.s;
    let best = -1;
    let bd = r * r;
    for (const p of pegs(this.level, this.members)) {
      const d = (px(p) - x) ** 2 + (py(p) - y) ** 2;
      if (d < bd) (bd = d), (best = p);
    }
    return best;
  }

  /** Member closest to a screen point (within 14 px), or −1. */
  private memberAt(X: number, Y: number): number {
    const [x, y] = toWorld(this.view, X, Y);
    const lim = Math.max(14, this.view.s * 0.32) / this.view.s;
    let best = -1;
    let bd = lim;
    this.members.forEach((m, i) => {
      const ax = px(m.a), ay = py(m.a), bx = px(m.b), by = py(m.b);
      const ex = bx - ax, ey = by - ay;
      const t = ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey);
      // Only the middle of a piece: its ends are pegs.
      if (t < 0.12 || t > 0.88) return;
      const d = Math.hypot(x - (ax + ex * t), y - (ay + ey * t));
      if (d < bd) (bd = d), (best = i);
    });
    return best;
  }

  /** The grid point a drag from `from` lands on: nearest to the finger within the material's reach. */
  private targetFor(from: number, X: number, Y: number): number {
    const [x, y] = toWorld(this.view, X, Y);
    const max = MATS[this.mat].maxLen;
    let best = -1;
    let bd = Infinity;
    const fx = px(from), fy = py(from);
    for (let gy = Math.max(0, Math.floor(fy - max)); gy <= Math.min(ROWS - 1, Math.ceil(fy + max)); gy++)
      for (let gx = Math.max(0, Math.floor(fx - max)); gx <= Math.min(COLS - 1, Math.ceil(fx + max)); gx++) {
        const p = pt(gx, gy);
        if (p === from || lenOf(from, p) > max + 1e-9) continue;
        const d = (gx - x) ** 2 + (gy - y) ** 2;
        if (d < bd) (bd = d), (best = p);
      }
    return best;
  }

  private down(e: PointerEvent): void {
    if (!this.level || this.busy) return;
    this.sounds.unlock();
    const [X, Y] = this.local(e);
    this.touches.set(e.pointerId, [X, Y]);
    if (this.touches.size === 2) {
      // Pinch: drop whatever one finger was doing.
      this.press = null;
      this.finger = null;
      const [[x1, y1], [x2, y2]] = [...this.touches.values()];
      this.pinch = { d: Math.hypot(x2 - x1, y2 - y1), cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, view: this.view };
      this.draw();
      return;
    }
    if (this.touches.size > 2 || this.sim) {
      if (this.sim && this.finished) this.info(`${this.outcomeLine()} Tap <b>✎ Edit</b> to change the build.`);
      return;
    }
    const peg = this.pegAt(X, Y);
    const member = this.memberAt(X, Y);
    // A tap right on a peg is the peg; a tap along a piece (away from its pegs) is the piece.
    const dPeg = peg >= 0 ? Math.hypot((px(peg) - toWorld(this.view, X, Y)[0]) * this.view.s, (py(peg) - toWorld(this.view, X, Y)[1]) * this.view.s) : Infinity;
    const kind = member >= 0 && dPeg > 11 ? 'member' : peg >= 0 ? 'peg' : this.zoomed ? 'pan' : 'none';
    this.press = { id: e.pointerId, x: X, y: Y, kind, peg, member, dragging: false, target: -1, why: null, view: this.view };
    this.draw();
  }

  private move(e: PointerEvent): void {
    if (!this.touches.has(e.pointerId)) return;
    const [X, Y] = this.local(e);
    this.touches.set(e.pointerId, [X, Y]);
    if (this.pinch && this.touches.size >= 2) {
      const [[x1, y1], [x2, y2]] = [...this.touches.values()];
      const d = Math.hypot(x2 - x1, y2 - y1);
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const p = this.pinch;
      const s = Math.max(this.fit.s, Math.min(this.fit.s * 2.6, p.view.s * (d / Math.max(20, p.d))));
      // Keep the world point under the pinch centre under it.
      const wx = (p.cx - p.view.ox) / p.view.s;
      const wy = (p.cy - p.view.oy) / p.view.s;
      this.view = clampView({ ...p.view, s, ox: cx - wx * s, oy: cy - wy * s }, this.fit);
      this.zoomed = this.view.s > this.fit.s * 1.01;
      this.draw();
      return;
    }
    const pr = this.press;
    if (!pr || pr.id !== e.pointerId) return;
    if (!pr.dragging && Math.hypot(X - pr.x, Y - pr.y) < 9) return;
    // A drag that began on a piece next to a peg builds from that peg.
    if (!pr.dragging && pr.kind === 'member' && pr.peg >= 0) pr.kind = 'peg';
    pr.dragging = true;
    if (pr.kind === 'pan' && pr.view) {
      this.view = clampView({ ...pr.view, ox: pr.view.ox + X - pr.x, oy: pr.view.oy + Y - pr.y }, this.fit);
      this.draw();
      return;
    }
    if (pr.kind !== 'peg') return;
    this.finger = [X, Y];
    const t = this.targetFor(pr.peg, X, Y);
    if (t !== pr.target) {
      pr.target = t;
      pr.why = t < 0 ? 'nowhere' : whyNot(this.level, this.members, pr.peg, t, this.mat);
      if (t >= 0) navigator.vibrate?.(3);
      const len = t >= 0 ? lenOf(pr.peg, t) : 0;
      if (t < 0) this.info('');
      else if (pr.why) this.info(`<span class="bad">${pr.why}</span>`);
      else {
        const c = memberCost({ a: pr.peg, b: t, mat: this.mat });
        const total = costOf(this.members) + c;
        this.info(`<b>${MATS[this.mat].name}</b> ${len.toFixed(1)} long · <b>${c}</b> → cost ${total}/${this.level.budget}${total > this.level.budget ? ' <span class="bad">over budget</span>' : ''}`);
      }
    }
    this.draw();
  }

  private up(e: PointerEvent): void {
    this.touches.delete(e.pointerId);
    if (this.pinch) {
      if (this.touches.size < 2) this.pinch = null;
      this.press = null;
      return;
    }
    const pr = this.press;
    if (!pr || pr.id !== e.pointerId) return;
    this.press = null;
    this.finger = null;
    if (pr.kind === 'peg' && pr.dragging) {
      if (pr.target >= 0 && !pr.why) {
        const next = addMember(this.level, this.members, pr.peg, pr.target, this.mat);
        if (next) {
          this.act(addToken(pr.peg, pr.target, this.mat));
          this.sounds.place(this.mat);
          navigator.vibrate?.(8);
          this.info(this.costLine());
        } else this.info('That piece is already there.');
      } else if (pr.why && pr.why !== 'nowhere') toast(pr.why);
      this.draw();
      return;
    }
    if (pr.dragging) return;
    if (pr.kind === 'member') {
      const m = this.members[pr.member];
      this.act(delToken(m.a, m.b));
      this.sounds.remove();
      navigator.vibrate?.(6);
      this.info(`${MATS[m.mat].name} removed. ${this.costLine()}`);
    } else if (pr.kind === 'peg') this.info(`Drag from a peg to another point to add a <b>${MATS[this.mat].name.toLowerCase()}</b>. Tap a piece to remove it.`);
    else this.info(this.intro());
    this.draw();
  }

  private cancel(e: PointerEvent): void {
    this.touches.delete(e.pointerId);
    if (this.touches.size < 2) this.pinch = null;
    this.press = null;
    this.finger = null;
    this.draw();
  }

  private costLine(): string {
    const c = costOf(this.members);
    const over = c - this.level.budget;
    return `${plural(this.members.length, 'part')}, cost ${c}${over > 0 ? ` <span class="bad">${over} over budget</span>` : c <= this.level.par ? ' <span class="good">at par or under</span>' : ''}.`;
  }

  // ---------------------------------------------------------------- runs

  private goButton(): void {
    if (this.busy || !this.level) return;
    if (this.sim) {
      this.stopRun();
      this.info(this.hot ? `${this.lastOutcome ? `${OUTCOME_TEXT[this.lastOutcome]} ` : ''}Glowing pieces were close to snapping (red: snapped).` : this.intro());
      return;
    }
    if (!this.members.length) {
      this.info('Build something first: drag from a peg to another point.');
      return;
    }
    const g = this.level.goal;
    if (g.kind === 'reach' && !this.members.some((m) => m.a === g.ring || m.b === g.ring)) {
      this.info('<span class="bad">Put a peg on the ring first:</span> build out until a piece ends on it.');
      return;
    }
    this.sounds.go();
    this.a += 'G';
    this.save();
    this.sim = new Sim(this.level, this.members);
    this.after = -1;
    this.finished = false;
    this.acc = 0;
    this.seenBreaks = 0;
    this.sparks = [];
    const over = costOf(this.members) - this.level.budget;
    this.info(over > 0 ? `Test run: <span class="bad">${over} over budget</span>, so it can't earn stars.` : 'Here goes…');
    this.refresh();
  }

  private lastOutcome: Outcome | null = null;

  private stopRun(): void {
    if (this.sim) {
      const s = this.sim;
      this.hot = new Map(this.members.map((m, i) => [`${m.a}:${m.b}`, s.broken[i] ? 2 : s.peak[i]]));
      this.lastOutcome = s.outcome;
    }
    this.sim = null;
    this.finished = false;
    this.sparks = [];
    this.refresh();
  }

  private outcomeLine(): string {
    const o = this.sim?.outcome;
    return o ? OUTCOME_TEXT[o] : '';
  }

  private stepRun(dt: number): void {
    const s = this.sim!;
    this.acc += dt * HZ;
    let n = Math.min(40, Math.floor(this.acc));
    this.acc -= n;
    while (n-- > 0) s.step();
    if (s.breaks > this.seenBreaks) {
      for (let i = 0; i < s.broken.length; i++) {
        if (!s.broken[i] || s.brokeAt[i] < 0) continue;
        if (s.steps - s.brokeAt[i] > 60) continue;
        if (this.fx) {
          const x = (s.x[s.ma[i]] + s.x[s.mb[i]]) / 2;
          const y = (s.y[s.ma[i]] + s.y[s.mb[i]]) / 2;
          for (let k = 0; k < 10; k++)
            this.sparks.push({ x, y, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 3, life: 0.6 + Math.random() * 0.4, col: k % 2 ? '#ffcf8a' : '#c98a4a' });
        }
      }
      this.seenBreaks = s.breaks;
      this.sounds.snap();
      navigator.vibrate?.(30);
    }
    this.creakT -= dt;
    if (this.creakT <= 0) {
      let mx = 0;
      for (let i = 0; i < s.force.length; i++) if (!s.broken[i]) mx = Math.max(mx, Math.abs(s.force[i]) / MATS[this.members[i].mat].strength);
      if (mx > 0.8) {
        this.sounds.creak(mx);
        this.creakT = 0.5;
      }
    }
    if (s.outcome && this.after < 0) {
      this.after = 0;
      if (s.outcome === 'fell' || s.outcome === 'dropped') setTimeout(() => this.sounds.splash(), 500);
    }
    if (this.after >= 0) {
      this.after += dt;
      if (!this.finished && this.after > (WON.has(s.outcome!) ? 0.9 : 1.6)) this.finish();
    }
  }

  private finish(): void {
    const s = this.sim!;
    this.finished = true;
    const won = WON.has(s.outcome!);
    const cost = costOf(this.members);
    const parts = this.members.length;
    const st = won ? starsFor(this.level, cost, parts) : 0;
    const prof = loadProfile();
    prof.runs++;
    store.save('profile', prof);
    if (!won) {
      this.sounds.fail();
      this.info(`<span class="bad">${OUTCOME_TEXT[s.outcome!]}</span>${s.breaks ? ` ${plural(s.breaks, 'piece')} snapped (red stubs).` : ''} Tap <b>✎ Edit</b> to fix it: pieces near snapping will glow.`);
      this.refresh();
      return;
    }
    this.sounds.win(st);
    navigator.vibrate?.([20, 60, 30]);
    let improved = false;
    if (this.mode === 'trail' && st > 0) {
      const k = String(this.n);
      improved = st > (prof.stars[k] ?? 0) || cost < (prof.best[k] ?? Infinity);
      prof.stars[k] = Math.max(prof.stars[k] ?? 0, st);
      prof.best[k] = Math.min(prof.best[k] ?? Infinity, cost);
      prof.top = Math.max(prof.top, this.n + 1);
      store.save('profile', prof);
    }
    let dailyLine = '';
    if (this.mode === 'daily' && st > 0 && this.day) {
      const r = recordDaily(store, st * 1000 + Math.max(0, 999 - cost), `${'★'.repeat(st)} ${cost}`, this.day);
      dailyLine = `<p><b style="color:var(--gold)">Daily · ${prettyDay(this.day)}</b><br>Today's best: ${r.best.label}${r.improved ? ' (new best!)' : ''}</p>`;
    }
    this.info(`<span class="good">${OUTCOME_TEXT[s.outcome!]}</span> ${st ? stars(st) : '<span class="bad">over budget</span>'} · cost ${cost}`);
    this.refresh();
    const l = this.level;
    const why =
      st === 0
        ? `<p>It works, but it costs <b>${cost}</b> and the budget is <b>${l.budget}</b>. Trim it to earn stars.</p>`
        : `<p>Cost <b>${cost}</b> of ${l.budget} · ${plural(parts, 'part')}.</p><p class="th">${st < 2 ? `★★ needs a cost of ${l.par} or less.` : st < 3 ? `★★★ needs ${plural(l.parParts, 'part')} or fewer at that cost.` : 'As lean as the surveyor’s own build, or leaner.'}</p>`;
    setTimeout(() => {
      if (!this.sim || !this.finished) return;
      const next = this.mode === 'trail' && st > 0;
      showCard(
        `<h2>${s.outcome === 'held' ? 'It holds!' : 'Across!'} <span class="stars">${stars(st)}</span></h2>${why}${dailyLine}${improved && this.mode === 'trail' ? '<p>Saved as your best for this level.</p>' : ''}`,
        [
          next ? { label: `Next: level ${this.n + 1}`, primary: true, onClick: () => this.openTrail(this.n + 1) } : this.mode === 'daily' ? { label: 'Back to the trail', primary: true, onClick: () => this.resumeTrail() } : { label: 'Improve it', primary: true, onClick: () => this.editAfterWin() },
          ...(next || this.mode === 'daily' ? [{ label: 'Improve it', onClick: () => this.editAfterWin() }] : []),
          { label: 'Watch again', onClick: () => this.replayRun() },
          { label: 'All levels', onClick: () => this.showLevels() },
        ],
      );
    }, 400);
  }

  private editAfterWin(): void {
    closeOverlay();
    this.stopRun();
    this.info(this.intro());
  }

  private replayRun(): void {
    closeOverlay();
    this.sim = null;
    this.a = this.a.replace(/G$/, '');
    this.goButton();
  }

  // ---------------------------------------------------------------- drawing

  refresh(): void {
    if (!this.level) return;
    const l = this.level;
    $('levelLabel').textContent = this.mode === 'daily' ? 'Daily' : this.mode === 'link' ? 'Shared' : `Level ${this.n}`;
    $('levelName').textContent = l.name;
    const c = costOf(this.members);
    const cost = $('cost');
    cost.innerHTML = `${c}<small>/${l.budget}</small>`;
    cost.className = `value ${c > l.budget ? 'over' : c <= l.par && c > 0 ? 'par' : ''}`;
    const prof = loadProfile();
    $('best').textContent = this.mode === 'trail' ? stars(prof.stars[String(this.n)] ?? 0) : this.mode === 'daily' ? (loadDaily(store, this.day ?? todayKey())?.label.split(' ')[0] ?? '☆☆☆') : '';
    ($('best').parentElement as HTMLElement).hidden = this.mode === 'link';
    document.querySelectorAll<HTMLButtonElement>('#mats button').forEach((b) => b.classList.toggle('on', Number(b.dataset.m) === this.mat));
    const running = !!this.sim;
    ($('undoBtn') as HTMLButtonElement).disabled = (running && !this.finished) || (!running && !this.undoDepth);
    ($('clearBtn') as HTMLButtonElement).disabled = (running && !this.finished) || (!running && !this.members.length);
    $('goBtn').textContent = running ? (this.finished ? '✎ Edit' : '■ Stop') : '▶ Go';
    $('goBtn').classList.toggle('stop', running);
    $('zoomBtn').textContent = this.zoomed ? '⤡' : '⤢';
    this.draw();
  }

  private info(html: string): void {
    $('info').innerHTML = html;
  }

  private resize(): void {
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.fit = fitView(w, h);
    if (!this.zoomed || !this.view) this.view = this.fit;
    else this.view = clampView({ ...this.view, w, h }, this.fit);
    this.draw();
  }

  private scene(): Scene {
    const pr = this.press;
    return {
      level: this.level,
      members: this.members,
      sim: this.sim,
      ghost: pr && pr.kind === 'peg' && pr.dragging && pr.target >= 0 ? { a: pr.peg, b: pr.target, mat: this.mat, ok: !pr.why } : null,
      hot: this.hot,
      pressed: pr && pr.kind === 'member' && !pr.dragging ? pr.member : -1,
      from: pr && pr.kind === 'peg' ? pr.peg : -1,
      time: this.time,
      sparks: this.sparks,
      grid: !this.sim,
    };
  }

  private draw(): void {
    if (!this.level || !this.view) return;
    const ctx = this.ctx;
    const sc = this.scene();
    drawScene(ctx, this.view, sc);
    if (this.finger && sc.ghost) drawLoupe(ctx, this.view, sc, this.finger[0], this.finger[1]);
  }

  private frame(t: number): void {
    const dt = Math.min(0.05, (t - (this.last || t)) / 1000);
    this.last = t;
    this.time += dt;
    if (this.sim) this.stepRun(dt);
    for (const p of this.sparks) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 10 * dt;
      p.life -= dt;
    }
    this.sparks = this.sparks.filter((p) => p.life > 0);
    this.draw();
    requestAnimationFrame((tt) => this.frame(tt));
  }

  // ---------------------------------------------------------------- cards

  showHelp(): void {
    store.save('seenHelp', true);
    showCard(
      `<h2>Trestle</h2>
      <p>Help the beetle haul its acorn cart over the stream, or hang a lantern where the path needs light, with a few sticks and some string.</p>
      <ul>
        <li><b>Drag from a peg</b> to another point to add a piece. The gold rings are fixed to the rock; every piece you add makes new pegs. A magnifier shows where it lands.</li>
        <li>${matSvg(0, 20)} <b>Planks</b> are the road: the cart only rolls on planks (and rock). ${matSvg(1, 20)} <b>Twigs</b> push and pull. ${matSvg(2, 20)} <b>Twine</b> is cheap and reaches far, but only pulls.</li>
        <li>Pegs bend freely, so a lone row of planks sags: brace it into <b>triangles</b>.</li>
        <li><b>Tap a piece</b> to remove it. Pinch or ⤢ to zoom. Undo takes back anything.</li>
        <li><b>▶ Go</b> runs a test: pieces turn yellow, then red as they strain, and snap past their limit.</li>
        <li>★ clear it within the budget, ★★ at the surveyor's cost (par) or less, ★★★ also with no more parts than the surveyor.</li>
      </ul>`,
      [{ label: 'Build', primary: true, onClick: closeOverlay }],
    );
  }

  showLevels(): void {
    const prof = loadProfile();
    const max = Math.max(prof.top, this.mode === 'trail' ? this.n : 1);
    const cells: string[] = [];
    for (let n = 1; n <= max; n++) {
      const st = prof.stars[String(n)] ?? 0;
      cells.push(`<button class="lv${n === this.n && this.mode === 'trail' ? ' cur' : ''}${n <= TUTORIALS.length ? ' tut' : ''}" data-n="${n}"><b>${n}</b><span>${st ? stars(st) : n === prof.top ? 'new' : '☆☆☆'}</span></button>`);
    }
    const total = Object.values(prof.stars).reduce((a, b) => a + b, 0);
    const d = loadDaily(store, todayKey());
    showCard(
      `<h2>The trail</h2><p>${plural(total, 'star')} so far. Clear a level to open the next; the first six teach the tricks.</p><div class="levels">${cells.join('')}</div>`,
      [
        { label: `Daily level${d ? ` (${d.label})` : ''}`, onClick: () => this.playDaily() },
        { label: 'Close', primary: true, onClick: closeOverlay },
      ],
    );
    document.querySelectorAll<HTMLButtonElement>('#overlay .levels button').forEach((b) => {
      b.onclick = () => this.openTrail(Number(b.dataset.n));
    });
    document.querySelector('#overlay .levels .cur')?.scrollIntoView({ block: 'center' });
  }

  showMenu(): void {
    const d = loadDaily(store, todayKey());
    const where = this.mode === 'daily' ? `Daily level · ${prettyDay(this.day ?? todayKey())}` : this.mode === 'link' ? 'A shared build' : `Level ${this.n}: ${this.level?.name ?? ''}`;
    showCard(`<h2>Trestle</h2><p>${where}</p>`, [
      { label: 'Resume', primary: true, onClick: closeOverlay },
      { label: 'All levels', onClick: () => this.showLevels() },
      this.mode !== 'trail' ? { label: 'Back to the trail', onClick: () => this.resumeTrail() } : { label: `Daily level${d ? ` (${d.label})` : ''}`, onClick: () => this.playDaily() },
      { label: 'Clear the build', onClick: () => (closeOverlay(), this.askClear()) },
      { label: 'How to play', onClick: () => this.showHelp() },
      { label: 'Copy bug report', onClick: () => this.copyReport() },
      { label: 'All games', onClick: () => (location.href = '../') },
    ]);
  }

  private async copyReport(): Promise<void> {
    const a = this.a;
    const where =
      this.mode === 'trail'
        ? `lv=${this.n}`
        : this.mode === 'daily'
          ? `seed=${dailySeed('trestle', this.day ?? todayKey())}&d=${DAILY_D}`
          : this.linkSeed
            ? `seed=${this.linkSeed}&d=${this.linkD}`
            : `lv=${this.n}`;
    const text = `TRESTLE v${RULES_VERSION} ${where.replace('&', ' ')} a=${a}\n${location.origin}${location.pathname}?${where}&a=${encodeURIComponent(a)}`;
    toast((await copyText(text)) ? 'Bug report copied' : 'Copy failed');
  }
}
