// Turn Grove rule events into animation steps that mutate the Scene.

import { key, type Hex } from '../../shared/hex';
import { ease, lerp, type Step } from '../../shared/timeline';
import type { Cell, GameEvent } from '../core';
import { G } from './palette';
import type { Scene } from './scene';

const popStep = (sc: () => Scene, at: Hex, dur = 200): Step => ({
  dur,
  update: (t) => sc().pops.set(key(at), t),
  end: () => sc().pops.delete(key(at)),
});

export function stepsFor(events: GameEvent[], sc: () => Scene): Step[] {
  const steps: Step[] = [];
  const floater = (text: string, color: string, at: Hex) =>
    sc().floaters.push({ text, color, q: at.q, r: at.r, age: 0, life: 1000 });

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    switch (ev.type) {
      case 'place': {
        const p = ev.piece;
        if (p.kind === 'bolt') break;
        const cell: Cell = p.kind === 'plant' ? { kind: 'plant', tier: p.tier } : p.kind === 'wisp' ? { kind: 'wisp', id: -1 } : null;
        steps.push({ dur: 0, start: () => (sc().board[key(ev.at)] = cell) });
        if (cell) steps.push(popStep(sc, ev.at, 160));
        break;
      }
      case 'score':
        steps.push({ dur: 0, start: () => floater(`+${ev.points}`, G.good, ev.at) });
        break;
      case 'crystal':
        steps.push({
          dur: 0,
          start: () => {
            sc().board[key(ev.at)] = { kind: ev.became.kind, tier: ev.became.tier };
            sc().flash = { q: ev.at.q, r: ev.at.r, t: 0 };
          },
        });
        steps.push({ dur: 200, update: (t) => (sc().flash = { q: ev.at.q, r: ev.at.r, t }), end: () => (sc().flash = null) });
        break;
      case 'merge': {
        steps.push({
          dur: 240,
          start: () => {
            const s = sc();
            for (const h of ev.from) {
              const c = s.board[key(h)];
              if (c) s.sprites.push({ piece: c, q: h.q, r: h.r, alpha: 1, scale: 1 });
              s.board[key(h)] = null;
            }
          },
          update: (t) => {
            const s = sc();
            const k = ease(t);
            s.sprites.forEach((sp, j) => {
              const h = ev.from[j];
              if (!h) return;
              sp.q = lerp(h.q, ev.at.q, k);
              sp.r = lerp(h.r, ev.at.r, k);
              sp.alpha = 1 - 0.6 * k;
              sp.scale = 1 - 0.3 * k;
            });
          },
          end: () => {
            const s = sc();
            s.sprites = [];
            s.board[key(ev.at)] = { kind: ev.kind, tier: ev.tier };
            if (ev.points > 0) floater(`+${ev.points}`, G.spirit, ev.at);
            navigator.vibrate?.(ev.tier >= 3 ? 30 : 12);
          },
        });
        steps.push(popStep(sc, ev.at, 220));
        break;
      }
      case 'bolt':
        steps.push({
          dur: 220,
          start: () => (sc().flash = { q: ev.at.q, r: ev.at.r, t: 0 }),
          update: (t) => (sc().flash = { q: ev.at.q, r: ev.at.r, t }),
          end: () => {
            const s = sc();
            s.flash = null;
            s.board[key(ev.at)] = ev.hit?.kind === 'wisp' ? { kind: 'stone', tier: 0 } : null;
          },
        });
        break;
      case 'wispMove': {
        // Slide all consecutive wisp steps together.
        const batch = [ev];
        while (events[i + 1]?.type === 'wispMove') batch.push(events[++i] as typeof ev);
        steps.push({
          dur: 200,
          start: () => {
            const s = sc();
            for (const m of batch) {
              const c = s.board[key(m.from)];
              s.board[key(m.from)] = null;
              s.sprites.push({ piece: c ?? { kind: 'wisp', id: m.id }, q: m.from.q, r: m.from.r, alpha: 1, scale: 1 });
            }
          },
          update: (t) => {
            const s = sc();
            const k = ease(t);
            batch.forEach((m, j) => {
              const sp = s.sprites[j];
              if (!sp) return;
              sp.q = lerp(m.from.q, m.to.q, k);
              sp.r = lerp(m.from.r, m.to.r, k);
            });
          },
          end: () => {
            const s = sc();
            batch.forEach((m, j) => (s.board[key(m.to)] = (s.sprites[j]?.piece as Cell) ?? { kind: 'wisp', id: m.id }));
            s.sprites = [];
          },
        });
        break;
      }
      case 'wispTrapped':
        steps.push({
          dur: 0,
          start: () => {
            sc().board[key(ev.at)] = { kind: 'stone', tier: 0 };
            floater('trapped!', G.wisp, ev.at);
          },
        });
        steps.push(popStep(sc, ev.at, 220));
        break;
      case 'swap':
      case 'gameOver':
        break;
    }
  }
  return steps;
}
