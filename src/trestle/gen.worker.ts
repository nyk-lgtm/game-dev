// Level generation off the main thread: the surveyor runs a few hundred test
// runs per level (a second or more on a phone), so the page asks here and
// shows "Surveying…" (or has already asked ahead for the next level).

import { seedLevel, trailLevel, type Level } from './core';

export type GenSpec = { kind: 'trail'; n: number } | { kind: 'seed'; seed: number; d: number; levelId: string; daily?: boolean };
export type GenJob = GenSpec & { id: number };

self.onmessage = (e: MessageEvent<GenJob>) => {
  const job = e.data;
  let level: Level | null = null;
  let error = '';
  try {
    level = job.kind === 'trail' ? trailLevel(job.n) : seedLevel(job.seed, job.d, job.levelId, job.daily);
  } catch (err) {
    error = String(err);
  }
  (self as unknown as Worker).postMessage({ id: job.id, level, error });
};
