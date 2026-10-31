// Telegraph runs can be exported as a short text code and replayed exactly.

import { RULES_VERSION } from './core';

export function bugReport(seed: number, actions: string, depth: number): string {
  const ua = navigator.userAgent.replace(/\s+/g, ' ');
  return `TELEGRAPH build=${__BUILD_ID__} rules=${RULES_VERSION} seed=${seed} depth=${depth} a=${actions || '-'} screen=${innerWidth}x${innerHeight}@${devicePixelRatio} ua="${ua}"`;
}

/** Reads ?seed=123&a=0152w from the URL (for reproducing bug reports). */
export function replayFromUrl(): { seed: number; actions: string } | null {
  const p = new URLSearchParams(location.search);
  const seed = Number(p.get('seed'));
  if (!p.has('seed') || !Number.isFinite(seed)) return null;
  const a = p.get('a') ?? '';
  return { seed, actions: a === '-' ? '' : a };
}
