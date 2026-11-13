// Level generation off the main thread: the surveyor runs a few hundred test
// runs per level (a second or more on a phone), so the page asks here and
// shows "Surveying…" (or has already asked ahead for the next level).

import { makeLevel, trailLevel, type Level } from './core';

export type GenSpec = { kind: 'trail'; n: number } | { kind: 'seed'; seed: number; d: number; levelId: string };
export type GenJob = GenSpec & { id: number };

self.onmessage = (e: MessageEvent<GenJob>) => {
  const job = e.data;
  let level: Level | null = null;
  let error = '';
  try {
    level = job.kind === 'trail' ? trailLevel(job.n) : { ...makeLevel(job.seed, job.d), id: job.levelId };
  } catch (err) {
    error = String(err);
  }
  (self as unknown as Worker).postMessage({ id: job.id, level, error });
};
