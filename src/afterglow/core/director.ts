// The spawn director: a per-minute wave table, scripted swarm events, elites
// and the two bosses. Spawns land just off-screen around the player.

import { TAU } from './math';
import { RUN_SECONDS } from './content';
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
  { rate: 1.5, max: 30, mix: { drone: 1 } },
  { rate: 2.3, max: 55, mix: { drone: 0.8, dart: 0.2 } },
  { rate: 2.9, max: 80, mix: { drone: 0.55, dart: 0.2, spitter: 0.25 } },
  { rate: 3.7, max: 115, mix: { drone: 0.45, dart: 0.15, spitter: 0.15, brute: 0.1, splitter: 0.15 } },
  { rate: 3.2, max: 105, mix: { drone: 0.35, brute: 0.2, bloater: 0.15, splitter: 0.15, spitter: 0.15 } },
  { rate: 2.6, max: 95, mix: { drone: 0.6, dart: 0.2, spitter: 0.2 } },
  { rate: 4.6, max: 175, mix: { drone: 0.35, splitter: 0.15, bloater: 0.1, brute: 0.1, spitter: 0.1, dart: 0.1, warden: 0.05, orbiter: 0.05 } },
  { rate: 5.6, max: 215, mix: { drone: 0.3, splitter: 0.15, bloater: 0.12, brute: 0.12, spitter: 0.1, dart: 0.1, warden: 0.06, orbiter: 0.05 } },
  { rate: 4.2, max: 170, mix: { brute: 0.3, warden: 0.12, spitter: 0.2, bloater: 0.18, dart: 0.2 } },
  { rate: 7.2, max: 290, mix: { drone: 0.3, splitter: 0.15, bloater: 0.12, brute: 0.12, spitter: 0.1, dart: 0.1, warden: 0.06, orbiter: 0.05 } },
];
const FINALE: Wave = { rate: 1.2, max: 60, mix: { drone: 0.7, orbiter: 0.3 } };

export const HARD_CAP = 350;
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
      for (let i = 0; i < 12; i++) {
        const off = (i - 5.5) * 30;
        spawnEnemy(w, 'brute', p.x + Math.cos(a) * 470 - Math.sin(a) * off, p.y + Math.sin(a) * 470 + Math.cos(a) * off);
      }
    },
  },
  {
    id: 'prism',
    at: 300,
    warn: 'The Prism approaches',
    run: (w) => {
      const a = w.rng.next() * TAU;
      const e = spawnEnemy(w, 'prism', w.player.x + Math.cos(a) * 420, w.player.y + Math.sin(a) * 420);
      w.boss = e.id;
    },
  },
  { id: 'ring2', at: 390, warn: 'Orbiters close in', run: (w) => ring(w, 'orbiter', 26, 300) },
  { id: 'split', at: 465, warn: 'A splitter swarm', run: (w) => ring(w, 'splitter', 18, 360) },
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

export function direct(w: World, dt: number): void {
  for (const ev of EVENTS) {
    if (w.time >= ev.at && !w.eventsDone.includes(ev.id)) {
      w.eventsDone.push(ev.id);
      if (ev.warn) w.fx.push({ type: 'warn', text: ev.warn });
      ev.run(w);
    }
  }

  // An elite every minute from 1:30 on (not during the finale).
  const eliteId = `elite${Math.floor((w.time - 90) / 60)}`;
  if (w.time >= 90 && w.time < RUN_SECONDS && !w.eventsDone.includes(eliteId)) {
    w.eventsDone.push(eliteId);
    const kind = pick(w, { ...currentWave(w).mix, drone: 0, mite: 0 });
    const s = spawnPoint(w);
    spawnEnemy(w, kind === 'drone' ? 'brute' : kind, s.x, s.y, true);
  }

  const wave = currentWave(w);
  const alive = w.enemies.length;
  const bossUp = w.boss !== null;
  const rate = wave.rate * (bossUp && w.time < RUN_SECONDS ? 0.5 : 1);
  w.spawnAcc += rate * dt;
  while (w.spawnAcc >= 1) {
    w.spawnAcc -= 1;
    if (alive >= Math.min(wave.max, HARD_CAP)) continue;
    const s = spawnPoint(w);
    spawnEnemy(w, pick(w, wave.mix), s.x, s.y);
  }
}
