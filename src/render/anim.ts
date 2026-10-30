// Turns a list of game events into a timeline of small animation steps that
// mutate the Scene. Purely cosmetic: the game state is already final.

import { DIRS, PLAYER_ID, type GameEvent, type GameState, type Hex } from '../core';
import { C } from './palette';
import { sceneFromState, type Scene, type VisUnit } from './scene';

interface Step {
  dur: number;
  start?: () => void;
  update?: (t: number) => void;
  end?: () => void;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export interface Hooks {
  /** Called when the player takes damage (haptics etc.). */
  onPlayerHurt?: () => void;
}

export class Animator {
  private steps: Step[] = [];
  private cur: Step | null = null;
  private t = 0;
  private onDone: (() => void) | null = null;

  constructor(private hooks: Hooks = {}) {}

  get busy(): boolean {
    return this.cur !== null || this.steps.length > 0;
  }

  /** Queue animations for `events`; `scene` must currently show the pre-action state. */
  play(scene: { current: Scene }, events: GameEvent[], next: GameState, onDone: () => void): void {
    const unit = (id: number): VisUnit | undefined => scene.current.units.get(id);
    const floater = (text: string, color: string, at: Hex | VisUnit) =>
      scene.current.floaters.push({ text, color, q: at.q, r: at.r, age: 0, life: 900 });
    const steps: Step[] = [];

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      switch (ev.type) {
        case 'playerMove': {
          steps.push(moveStep(() => unit(PLAYER_ID), ev.from, ev.to, 110));
          break;
        }
        case 'enemyMove': {
          // Batch consecutive enemy moves so they slide together.
          const batch = [ev];
          while (events[i + 1]?.type === 'enemyMove') batch.push(events[++i] as typeof ev);
          const subs = batch.map((m) => moveStep(() => unit(m.id), m.from, m.to, 120));
          steps.push({
            dur: 120,
            start: () => subs.forEach((s) => s.start?.()),
            update: (t) => subs.forEach((s) => s.update?.(t)),
          });
          break;
        }
        case 'attack': {
          if (ev.kind === 'charge') break;
          const dur = ev.kind === 'bash' ? 130 : ev.by === PLAYER_ID ? 90 : 140;
          const reach = ev.kind === 'bash' ? 0.4 : ev.by === PLAYER_ID ? 0.25 : 0.35;
          steps.push({
            dur,
            update: (t) => {
              const a = unit(ev.by);
              const b = unit(ev.target);
              if (!a || !b) return;
              const k = Math.sin(t * Math.PI) * reach;
              a.bq = (b.q - a.q) * k;
              a.br = (b.r - a.r) * k;
            },
          });
          break;
        }
        case 'damage': {
          steps.push({
            dur: 110,
            start: () => {
              const u = unit(ev.target);
              if (!u) return;
              u.hp = ev.hp;
              u.flash = 1;
              floater(`-${ev.amount}`, ev.target === PLAYER_ID ? C.brute : C.text, u);
              if (ev.target === PLAYER_ID) {
                scene.current.shake = 7;
                scene.current.hurt = 1;
                this.hooks.onPlayerHurt?.();
              }
            },
          });
          break;
        }
        case 'death': {
          steps.push({
            dur: 170,
            update: (t) => {
              const u = unit(ev.target);
              if (!u) return;
              u.alpha = 1 - t;
              u.scale = 1 + t * 0.4;
            },
            end: () => scene.current.units.delete(ev.target),
          });
          break;
        }
        case 'stagger': {
          steps.push({
            dur: 0,
            start: () => {
              const u = unit(ev.target);
              if (!u) return;
              u.staggered = true;
              u.aim = null;
              floater('dazed', C.muted, { q: u.q, r: u.r - 0.35 });
            },
          });
          break;
        }
        case 'aim': {
          steps.push({
            dur: 140,
            start: () => {
              const u = unit(ev.by);
              if (u) {
                u.aim = ev.dir;
                u.facing = ev.dir;
              }
            },
          });
          break;
        }
        case 'shot': {
          const path = ev.path;
          const shooter = unit(ev.by);
          const from = shooter ? { q: shooter.q, r: shooter.r } : path[0];
          const dir = shooter?.aim ?? 0;
          const dur = Math.max(80, 45 * path.length);
          steps.push({
            dur,
            start: () => {
              const u = unit(ev.by);
              if (u) {
                u.aim = null;
                u.reload = 1;
              }
            },
            update: (t) => {
              const end = path.at(-1) ?? from;
              scene.current.projectile = {
                q: lerp(from.q, end.q, t),
                r: lerp(from.r, end.r, t),
                dir,
                kind: 'arrow',
                lift: 0,
              };
            },
            end: () => (scene.current.projectile = null),
          });
          break;
        }
        case 'blocked': {
          steps.push({
            dur: 140,
            start: () => {
              const u = unit(ev.target);
              if (u) floater('blocked', C.guard, u);
            },
          });
          break;
        }
        case 'face': {
          steps.push({
            dur: 90,
            start: () => {
              const u = unit(ev.id);
              if (u) u.facing = ev.dir;
            },
          });
          break;
        }
        case 'push': {
          steps.push(moveStep(() => unit(ev.id), ev.from, ev.to, 120));
          break;
        }
        case 'charge': {
          const len = Math.max(Math.abs(ev.to.q - ev.from.q), Math.abs(ev.to.r - ev.from.r), 1);
          steps.push(moveStep(() => unit(ev.id), ev.from, ev.to, 50 * len + 60, 'linear'));
          break;
        }
        case 'slam': {
          steps.push({
            dur: 120,
            start: () => {
              scene.current.shake = Math.max(scene.current.shake, 5);
              floater('slam!', C.text, ev.at);
            },
            update: (t) => {
              const u = unit(ev.id);
              if (!u) return;
              const k = Math.sin(t * Math.PI) * 0.3;
              u.bq = (ev.at.q - u.q) * k;
              u.br = (ev.at.r - u.r) * k;
            },
          });
          break;
        }
        case 'fall': {
          steps.push({
            dur: 260,
            update: (t) => {
              const u = unit(ev.id);
              if (!u) return;
              u.scale = 1 - 0.7 * t;
              u.alpha = 1 - t;
            },
            end: () => scene.current.units.delete(ev.id),
          });
          break;
        }
        case 'throw': {
          const thrower = unit(ev.by);
          const from = thrower ? { q: thrower.q, r: thrower.r } : ev.at;
          steps.push({
            dur: 260,
            update: (t) => {
              scene.current.projectile = {
                q: lerp(from.q, ev.at.q, t),
                r: lerp(from.r, ev.at.r, t),
                dir: 0,
                kind: 'bomb',
                lift: Math.sin(t * Math.PI),
              };
            },
            end: () => {
              scene.current.projectile = null;
              scene.current.bombs.push({ q: ev.at.q, r: ev.at.r, fuse: 2 });
            },
          });
          break;
        }
        case 'explode': {
          steps.push({
            dur: 260,
            start: () => {
              scene.current.bombs = scene.current.bombs.filter((b) => b.q !== ev.at.q || b.r !== ev.at.r);
              scene.current.shake = Math.max(scene.current.shake, 9);
              navigator.vibrate?.(30);
            },
            update: (t) => (scene.current.blast = { q: ev.at.q, r: ev.at.r, t }),
            end: () => (scene.current.blast = null),
          });
          break;
        }
        case 'descend': {
          steps.push({ dur: 260, update: (t) => (scene.current.fade = t) });
          steps.push({
            dur: 300,
            start: () => {
              scene.current = sceneFromState(next, scene.current);
              scene.current.fade = 1;
              scene.current.floaters = [];
              const p = next.player.pos;
              floater(`Depth ${ev.depth}`, C.text, { q: p.q, r: p.r - 1 });
              if (ev.healed) floater('+1 ♥ floor cleared', C.heal, { q: p.q, r: p.r - 0.4 });
            },
            update: (t) => (scene.current.fade = 1 - t),
          });
          break;
        }
        case 'playerDeath': {
          steps.push({ dur: 450, start: () => (scene.current.shake = 12) });
          break;
        }
        case 'playerWait':
          steps.push({ dur: 120 });
          break;
      }
    }

    this.steps.push(...steps);
    this.onDone = () => {
      if (!events.some((e) => e.type === 'descend')) {
        scene.current = sceneFromState(next, scene.current);
      }
      onDone();
    };
  }

  /** Drop all pending steps without running their callbacks. */
  cancel(): void {
    this.steps = [];
    this.cur = null;
    this.onDone = null;
  }

  update(dt: number): void {
    // Run as many steps as fit in this frame (zero-length steps resolve instantly).
    let budget = dt;
    for (let guard = 0; guard < 64; guard++) {
      if (!this.cur) {
        this.cur = this.steps.shift() ?? null;
        if (!this.cur) {
          const done = this.onDone;
          this.onDone = null;
          done?.();
          return;
        }
        this.t = 0;
        this.cur.start?.();
      }
      const remaining = this.cur.dur - this.t;
      if (budget < remaining) {
        this.t += budget;
        this.cur.update?.(this.t / this.cur.dur);
        return;
      }
      budget -= remaining;
      this.cur.update?.(1);
      this.cur.end?.();
      this.cur = null;
    }
  }
}

function moveStep(
  get: () => VisUnit | undefined,
  from: Hex,
  to: Hex,
  dur: number,
  curve: 'ease' | 'linear' = 'ease',
): Step {
  return {
    dur,
    start: () => {
      const u = get();
      if (!u) return;
      const d = { q: to.q - from.q, r: to.r - from.r };
      const f = DIRS.findIndex((x) => x.q === d.q && x.r === d.r);
      if (f >= 0 && u.kind === 'player') u.facing = f;
    },
    update: (t) => {
      const u = get();
      if (!u) return;
      const k = curve === 'ease' ? ease(t) : t;
      u.q = lerp(from.q, to.q, k);
      u.r = lerp(from.r, to.r, k);
    },
  };
}
