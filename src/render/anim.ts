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
          if (ev.kind === 'arrow') break;
          const dur = ev.by === PLAYER_ID ? 90 : 140;
          steps.push({
            dur,
            update: (t) => {
              const a = unit(ev.by);
              const b = unit(ev.target);
              if (!a || !b) return;
              const k = Math.sin(t * Math.PI) * (ev.by === PLAYER_ID ? 0.25 : 0.35);
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
              };
            },
            end: () => (scene.current.projectile = null),
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

function moveStep(get: () => VisUnit | undefined, from: Hex, to: Hex, dur: number): Step {
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
      const k = ease(t);
      u.q = lerp(from.q, to.q, k);
      u.r = lerp(from.r, to.r, k);
    },
  };
}
