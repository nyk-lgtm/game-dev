// Render-only effects fed by the sim's FxEvents: particles, shockwave rings,
// beams, lightning, explosions, screen shake, banners.

import { ENEMIES, type FxEvent } from '../core';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  hue: number;
  size: number;
}

export type Effect =
  | { kind: 'ring'; x: number; y: number; r: number; hue: number; age: number; life: number }
  | { kind: 'boom'; x: number; y: number; r: number; hue: number; age: number; life: number }
  | { kind: 'beam'; x1: number; y1: number; x2: number; y2: number; w: number; hue: number; age: number; life: number }
  | { kind: 'chain'; pts: number[]; hue: number; age: number; life: number; seed: number };

export const MAX_PARTICLES = 320;

export class Fx {
  particles: Particle[] = [];
  effects: Effect[] = [];
  shake = 0;
  hurt = 0;
  banner: { text: string; age: number } | null = null;
  levelFlash = 0;
  /** Event counts for this frame (drives audio). */
  counts = { hit: 0, kill: 0, bigKill: 0, gem: 0, pickup: 0, chest: 0, hurt: 0, ring: 0, chain: 0, beam: 0, boom: 0, level: 0, warn: 0 };

  private burst(x: number, y: number, hue: number, n: number, speed: number, size: number): void {
    for (let i = 0; i < n; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      const life = 0.25 + Math.random() * 0.35;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, hue, size });
    }
  }

  consume(events: FxEvent[]): void {
    for (const c of Object.keys(this.counts) as (keyof Fx['counts'])[]) this.counts[c] = 0;
    for (const e of events) {
      switch (e.type) {
        case 'hit':
          this.counts.hit++;
          if (Math.random() < 0.3) this.burst(e.x, e.y, e.color, 1, 120, 1.6);
          break;
        case 'kill': {
          const def = ENEMIES[e.kind];
          const big = e.elite || e.kind === 'prism' || e.kind === 'eclipse';
          if (big) this.counts.bigKill++;
          else this.counts.kill++;
          this.burst(e.x, e.y, def.hue, big ? 40 : 6, big ? 260 : 140, big ? 3 : 2);
          if (big) {
            this.effects.push({ kind: 'ring', x: e.x, y: e.y, r: def.r * 4, hue: e.elite ? 48 : def.hue, age: 0, life: 0.6 });
            this.shake = Math.max(this.shake, 10);
          }
          break;
        }
        case 'ring':
          this.counts.ring++;
          this.effects.push({ kind: 'ring', x: e.x, y: e.y, r: e.r, hue: e.color, age: 0, life: 0.35 });
          break;
        case 'boom':
          this.counts.boom++;
          this.effects.push({ kind: 'boom', x: e.x, y: e.y, r: e.r, hue: e.color, age: 0, life: 0.35 });
          this.burst(e.x, e.y, e.color + 20, 10, 200, 2.2);
          this.shake = Math.max(this.shake, 4);
          break;
        case 'beam':
          this.counts.beam++;
          this.effects.push({ kind: 'beam', x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, w: e.w, hue: e.color, age: 0, life: 0.18 });
          break;
        case 'chain':
          this.counts.chain++;
          this.effects.push({ kind: 'chain', pts: e.pts, hue: e.color, age: 0, life: 0.22, seed: Math.random() * 1000 });
          break;
        case 'hurt':
          this.counts.hurt++;
          this.hurt = 1;
          this.shake = Math.max(this.shake, 6);
          break;
        case 'pickup':
          if (e.kind === 'gem' || e.kind === 'shard') this.counts.gem++;
          else if (e.kind === 'chest') this.counts.chest++;
          else this.counts.pickup++;
          break;
        case 'levelUp':
          this.counts.level++;
          this.levelFlash = 1;
          break;
        case 'warn':
          this.counts.warn++;
          this.banner = { text: e.text, age: 0 };
          break;
      }
    }
  }

  update(dt: number): void {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const e of this.effects) e.age += dt;
    this.effects = this.effects.filter((e) => e.age < e.life);
    this.shake *= Math.pow(0.002, dt);
    this.hurt = Math.max(0, this.hurt - dt * 3);
    this.levelFlash = Math.max(0, this.levelFlash - dt * 2);
    if (this.banner) {
      this.banner.age += dt;
      if (this.banner.age > 2.6) this.banner = null;
    }
  }
}
