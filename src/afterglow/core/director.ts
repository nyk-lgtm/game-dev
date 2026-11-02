// The spawn director: a per-minute wave table, scripted swarm events, elites
// and the two bosses. Spawns land just off-screen around the player.

import { TAU } from './math';
import { NIGHTS, RUN_SECONDS } from './content';
import { spawnEnemy } from './combat';
import type { EnemyKind, World } from './types';

interface Wave {
  /** Spawns per second. */
  rate: number;
  /** No regular spawns above this many live enemies. */
  max: number;
  mix: Partial<Record<EnemyKind, number>>;
}

/** One entry per minute. Ramps for three minutes, then alternates spikes and breathers. */
export const WAVES: Wave[] = [
  { rate: 2.1, max: 45, mix: { drone: 1 } },
  { rate: 3.2, max: 75, mix: { drone: 0.8, dart: 0.2 } },
  { rate: 4.1, max: 110, mix: { drone: 0.55, dart: 0.2, spitter: 0.25 } },
  { rate: 5.3, max: 155, mix: { drone: 0.45, dart: 0.15, spitter: 0.15, brute: 0.1, splitter: 0.15 } },
  { rate: 5.1, max: 155, mix: { drone: 0.35, brute: 0.2, bloater: 0.15, splitter: 0.15, spitter: 0.15 } },
  { rate: 4.1, max: 130, mix: { drone: 0.6, dart: 0.2, spitter: 0.2 } },
  { rate: 7.8, max: 230, mix: { drone: 0.35, splitter: 0.15, bloater: 0.1, brute: 0.1, spitter: 0.1, dart: 0.1, warden: 0.05, orbiter: 0.05 } },
  { rate: 8.5, max: 250, mix: { drone: 0.3, splitter: 0.15, bloater: 0.12, brute: 0.12, spitter: 0.1, dart: 0.1, warden: 0.06, orbiter: 0.05 } },
  { rate: 7.4, max: 240, mix: { brute: 0.3, warden: 0.12, spitter: 0.2, bloater: 0.14, dart: 0.24 } },
  { rate: 11.0, max: 290, mix: { drone: 0.3, splitter: 0.15, bloater: 0.12, brute: 0.12, spitter: 0.1, dart: 0.1, warden: 0.06, orbiter: 0.05 } },
];
const FINALE: Wave = { rate: 7, max: 220, mix: { drone: 0.4, orbiter: 0.25, spitter: 0.15, dart: 0.1, bloater: 0.1 } };

export const HARD_CAP = 350;
/** Most spitters alive at once, by minute; past the cap they arrive as drones. */
export const SPITTER_CAP = [0, 0, 4, 5, 5, 5, 6, 7, 8, 8];
const FINALE_SPITTERS = 6;
const PRISM_AT = 300;
/** Seconds after the Prism arrives that regular spawns stay halved. */
const PRISM_LULL = 45;
export const SPAWN_DIST = 480;

interface ScriptedEvent {
  id: string;
  at: number;
  warn?: string;
  run(w: World): void;
}

function ring(w: World, kind: EnemyKind, n: number, r: number): void {
  const p = w.player;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    spawnEnemy(w, kind, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
  }
}

export const EVENTS: ScriptedEvent[] = [
  { id: 'ring1', at: 105, warn: 'They surround you', run: (w) => ring(w, 'drone', 32, 330) },
  {
    id: 'rush',
    at: 210,
    warn: 'Brutes stampede',
    run: (w) => {
      // A column of brutes charging in from one side.
      const a = w.rng.next() * TAU;
      const p = w.player;
      for (let i = 0; i < 16; i++) {
        const off = (i - 7.5) * 30;
        spawnEnemy(w, 'brute', p.x + Math.cos(a) * 470 - Math.sin(a) * off, p.y + Math.sin(a) * 470 + Math.cos(a) * off);
      }
    },
  },
  {
    id: 'prism',
    at: PRISM_AT,
    warn: 'The Prism approaches',
    run: (w) => {
      const a = w.rng.next() * TAU;
      const e = spawnEnemy(w, 'prism', w.player.x + Math.cos(a) * 420, w.player.y + Math.sin(a) * 420);
      w.boss = e.id;
    },
  },
  { id: 'ring2', at: 390, warn: 'Orbiters close in', run: (w) => ring(w, 'orbiter', 34, 300) },
  { id: 'split', at: 465, warn: 'A splitter swarm', run: (w) => ring(w, 'splitter', 24, 360) },
  { id: 'bloat', at: 520, warn: 'Bloaters drift in', run: (w) => ring(w, 'bloater', 14, 280) },
  {
    id: 'eclipse',
    at: RUN_SECONDS,
    warn: 'The Eclipse rises',
    run: (w) => {
      const e = spawnEnemy(w, 'eclipse', w.player.x, w.player.y - 420);
      w.boss = e.id;
    },
  },
];

export function currentWave(w: World): Wave {
  if (w.time >= RUN_SECONDS) return FINALE;
  return WAVES[Math.min(WAVES.length - 1, Math.floor(w.time / 60))];
}

function pick(w: World, mix: Partial<Record<EnemyKind, number>>): EnemyKind {
  const entries = Object.entries(mix) as [EnemyKind, number][];
  const total = entries.reduce((s, [, v]) => s + v, 0);
  let r = w.rng.next() * total;
  for (const [k, v] of entries) {
    r -= v;
    if (r <= 0) return k;
  }
  return entries[0][0];
}

/** Somewhere just off-screen around the player. */
export function spawnPoint(w: World): { x: number; y: number } {
  const a = w.rng.next() * TAU;
  const d = SPAWN_DIST + w.rng.next() * 60;
  return { x: w.player.x + Math.cos(a) * d, y: w.player.y + Math.sin(a) * d };
}

function spitters(w: World): number {
  let n = 0;
  for (const e of w.enemies) if (e.kind === 'spitter' && e.alive) n++;
  return n;
}

export function spitterCap(w: World): number {
  if (w.time >= RUN_SECONDS) return FINALE_SPITTERS;
  return SPITTER_CAP[Math.min(SPITTER_CAP.length - 1, Math.floor(w.time / 60))];
}

export function direct(w: World, dt: number): void {
  for (const ev of EVENTS) {
    if (w.time >= ev.at && !w.eventsDone.includes(ev.id)) {
      w.eventsDone.push(ev.id);
      if (ev.warn) w.fx.push({ type: 'warn', text: ev.warn });
      ev.run(w);
    }
  }

  // An elite every minute from 1:30 on (not during the finale); harder nights send more.
  const night = NIGHTS[w.night];
  const eliteId = `elite${Math.floor((w.time - 90) / 60)}`;
  if (w.time >= 90 && w.time < RUN_SECONDS && !w.eventsDone.includes(eliteId)) {
    w.eventsDone.push(eliteId);
    for (let k = 0; k < night.elites; k++) {
      const kind = pick(w, { ...currentWave(w).mix, drone: 0, mite: 0 });
      const s = spawnPoint(w);
      spawnEnemy(w, kind === 'drone' ? 'brute' : kind, s.x, s.y, true);
    }
  }

  const wave = currentWave(w);
  const alive = w.enemies.length;
  // The swarm thins while the Prism is fresh, but only for a while: a Prism
  // left alive shouldn't halve the waves for the rest of the run.
  const lull = w.boss !== null && w.time < RUN_SECONDS && w.time < PRISM_AT + PRISM_LULL;
  const rate = wave.rate * night.rate * (lull ? 0.5 : 1);
  const max = Math.min(HARD_CAP, wave.max * (1 + (night.rate - 1) / 2));
  w.spawnAcc += rate * dt;
  while (w.spawnAcc >= 1) {
    w.spawnAcc -= 1;
    if (alive >= max) continue;
    const s = spawnPoint(w);
    let kind = pick(w, wave.mix);
    if (kind === 'spitter' && spitters(w) >= spitterCap(w)) kind = 'drone';
    spawnEnemy(w, kind, s.x, s.y);
  }
}
