// A Sungrazer bot with a human's handicaps: it reacts late (presses land
// `react` ticks after it decides), its timing wobbles (`jitter`, ticks), and it
// plans each release by trying many release ticks and flying each one out a
// little, picking the one whose neighbours are also safe (`caution`).

import { COMET_R, LOCK, cloneRun, isLit, lowerY, newRun, step, target, type Mode, type Run } from '../../src/sungrazer/core';
import { Rng } from '../../src/shared/rng';

export interface Skill {
  /** Ticks from deciding to the press/release landing. */
  react: number;
  /** Std-dev of timing error, ticks. */
  jitter: number;
  /** How much it values points against climbing. */
  greed: number;
  /** Candidates on each side that must be safe too (a margin for its own wobble). */
  caution: number;
}
export const SKILLS: Record<string, Skill> = {
  novice: { react: 62, jitter: 22, greed: 0, caution: 1 },
  human: { react: 50, jitter: 14, greed: 0.3, caution: 2 },
  good: { react: 38, jitter: 7, greed: 0.4, caution: 2 },
  perfect: { react: 30, jitter: 0, greed: 0.8, caution: 1 },
};

const SPACING = 6;
const HORIZON = 4 * 240;
const FLIGHT = Math.round(1.3 * 240);

function gauss(rng: Rng): number {
  return (rng.next() + rng.next() + rng.next() + rng.next() - 2) * 1.73;
}

const DEAD = -1000;

/** Like a person: hold once a new star (not the one just left) is close to reach. */
export function wantsPress(r: Run, fromId: number): boolean {
  const stars = r.world.stars;
  for (let i = lowerY(stars, r.y - LOCK - 12); i < stars.length && stars[i].y <= r.y + LOCK + 12; i++) {
    const s = stars[i];
    if (s.id !== fromId && Math.hypot(s.x - r.x, s.y - r.y) < LOCK + 12 && isLit(s, r.tick + 30)) return true;
  }
  return false;
}

/**
 * Fly a released comet forward, pressing `react` ticks after a new star comes in reach, and score the
 * outcome. Returns the value and the state just after the grab (null if it never grabbed).
 */
function evalFlight(f: Run, fromY: number, fromId: number, start: Run, sk: Skill): { v: number; at: Run | null } {
  let pressAt = -1;
  const t0 = f.tick;
  while (f.alive && f.tick - t0 < FLIGHT) {
    if (pressAt < 0 && wantsPress(f, fromId)) pressAt = f.tick + sk.react;
    step(f, pressAt >= 0 && f.tick >= pressAt);
    if (f.tether) {
      const st = f.tether.star;
      let v = st.y - fromY + sk.greed * (f.score - start.score) * 0.05;
      const clear = f.tether.r - st.r - COMET_R;
      if (clear < 6) v -= (6 - clear) * 14;
      const margin = f.y - f.camY;
      if (margin < 30) v -= (30 - margin) * 2;
      return { v, at: f };
    }
  }
  if (!f.alive) return { v: DEAD + (f.tick - t0) * 0.1, at: null };
  return { v: f.y - fromY - 80 - Math.max(0, 30 - (f.y - f.camY)) * 3, at: null };
}

/** Values of letting go at each candidate tick of an orbit (holding until then). */
function candidates(r: Run, sk: Skill, from: number, spacing: number, horizon: number): { ticks: number[]; vals: number[]; grabs: (Run | null)[]; burns: boolean } {
  const t = r.tether!;
  const fromY = t.star.y, fromId = t.star.id;
  const h = cloneRun(r);
  const ticks: number[] = [], vals: number[] = [], grabs: (Run | null)[] = [];
  while (h.alive && h.tether && h.tick < r.tick + horizon) {
    if (h.tick >= from && (h.tick - from) % spacing === 0) {
      const e = evalFlight(cloneRun(h), fromY, fromId, r, sk);
      ticks.push(h.tick);
      vals.push(e.v);
      grabs.push(e.at);
    }
    step(h, true);
  }
  return { ticks, vals, grabs, burns: !h.alive || !h.tether };
}

/** Each candidate's value counting its neighbours (a margin for the bot's own wobble). */
function robust(vals: number[], w: number, burns: boolean): number[] {
  return vals.map((v, k) => {
    let m = v;
    for (let j = Math.max(0, k - w); j <= Math.min(vals.length - 1, k + w); j++) m = Math.min(m, vals[j]);
    if (burns && k + w >= vals.length) m = Math.min(m, DEAD / 2);
    return m;
  });
}

/** How good the best way out of a fresh orbit looks (coarse). */
function escape(g: Run, sk: Skill): number {
  const c = candidates(g, sk, g.tick + sk.react, 18, Math.round(2.5 * 240));
  if (!c.vals.length) return DEAD;
  return Math.max(...robust(c.vals, sk.caution ? 1 : 0, c.burns));
}

/** Best tick to let go of the current orbit (absolute), from `from` on. */
export function planRelease(r: Run, sk: Skill, from: number): number {
  const c = candidates(r, sk, from, SPACING, HORIZON);
  if (!c.ticks.length) return from;
  const rb = robust(c.vals, sk.caution, c.burns);
  // Look one orbit further for the most promising few.
  const order = rb.map((_, k) => k).sort((a, b) => rb[b] - rb[a]).slice(0, 10);
  let best = order[0], bv = -Infinity;
  for (const k of order) {
    const g = c.grabs[k];
    const v = rb[k] + (g ? Math.max(DEAD / 2, escape(cloneRun(g), sk)) * 0.7 : -60);
    if (v > bv) {
      bv = v;
      best = k;
    }
  }
  if (process.env.BOTLOG) console.log(`plan @${r.tick} star#${r.tether!.star.id}: ${c.vals.map((v, i) => `${c.ticks[i]}:${Math.round(v)}`).join(' ')} -> ${c.ticks[best]} (${Math.round(bv)})`);
  return c.ticks[best];
}

export interface BotResult {
  run: Run;
  inputs: number[];
}

/** Plays one run. */
export function playBot(seed: number, mode: Mode, sk: Skill, noiseSeed = 1, maxTicks = 240 * 60 * 10): BotResult {
  const r = newRun(seed, mode);
  const rng = new Rng(noiseSeed);
  const inputs: number[] = [];
  let held = false;
  let want: { tick: number; held: boolean } | null = null;
  let planned: unknown = null;
  while (r.alive && r.tick < maxTicks) {
    if (want && want.tick <= r.tick) {
      if (want.held !== held) {
        held = want.held;
        inputs.push(r.tick);
      }
      want = null;
    }
    if (!want) {
      if (held && r.tether) {
        if (planned !== r.tether) {
          planned = r.tether;
          const at = planRelease(r, sk, r.tick + sk.react);
          want = { tick: Math.max(r.tick + 1, at + Math.round(gauss(rng) * sk.jitter)), held: false };
        }
      } else if (held && r.held && r.used) {
        // The tether snapped (wall or a pulsar going dark): let go so the next press can grab.
        want = { tick: r.tick + Math.max(1, Math.round(sk.react / 2)), held: false };
      } else if (!held) {
        const danger = r.y - r.camY < 22 && r.vy < 0 && target(r);
        if (wantsPress(r, r.last) || danger)
          want = { tick: r.tick + Math.max(1, sk.react + Math.round(gauss(rng) * sk.jitter)), held: true };
      }
    }
    step(r, held);
  }
  return { run: r, inputs };
}
