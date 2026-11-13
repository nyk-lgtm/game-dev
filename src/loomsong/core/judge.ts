// Judging taps against the chart. Times are song milliseconds already
// corrected for the player's calibrated latency, so the same events give the
// same result live and in a replay. Presses take the nearest unjudged tap or
// hold head in their lane; flicks (a swipe) take flick notes; a hold's tail is
// kept if the lane stays down until near its end. Every note is one judgement:
// a hold let go too early counts as a miss, whatever its head was. The final
// result is always recomputed from the event list (`judgePlay`), combo in chart order.

import type { Chart, Note } from './chart';

/** Windows (± ms). Outside GOOD but inside MISS_WIN a press still uses the note up, as a miss. */
export const PERFECT = 45;
export const GOOD = 100;
export const MISS_WIN = 140;
export const FLICK_PERFECT = 60;
export const FLICK_GOOD = 120;
export const FLICK_MISS = 160;
/** A swipe must finish within this long of touching down to be a flick (it is stamped with the touch-down time). */
export const FLICK_MAX = 220;
/** Letting go of a hold up to this early still keeps its tail. */
export const TAIL_GRACE = 120;

export const J_PERFECT = 0;
export const J_GOOD = 1;
export const J_MISS = 2;
export type Judgment = 0 | 1 | 2;

export interface InputEv {
  /** d = a finger goes down in a lane, u = the lane's last finger lifts, f = a flick (stamped at its touch-down). */
  k: 'd' | 'u' | 'f';
  lane: number;
  t: number;
}

export interface Hit {
  note: Note;
  j: Judgment;
  /** Press time minus note time (null for tails and untouched misses). */
  dt: number | null;
  tail: boolean;
}

export interface Result {
  score: number;
  /** 0..100 */
  acc: number;
  maxCombo: number;
  perfect: number;
  good: number;
  miss: number;
  objects: number;
  early: number;
  late: number;
  /** Mean press error over hit heads (ms; positive = late). */
  meanDt: number;
  hits: number;
  grade: Grade;
  fullCombo: boolean;
  allPerfect: boolean;
  /** Each note's lane and judgment in chart order, for the tapestry. */
  cloth: [number, Judgment][];
}

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';
export const GRADES: { g: Grade; min: number; name: string }[] = [
  { g: 'S', min: 950_000, name: 'Silk' },
  { g: 'A', min: 880_000, name: 'Linen' },
  { g: 'B', min: 760_000, name: 'Cotton' },
  { g: 'C', min: 600_000, name: 'Wool' },
  { g: 'D', min: 0, name: 'Frayed' },
];
export const gradeOf = (score: number): Grade => GRADES.find((x) => score >= x.min)!.g;
export const gradeName = (g: Grade) => GRADES.find((x) => x.g === g)!.name;
/** Accuracy value of each judgment (rules v2: Good 0.75, so a full combo of Goods is a B). */
export const VALUE = [1, 0.75, 0];

const winOf = (n: Note) => (n.kind === 'flick' ? FLICK_MISS + FLICK_MAX : MISS_WIN);

export class Judge {
  readonly head: Int8Array;
  readonly tail: Int8Array;
  readonly dt: Float64Array;
  /** Hits since the last drain (for effects). */
  out: Hit[] = [];
  combo = 0;
  maxCombo = 0;
  private lanes: Note[][];
  private lanePtr: number[];
  private active: (Note | null)[];
  private exp = 0;

  constructor(readonly chart: Chart) {
    const n = chart.notes.length;
    this.head = new Int8Array(n).fill(-1);
    this.tail = new Int8Array(n).fill(-1);
    this.dt = new Float64Array(n).fill(NaN);
    this.lanes = [[], [], [], []];
    for (const note of chart.notes) this.lanes[note.lane].push(note);
    this.lanePtr = [0, 0, 0, 0];
    this.active = [null, null, null, null];
  }

  /** The hold currently held in a lane, if any. */
  holding(lane: number): Note | null {
    return this.active[lane];
  }

  /** A head judgment (combo up or broken), or a hold's tail (kept: nothing more; dropped: the note becomes a miss). */
  private emit(note: Note, j: Judgment, dt: number | null, tail: boolean): void {
    if (tail) {
      this.tail[note.id] = j;
      if (j === J_MISS) this.combo = 0;
    } else {
      this.head[note.id] = j;
      if (dt !== null) this.dt[note.id] = dt;
      if (j === J_MISS) this.combo = 0;
      else this.maxCombo = Math.max(this.maxCombo, ++this.combo);
    }
    this.out.push({ note, j, dt, tail });
  }

  private nearest(lane: number, t: number, flick: boolean): Note | null {
    const ls = this.lanes[lane];
    let i = this.lanePtr[lane];
    while (i < ls.length && this.head[ls[i].id] >= 0) i++;
    this.lanePtr[lane] = i;
    const win = flick ? FLICK_MISS : MISS_WIN;
    let best: Note | null = null, bd = Infinity;
    for (; i < ls.length && ls[i].t <= t + win; i++) {
      const n = ls[i];
      if (this.head[n.id] >= 0 || (n.kind === 'flick') !== flick) continue;
      const d = Math.abs(t - n.t);
      if (d <= win && d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  press(lane: number, t: number): void {
    const n = this.nearest(lane, t, false);
    if (!n) return;
    const dt = t - n.t, d = Math.abs(dt);
    const j: Judgment = d <= PERFECT ? J_PERFECT : d <= GOOD ? J_GOOD : J_MISS;
    this.emit(n, j, dt, false);
    if (n.kind === 'hold') {
      if (j === J_MISS) this.tail[n.id] = J_MISS;
      else this.active[lane] = n;
    }
  }

  flick(lane: number, t: number): void {
    const n = this.nearest(lane, t, true);
    if (!n) return;
    const dt = t - n.t, d = Math.abs(dt);
    this.emit(n, d <= FLICK_PERFECT ? J_PERFECT : d <= FLICK_GOOD ? J_GOOD : J_MISS, dt, false);
  }

  release(lane: number, t: number): void {
    const n = this.active[lane];
    if (!n) return;
    this.active[lane] = null;
    this.emit(n, t >= n.end - TAIL_GRACE ? J_PERFECT : J_MISS, null, true);
  }

  apply(e: InputEv): void {
    if (e.k === 'd') this.press(e.lane, e.t);
    else if (e.k === 'u') this.release(e.lane, e.t);
    else this.flick(e.lane, e.t);
  }

  /** Time has reached t: holds that ran to their end are kept, notes past their window are missed. */
  advance(t: number): void {
    for (let l = 0; l < 4; l++) {
      const n = this.active[l];
      if (n && t >= n.end) {
        this.active[l] = null;
        this.emit(n, J_PERFECT, null, true);
      }
    }
    const ns = this.chart.notes;
    for (let i = this.exp; i < ns.length && ns[i].t + MISS_WIN < t; i++) {
      const n = ns[i];
      if (this.head[n.id] < 0 && t > n.t + winOf(n)) {
        this.emit(n, J_MISS, null, false);
        if (n.kind === 'hold') this.tail[n.id] = J_MISS;
      }
    }
    while (this.exp < ns.length && this.head[ns[this.exp].id] >= 0) this.exp++;
  }

  drain(): Hit[] {
    const o = this.out;
    this.out = [];
    return o;
  }

  /** Every object judged? */
  done(): boolean {
    return this.exp >= this.chart.notes.length && this.active.every((a) => !a);
  }

  /** The result, from the judgments in chart order (call after advance(Infinity)). */
  result(): Result {
    const ns = this.chart.notes;
    let combo = 0, maxCombo = 0, sum = 0;
    const cnt = [0, 0, 0];
    const cloth: [number, Judgment][] = [];
    for (const n of ns) {
      const j = noteJudgment(n, this.head[n.id], this.tail[n.id]);
      cnt[j]++;
      sum += VALUE[j];
      combo = j === J_MISS ? 0 : combo + 1;
      maxCombo = Math.max(maxCombo, combo);
      cloth.push([n.lane, j]);
    }
    let early = 0, late = 0, dsum = 0, hits = 0;
    for (const n of ns) {
      const j = this.head[n.id], dt = this.dt[n.id];
      if (j === J_MISS || j < 0 || Number.isNaN(dt)) continue;
      hits++;
      dsum += dt;
      const pw = n.kind === 'flick' ? FLICK_PERFECT : PERFECT;
      if (dt < -pw) early++;
      else if (dt > pw) late++;
    }
    const total = ns.length || 1;
    const score = Math.round((900_000 * sum) / total + (100_000 * maxCombo) / total);
    return {
      score,
      acc: (100 * sum) / total,
      maxCombo,
      perfect: cnt[0],
      good: cnt[1],
      miss: cnt[2],
      objects: ns.length,
      early,
      late,
      meanDt: hits ? dsum / hits : 0,
      hits,
      grade: gradeOf(score),
      fullCombo: ns.length > 0 && cnt[2] === 0,
      allPerfect: ns.length > 0 && cnt[0] === ns.length,
      cloth,
    };
  }
}

/** A note's judgment: its head's, unless it is a hold that was let go too early (or never held). */
export function noteJudgment(n: Note, head: number, tail: number): Judgment {
  if (head < 0 || head === J_MISS) return J_MISS;
  if (n.kind === 'hold' && tail === J_MISS) return J_MISS;
  return head as Judgment;
}

/** Score a play from its events (sorted by time; ties keep their order). */
export function judgePlay(chart: Chart, events: InputEv[]): Result {
  const j = new Judge(chart);
  const evs = events.map((e, i) => [e, i] as const).sort((a, b) => a[0].t - b[0].t || a[1] - b[1]);
  for (const [e] of evs) {
    j.advance(e.t);
    j.apply(e);
  }
  j.advance(Infinity);
  return j.result();
}
