// Trestle controller: building by touch (drag peg to peg, tap a piece to pick
// it and again to remove it, pinch or the zoom button), undo/clear, test runs
// played live from the fixed-step sim, failure diagnosis, stars, the trail of
// levels (generated in a worker, the next one ahead of time), the daily,
// saves and cards.

import { closeOverlay, showCard } from '../shared/cards';
import { copyText, toast } from '../shared/debug';
import { dailySeed, leaveDaily, loadDaily, prettyDay, recordDaily, todayKey, wantsDaily } from '../shared/daily';
import { loadSettings, reducedFx } from '../shared/settings';
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
  explain,
  joined,
  lenOf,
  seedLevel,
  memberCost,
  pegs,
  pt,
  px,
  py,
  replayBuild,
  ringsOf,
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
import type { GenJob, GenSpec } from './gen.worker';

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
  clamped: boolean;
  why: string | null;
  /** View when a pan started. */
  view: View | null;
}

/** What a failed run left behind, kept per level so a reload shows it again. */
interface Debrief {
  v: number;
  /** The build's actions (test runs left out) it applies to. */
  a: string;
  text: string;
  hot: [string, number][];
  wobbly: number[];
}

const stars = (n: number) => `${'★'.repeat(n)}${'☆'.repeat(3 - n)}`;
const plural = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 's'}`;
const OUTCOME_TEXT: Record<Outcome, string> = {
  crossed: 'Made it across!',
  held: 'The lantern holds!',
  fell: 'The cart fell into the stream.',
  stalled: 'The cart got stuck.',
  dropped: 'The lantern fell.',
  sagged: 'The lantern sagged out of its ring.',
  nohook: 'Put a peg on the ring first.',
};
const MAXLEN = ['2.2', '2.2', '4.5'];
const builtOnly = (a: string) => a.replace(/G/g, '');

/** A short buzz, only when vibration is on and the page has had a tap (Chrome blocks it before). */
function buzz(p: number | number[]): void {
  try {
    if (!loadSettings().vibrate) return;
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (ua && !ua.hasBeenActive) return;
    navigator.vibrate?.(p);
  } catch {
    // no vibration here
  }
}

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
  private wobbly: Set<number> | null = null;
  private debrief: string | null = null;
  /** Piece picked for removal (−1 none). */
  private selected = -1;
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
  private worker: Worker | null = null;
  private jobs = new Map<number, (l: Level | null) => void>();
  private jobId = 0;
  /** Cache keys being generated (so a prefetch and a visit share one job). */
  private pending = new Map<string, Promise<Level>>();

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
      b.querySelector('.pr')!.textContent = `${MATS[m].cost}/u · ≤${MAXLEN[m]}`;
      b.querySelector('.st')!.textContent = `${MATS[m].rope ? 'pull' : 'holds'} ${MATS[m].strength}`;
      b.onclick = () => {
        this.mat = m;
        this.sounds.unlock();
        this.refresh();
      };
    });
    $('info').addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('#removeBtn')) this.removeSelected();
    });
    addEventListener('pointerdown', () => this.sounds.unlock(), { once: true });
    try {
      this.worker = new Worker(new URL('./gen.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<{ id: number; level: Level | null }>) => {
        const done = this.jobs.get(e.data.id);
        this.jobs.delete(e.data.id);
        done?.(e.data.level);
      };
      this.worker.onerror = () => {
        // Fall back to generating on the page.
        this.worker = null;
        for (const done of this.jobs.values()) done(null);
        this.jobs.clear();
      };
    } catch {
      this.worker = null;
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------------------------------------------------------------- levels

  /** Opens trail level n (generating and caching it if needed). */
  openTrail(n: number, actions?: string, link = false): void {
    closeOverlay();
    leaveDaily();
    if (!link) store.save('mode', 'trail');
    this.load(
      this.trailLevelAsync(n),
      (l) => {
        this.mode = link ? 'link' : 'trail';
        this.n = n;
        this.day = null;
        if (!link) store.save('n', n);
        const saved = store.load<{ v: number; a: string } | null>(`b${n}`, null);
        this.begin(l, actions ?? (saved && saved.v === RULES_VERSION ? saved.a : ''));
        // Survey the next level while this one is played.
        if (!link) this.prefetch(n + 1);
      },
    );
  }

  playDaily(): void {
    closeOverlay();
    const day = todayKey();
    store.save('mode', 'daily');
    if (!wantsDaily()) history.replaceState(null, '', `${location.pathname}?daily`);
    this.load(this.cached(`gd${day}`, { kind: 'seed', seed: dailySeed('trestle', day), d: DAILY_D, levelId: `d${day}`, daily: true }), (l) => {
      this.mode = 'daily';
      this.day = day;
      const saved = store.load<{ v: number; day: string; a: string } | null>('dailyRun', null);
      this.begin(l, saved && saved.v === RULES_VERSION && saved.day === day ? saved.a : '');
    });
  }

  /** A generated level straight from a seed (bug reports). */
  openSeed(seed: number, d: number, actions: string): void {
    closeOverlay();
    this.load(this.generate({ kind: 'seed', seed, d, levelId: `s${seed}` }), (l) => {
      this.mode = 'link';
      this.linkSeed = seed;
      this.linkD = d;
      this.day = null;
      this.begin(l, actions);
    });
  }

  resumeTrail(): void {
    const p = loadProfile();
    this.openTrail(Math.min(p.top, store.load<number>('n', p.top)));
  }

  private trailLevelAsync(n: number): Promise<Level> {
    if (n <= TUTORIALS.length) return Promise.resolve(trailLevel(n));
    return this.cached(`g${n}`, { kind: 'trail', n });
  }

  private prefetch(n: number): void {
    if (n <= TUTORIALS.length || !this.worker) return;
    const go = () => void this.trailLevelAsync(n).catch(() => undefined);
    const idle = (window as Window & { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback;
    if (idle) idle(go);
    else setTimeout(go, 500);
  }

  /** A cached generated level, or a worker job that fills the cache. */
  private cached(key: string, job: GenSpec): Promise<Level> {
    const c = store.load<{ v: number; l: Level } | null>(key, null);
    if (c && c.v === RULES_VERSION && c.l?.goal) return Promise.resolve(c.l);
    const p = this.pending.get(key);
    if (p) return p;
    const q = this.generate(job).then((l) => {
      store.save(key, { v: RULES_VERSION, l });
      this.pending.delete(key);
      return l;
    });
    this.pending.set(key, q);
    return q;
  }

  private generate(job: GenSpec): Promise<Level> {
    const local = () => (job.kind === 'trail' ? trailLevel(job.n) : seedLevel(job.seed, job.d, job.levelId, job.daily));
    const w = this.worker;
    if (!w) return new Promise((res) => setTimeout(() => res(local()), 30));
    return new Promise((res) => {
      const id = ++this.jobId;
      this.jobs.set(id, (l) => res(l ?? local()));
      w.postMessage({ ...job, id } as GenJob);
    });
  }

  /** Waits for a level with a "surveying" screen up. */
  private load(p: Promise<Level>, then: (l: Level) => void): void {
    if (this.busy) return;
    this.busy = true;
    const t = setTimeout(() => {
      $('loading').hidden = false;
      this.info('<i>Surveying the gap…</i>');
    }, 60);
    p.then((l) => {
      clearTimeout(t);
      $('loading').hidden = true;
      this.busy = false;
      then(l);
    }).catch((err) => {
      clearTimeout(t);
      $('loading').hidden = true;
      this.busy = false;
      toast(`Couldn't make that level: ${String(err)}`);
    });
  }

  private begin(l: Level, actions: string): void {
    this.level = l;
    this.a = actions;
    this.sim = null;
    this.finished = false;
    this.sparks = [];
    this.selected = -1;
    this.zoomed = false;
    this.rebuild();
    this.restoreDebrief();
    this.resize();
    this.info(this.debrief ?? this.intro());
    this.save();
  }

  private intro(): string {
    const l = this.level;
    const many = ringsOf(l).length > 1;
    const tip = l.tip ? `${l.tip} ` : l.goal.kind === 'cross' ? 'Get the cart over to the flag. ' : `Hold the lantern${many ? 's' : ''} up at the ring${many ? 's' : ''}. `;
    return `${tip}<br><span class="th">${this.thresholds()}</span>`;
  }

  private thresholds(): string {
    const l = this.level;
    return `★ cost ≤ ${l.budget} · ★★ ≤ ${l.par} · ★★★ also ≤ ${plural(l.parParts, 'part')}`;
  }

  private debriefKey(): string | null {
    return this.mode === 'trail' ? `f${this.n}` : this.mode === 'daily' ? `fd${this.day}` : null;
  }

  private restoreDebrief(): void {
    this.hot = null;
    this.wobbly = null;
    this.debrief = null;
    const k = this.debriefKey();
    if (!k) return;
    const d = store.load<Debrief | null>(k, null);
    if (!d || d.v !== RULES_VERSION || d.a !== builtOnly(this.a)) return;
    this.hot = new Map(d.hot);
    this.wobbly = d.wobbly.length ? new Set(d.wobbly) : null;
    this.debrief = d.text;
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
    this.wobbly = null;
    this.debrief = null;
    this.selected = -1;
    this.rebuild();
    this.save();
  }

  /** Leaves a finished run for the editor (Undo/Clear after a run do this first). */
  private leaveRun(): boolean {
    if (!this.sim) return true;
    if (!this.finished) return false;
    this.stopRun();
    return true;
  }

  private undo(): void {
    if (!this.leaveRun() || !this.undoDepth) return;
    this.act('U');
    this.sounds.remove();
    this.info(this.costLine());
  }

  private askClear(): void {
    if (!this.leaveRun() || !this.members.length) return;
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
    if (!this.level) return;
    if (this.zoomed) {
      this.zoomed = false;
      this.view = this.fit;
    } else {
      // Zoom to everything that matters (anchors, pegs, rings, road ends) with a margin, so no peg is cut off.
      const l = this.level;
      const pts = [...l.anchors, ...pegs(l, this.members), ...ringsOf(l)];
      const xs = pts.map(px);
      const ys = pts.map(py);
      if (l.goal.kind === 'cross') xs.push(l.goal.startX - 0.6, l.goal.goalX + 0.4), ys.push(l.goal.startY - 1);
      const [x0, x1, y0, y1] = [Math.min(...xs) - 0.8, Math.max(...xs) + 0.8, Math.min(...ys) - 1, Math.max(...ys) + 1];
      const r = this.canvas.getBoundingClientRect();
      const z = Math.min(2.4, r.width / ((x1 - x0) * this.fit.s), r.height / ((y1 - y0) * this.fit.s));
      if (z < 1.08) {
        toast('Everything is already in view: pinch to look closer');
        return;
      }
      this.zoomed = true;
      this.view = clampView(fitView(r.width, r.height, z, (x0 + x1) / 2, (y0 + y1) / 2), this.fit);
    }
    this.refresh();
  }

  private removeSelected(): void {
    const m = this.members[this.selected];
    if (!m) return;
    this.act(delToken(m.a, m.b));
    this.sounds.remove();
    buzz(6);
    this.info(`${MATS[m.mat].name} removed (Undo puts it back). ${this.costLine()}`);
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

  /** Member whose middle part is closest to a screen point (within ~14 px), or −1. */
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

  /** Where a drag from `from` lands: the grid point nearest the finger within the material's reach. */
  private targetFor(from: number, X: number, Y: number): { p: number; clamped: boolean } {
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
    // Past the reach: the finger is further than half a step beyond the nearest point in reach.
    return { p: best, clamped: Math.hypot(x - fx, y - fy) > max + 0.25 && bd > 0.3 };
  }

  private down(e: PointerEvent): void {
    if (!this.level || this.busy) return;
    this.sounds.unlock();
    const [X, Y] = this.local(e);
    this.touches.set(e.pointerId, [X, Y]);
    if (this.touches.size === 2) {
      // Two fingers: pinch to zoom and pan together; drop whatever one finger was doing.
      this.press = null;
      this.finger = null;
      const [[x1, y1], [x2, y2]] = [...this.touches.values()];
      this.pinch = { d: Math.hypot(x2 - x1, y2 - y1), cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, view: this.view };
      this.draw();
      return;
    }
    if (this.touches.size > 2 || this.sim) {
      if (this.sim && this.finished) this.info(`${this.debrief ?? OUTCOME_TEXT[this.sim.outcome!]} <b>✎ Edit</b> to change it.`);
      return;
    }
    const peg = this.pegAt(X, Y);
    const member = this.memberAt(X, Y);
    // A tap right on a peg is the peg; a tap along a piece (away from its pegs) is the piece.
    const [wx, wy] = toWorld(this.view, X, Y);
    const dPeg = peg >= 0 ? Math.hypot((px(peg) - wx) * this.view.s, (py(peg) - wy) * this.view.s) : Infinity;
    const kind = member >= 0 && dPeg > 11 ? 'member' : peg >= 0 ? 'peg' : this.zoomed ? 'pan' : 'none';
    this.press = { id: e.pointerId, x: X, y: Y, kind, peg, member, dragging: false, target: -1, clamped: false, why: null, view: this.view };
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
      // Zoom in (never out past the whole view) about the pinch centre, which the fingers carry along.
      const s = Math.max(this.fit.s, Math.min(this.fit.s * 2.6, p.view.s * (d / Math.max(20, p.d))));
      const wx = (p.cx - p.view.ox) / p.view.s;
      const wy = (p.cy - p.view.oy) / p.view.s;
      this.view = clampView({ ...p.view, s, ox: cx - wx * s, oy: cy - wy * s }, this.fit);
      this.zoomed = this.view.s > this.fit.s * 1.01;
      this.refresh();
      return;
    }
    const pr = this.press;
    if (!pr || pr.id !== e.pointerId) return;
    if (!pr.dragging && Math.hypot(X - pr.x, Y - pr.y) < 9) return;
    // A drag that began on a piece next to a peg builds from that peg.
    if (!pr.dragging && pr.kind === 'member' && pr.peg >= 0) pr.kind = 'peg';
    if (!pr.dragging && this.selected >= 0) this.selected = -1;
    pr.dragging = true;
    if (pr.kind === 'pan' && pr.view) {
      this.view = clampView({ ...pr.view, ox: pr.view.ox + X - pr.x, oy: pr.view.oy + Y - pr.y }, this.fit);
      this.draw();
      return;
    }
    if (pr.kind !== 'peg') return;
    this.finger = [X, Y];
    const { p: t, clamped } = this.targetFor(pr.peg, X, Y);
    if (t !== pr.target || clamped !== pr.clamped) {
      pr.target = t;
      pr.clamped = clamped;
      pr.why = t < 0 ? 'nowhere' : whyNot(this.level, this.members, pr.peg, t, this.mat);
      if (t >= 0) buzz(3);
      const len = t >= 0 ? lenOf(pr.peg, t) : 0;
      const cue = clamped ? ` <span class="warn">max length: ${MATS[this.mat].name.toLowerCase()} reaches ${MAXLEN[this.mat]}</span>` : '';
      if (t < 0) this.info('');
      else if (pr.why) this.info(`<span class="bad">${pr.why}</span>${cue}`);
      else {
        const c = memberCost({ a: pr.peg, b: t, mat: this.mat });
        const total = costOf(this.members) + c;
        this.info(`<b>${MATS[this.mat].name}</b> ${len.toFixed(1)} long · <b>${c}</b> → cost ${total}/${this.level.budget}${total > this.level.budget ? ' <span class="bad">over budget</span>' : ''}${cue}`);
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
          buzz(8);
          this.info(`${pr.clamped ? `<span class="warn">Stopped at the ${MATS[this.mat].name.toLowerCase()}’s max length (${MAXLEN[this.mat]}).</span> ` : ''}${this.costLine()}`);
        } else this.info('That piece is already there.');
      } else if (pr.why && pr.why !== 'nowhere') toast(pr.why);
      this.draw();
      return;
    }
    if (pr.dragging) return;
    if (pr.kind === 'member') {
      if (this.selected === pr.member) {
        this.removeSelected();
      } else {
        // First tap picks the piece; a second tap (or ✕) removes it.
        this.selected = pr.member;
        const m = this.members[pr.member];
        this.info(`<button id="removeBtn" class="rm">✕ Remove</button><b>${MATS[m.mat].name}</b> ${lenOf(m.a, m.b).toFixed(1)} long · ${memberCost(m)}. Tap it again to remove it.`);
        buzz(4);
      }
    } else {
      const had = this.selected >= 0;
      this.selected = -1;
      if (pr.kind === 'peg') this.info(`Drag from a peg to another point to add a <b>${MATS[this.mat].name.toLowerCase()}</b>. Tap a piece to pick it, again to remove it.`);
      else if (had) this.info(this.costLine());
      else this.info(this.debrief ?? this.intro());
    }
    this.draw();
  }

  private cancel(e: PointerEvent): void {
    this.touches.delete(e.pointerId);
    if (this.touches.size < 2) this.pinch = null;
    this.press = null;
    this.finger = null;
    this.draw();
  }

  /** Parts and cost, and whether the build is joined up yet. */
  private costLine(): string {
    const c = costOf(this.members);
    const over = c - this.level.budget;
    const j = joined(this.level, this.members);
    const many = ringsOf(this.level).length > 1;
    const notYet =
      this.level.goal.kind === 'cross' && !j.road
        ? 'the road isn’t joined from bank to bank yet'
        : !j.rings
          ? `not joined to the ring${many ? 's' : ''} yet`
          : j.loose
            ? `${plural(j.loose, 'piece')} not joined to the rock`
            : '';
    const state = over > 0 ? ` <span class="bad">${over} over budget</span>` : notYet ? ` <span class="warn">${notYet}</span>` : c <= this.level.par ? ' <span class="good">at par or under</span>' : '';
    return `${plural(this.members.length, 'part')}, cost ${c}.${state}`;
  }

  // ---------------------------------------------------------------- runs

  private goButton(): void {
    if (this.busy || !this.level) return;
    if (this.sim) {
      this.stopRun();
      this.info(this.debrief ?? this.intro());
      return;
    }
    if (!this.members.length) {
      this.info('Build something first: drag from a peg to another point.');
      return;
    }
    const rings = ringsOf(this.level);
    if (rings.some((r) => !this.members.some((m) => m.a === r || m.b === r))) {
      this.info(`<span class="bad">Put a peg on ${rings.length > 1 ? 'every' : 'the'} ring first:</span> build out until a piece ends on it.`);
      return;
    }
    this.sounds.go();
    this.a += 'G';
    this.save();
    this.selected = -1;
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

  /** Back to building; a failed run leaves its glow (and its words) behind. */
  private stopRun(): void {
    const s = this.sim;
    if (s && this.finished && !WON.has(s.outcome!)) {
      this.hot = this.firstBreakHot(s);
    } else if (s) this.hot = null;
    this.sim = null;
    this.finished = false;
    this.sparks = [];
    this.refresh();
  }

  /** After a failure only the piece that snapped first glows (the swinging pegs are ringed apart). */
  private firstBreakHot(s: Sim): Map<string, number> {
    const m = this.members[s.firstBreak];
    return new Map(m ? [[`${m.a}:${m.b}`, 2]] : []);
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
      buzz(30);
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
      const v = explain(this.level, this.members, { ...s, outcome: s.outcome! });
      this.debrief = `<span class="bad">${v.text}</span>`;
      this.wobbly = v.wobbly.size ? v.wobbly : null;
      // Keep the words and the glow for this exact build, across a reload.
      const k = this.debriefKey();
      if (k) {
        const hot: [string, number][] = [...this.firstBreakHot(s)];
        store.save(k, { v: RULES_VERSION, a: builtOnly(this.a), text: this.debrief, hot, wobbly: [...v.wobbly] } satisfies Debrief);
      }
      this.info(this.debrief);
      this.refresh();
      return;
    }
    this.debrief = null;
    this.sounds.win(st);
    buzz([20, 60, 30]);
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
        : `<p>Cost <b>${cost}</b> of ${l.budget} · ${plural(parts, 'part')}.</p><p class="th">${st < 2 ? `★★ needs the surveyor’s cost: ${l.par} or less.` : st < 3 ? `★★★ needs ${plural(l.parParts, 'part')} or fewer at that cost.` : 'As lean as the surveyor’s own build, or leaner.'}</p>`;
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
    const j = joined(l, this.members);
    const whole = (l.goal.kind !== 'cross' || j.road) && j.rings && !j.loose;
    cost.className = `value ${c > l.budget ? 'over' : whole && c <= l.par && c > 0 ? 'par' : ''}`;
    const prof = loadProfile();
    $('best').textContent = this.mode === 'trail' ? stars(prof.stars[String(this.n)] ?? 0) : this.mode === 'daily' ? (loadDaily(store, this.day ?? todayKey())?.label.split(' ')[0] ?? '☆☆☆') : '';
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
      ghost: pr && pr.kind === 'peg' && pr.dragging && pr.target >= 0 ? { a: pr.peg, b: pr.target, mat: this.mat, ok: !pr.why, clamped: pr.clamped } : null,
      hot: this.hot,
      pressed: pr && pr.kind === 'member' && !pr.dragging ? pr.member : -1,
      selected: this.selected,
      wobbly: this.wobbly,
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
    if (this.finger && sc.ghost) {
      // The magnifier sits above the finger and looks at where the piece will end.
      const [tx, ty] = [this.view.ox + px(sc.ghost.b) * this.view.s, this.view.oy + py(sc.ghost.b) * this.view.s];
      drawLoupe(ctx, this.view, sc, this.finger[0], this.finger[1], tx, ty);
    }
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
      <p>Help the beetle haul its acorn cart over the stream, or hang lanterns where the path needs light, with a few sticks and some string.</p>
      <ul>
        <li><b>Drag from a peg</b> to another point to add a piece. The gold rings are fixed to the rock; every piece you add makes new pegs. A magnifier shows where the piece will end.</li>
        <li>${matSvg(0, 20)} <b>Planks</b> (10 a unit, up to 2.2 long) are the road: the cart only rolls on planks and rock. ${matSvg(1, 20)} <b>Twigs</b> (5 a unit, up to 2.2) push and pull. ${matSvg(2, 20)} <b>Twine</b> (3 a unit, up to 4.5) reaches far but only pulls. Drag past a piece’s reach and it stops at the last point in reach (a dashed circle shows it).</li>
        <li>Pegs bend freely, so a lone row of planks sags: brace it into <b>triangles</b>. Planks hold 80, twigs 60 (push or pull), twine 45 (pull only). The beetle can’t haul uphill: keep the road level or going down.</li>
        <li><b>Tap a piece</b> to pick it, tap again (or ✕) to remove it. Pinch or ⤢ to zoom; two fingers pan. Undo takes back anything.</li>
        <li><b>▶ Go</b> runs a test: pieces turn yellow, then red as they strain, and snap past their limit. After a failed run the line below says why: the piece that snapped first glows red and pegs that can swing are ringed. Wind gusts push sideways and updraughts lift whatever only hangs.</li>
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
      `<h2>The trail</h2><p>${plural(total, 'star')} so far. Clear a level to open the next; the first six teach the tricks; after that the kinds of level take turns (hooks, low pegs only, boat lanes, two carts, islands, lanterns on cliffs and over gaps) and slowly get harder, with wind later on.</p><div class="levels">${cells.join('')}</div>`,
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
