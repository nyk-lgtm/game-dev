// Battle lane renderer: enemies march down toward the tower at the bottom,
// spells flare as they resolve.

import { ASPECT, ELEMENT_HUE, ENEMIES, type Battle, type BattleFx, type Element, type EnemyKind } from './core';

interface Flash {
  fx: BattleFx;
  age: number;
  life: number;
}

const SHAPE: Record<EnemyKind, number> = { imp: 3, knight: 4, wisp: 0, golem: 6, splitter: 4, mender: 5, drake: 3, warden: 6, colossus: 8, lich: 5 };

export class Lane {
  private flashes: Flash[] = [];
  private floaters: { x: number; y: number; text: string; age: number; hue: number }[] = [];
  shake = 0;

  consume(fx: BattleFx[]): void {
    for (const f of fx) {
      if (f.type === 'hit' && Math.random() > 0.35) continue;
      const life = f.type === 'beam' ? 0.25 : f.type === 'nova' ? 0.4 : f.type === 'chain' ? 0.2 : f.type === 'strike' ? 0.35 : f.type === 'kill' ? 0.4 : 0.15;
      if (this.flashes.length < 160) this.flashes.push({ fx: f, age: 0, life });
      if (f.type === 'kill' && f.gold > 0) this.floaters.push({ x: f.x, y: f.y, text: `+${f.gold}`, age: 0, hue: 48 });
      if (f.type === 'leak') this.shake = 8;
    }
  }

  update(dt: number): void {
    for (const f of this.flashes) f.age += dt;
    this.flashes = this.flashes.filter((f) => f.age < f.life);
    for (const f of this.floaters) f.age += dt;
    this.floaters = this.floaters.filter((f) => f.age < 0.9);
    this.shake *= Math.pow(0.01, dt);
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, b: Battle | null, time: number, castGlow: number[]): void {
    // The lane maps x 0..1 across the width; y 0..1 down a height of w * ASPECT (or less).
    const lh = Math.min(h - 10, w * ASPECT);
    const lw = lh / ASPECT;
    const ox = (w - lw) / 2 + (Math.random() - 0.5) * this.shake;
    const oy = 4;
    const X = (x: number) => ox + x * lw;
    const Y = (y: number) => oy + y * lh;
    const S = lw;

    ctx.fillStyle = '#0b0716';
    ctx.fillRect(0, 0, w, h);
    // Path stones.
    const g = ctx.createLinearGradient(0, oy, 0, oy + lh);
    g.addColorStop(0, 'rgba(60,40,110,0.05)');
    g.addColorStop(1, 'rgba(120,80,200,0.22)');
    ctx.fillStyle = g;
    ctx.fillRect(X(0), Y(0), lw, lh);
    ctx.strokeStyle = 'rgba(160,120,255,0.12)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
      ctx.beginPath();
      ctx.moveTo(X(0), Y(i / 10));
      ctx.lineTo(X(1), Y(i / 10));
      ctx.stroke();
    }
    // Drifting motes of loose magic.
    for (let i = 0; i < 26; i++) {
      const mx = ((i * 0.6180339 + Math.sin(time * 0.2 + i) * 0.03) % 1 + 1) % 1;
      const my = 1 - ((time * (0.01 + (i % 5) * 0.004) + i * 0.137) % 1);
      ctx.fillStyle = `hsla(${260 + (i % 4) * 20}, 90%, 75%, ${0.15 + 0.25 * Math.sin(time * 1.5 + i) ** 2})`;
      ctx.fillRect(X(mx), Y(my), 2, 2);
    }
    // Lane edges glow faintly.
    ctx.fillStyle = 'rgba(176,140,255,0.18)';
    ctx.fillRect(X(0) - 1, Y(0), 2, lh);
    ctx.fillRect(X(1) - 1, Y(0), 2, lh);
    // The tower: a crystal on a rune circle.
    const tx = X(0.5);
    const ty = Y(1);
    ctx.beginPath();
    ctx.ellipse(tx, ty - 6, S * 0.2, S * 0.06, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(180,140,255,${0.35 + 0.15 * Math.sin(time * 2)})`;
    ctx.stroke();
    for (let r = 0; r < 3; r++) {
      if (castGlow[r] <= 0) continue;
      ctx.beginPath();
      ctx.ellipse(tx, ty - 6, S * (0.08 + r * 0.05), S * (0.025 + r * 0.015), 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,220,160,${castGlow[r]})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(tx, ty - S * 0.14);
    ctx.lineTo(tx + S * 0.05, ty - S * 0.06);
    ctx.lineTo(tx, ty);
    ctx.lineTo(tx - S * 0.05, ty - S * 0.06);
    ctx.closePath();
    ctx.fillStyle = '#c9b2ff';
    ctx.shadowColor = '#a07cff';
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.shadowBlur = 0;

    if (!b) return;

    // Effects under enemies.
    for (const f of this.flashes) {
      const t = f.age / f.life;
      const e = f.fx;
      if (e.type === 'nova') {
        ctx.beginPath();
        ctx.ellipse(tx, ty, e.r * lw * (0.5 + 0.5 * t), (e.r / ASPECT) * lh * (0.5 + 0.5 * t), 0, Math.PI, Math.PI * 2);
        ctx.strokeStyle = hsla(e.element, 1 - t);
        ctx.lineWidth = 6 * (1 - t) + 1;
        ctx.stroke();
      } else if (e.type === 'beam') {
        ctx.fillStyle = hsla(e.element, 0.5 * (1 - t));
        ctx.fillRect(X(e.x) - S * 0.03, Y(0), S * 0.06, ty - Y(0));
        ctx.fillStyle = `rgba(255,255,240,${0.8 * (1 - t)})`;
        ctx.fillRect(X(e.x) - 1.5, Y(0), 3, ty - Y(0));
      } else if (e.type === 'strike') {
        ctx.beginPath();
        ctx.moveTo(X(e.x), Y(e.y) - S * 0.5 * (1 - t));
        ctx.lineTo(X(e.x), Y(e.y));
        ctx.strokeStyle = hsla(e.element, 1 - t);
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(X(e.x), Y(e.y), S * 0.07 * (0.5 + t), 0, Math.PI * 2);
        ctx.fillStyle = hsla(e.element, 0.35 * (1 - t));
        ctx.fill();
      }
    }

    // Enemies.
    for (const e of b.enemies) {
      const d = ENEMIES[e.kind];
      const r = d.r * lw;
      const x = X(e.x);
      const y = Y(e.y) - (d.flying ? r * 0.6 + Math.sin(time * 6 + e.id) * 2 : 0);
      if (d.flying) {
        ctx.beginPath();
        ctx.ellipse(x, Y(e.y) + r * 0.4, r * 0.8, r * 0.25, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fill();
      }
      const n = SHAPE[e.kind];
      ctx.beginPath();
      if (n === 0) ctx.arc(x, y, r, 0, Math.PI * 2);
      else
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (i / n) * Math.PI * 2 + (e.kind === 'knight' || e.kind === 'splitter' ? Math.PI / 4 : 0);
          if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
          else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
      ctx.closePath();
      const frozen = e.slow > 0;
      ctx.fillStyle = e.flash > 0 ? '#ffffff' : `hsl(${d.hue}, ${frozen ? 40 : 85}%, ${frozen ? 70 : 55}%)`;
      ctx.shadowColor = `hsl(${d.hue}, 100%, 55%)`;
      ctx.shadowBlur = r * 0.8;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(x, y + (n === 3 ? r * 0.2 : 0), r * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${d.hue}, 100%, 88%, 0.85)`;
      ctx.fill();
      if (e.burn > 0 && e.burnT > 0) {
        ctx.fillStyle = `rgba(255,140,40,${0.5 + 0.3 * Math.sin(time * 20)})`;
        ctx.fillRect(x - r * 0.3, y - r * 1.3, r * 0.6, r * 0.4);
      }
      if (e.shield > 0) {
        ctx.beginPath();
        ctx.arc(x, y, r * 1.3, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(150,200,255,0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (e.hp < e.maxHp) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x - r, y + r + 3, r * 2, 3);
        ctx.fillStyle = '#ff5d7a';
        ctx.fillRect(x - r, y + r + 3, r * 2 * Math.max(0, e.hp / e.maxHp), 3);
      }
    }

    // Projectiles, with a fading tail along their velocity.
    ctx.lineCap = 'round';
    for (const p of b.projectiles) {
      const big = p.spell.caster === 'orb';
      const tail = big ? 0.12 : 0.06;
      const grad = ctx.createLinearGradient(X(p.x - p.vx * tail), Y(p.y - p.vy * tail), X(p.x), Y(p.y));
      grad.addColorStop(0, hsla(p.spell.element, 0));
      grad.addColorStop(1, hsla(p.spell.element, 0.9));
      ctx.beginPath();
      ctx.moveTo(X(p.x - p.vx * tail), Y(p.y - p.vy * tail));
      ctx.lineTo(X(p.x), Y(p.y));
      ctx.strokeStyle = grad;
      ctx.lineWidth = (big ? 0.04 : 0.018) * lw;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(X(p.x), Y(p.y), (big ? 0.03 : 0.014) * lw, 0, Math.PI * 2);
      ctx.fillStyle = hsla(p.spell.element, 1);
      ctx.shadowColor = hsla(p.spell.element, 1);
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(X(p.x), Y(p.y), (big ? 0.014 : 0.007) * lw, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }

    // Effects over enemies.
    for (const f of this.flashes) {
      const t = f.age / f.life;
      const e = f.fx;
      if (e.type === 'chain') {
        ctx.beginPath();
        for (let i = 0; i < e.pts.length; i += 2) {
          const jx = i ? (Math.random() - 0.5) * 6 : 0;
          if (i === 0) ctx.moveTo(X(e.pts[i]), Y(e.pts[i + 1]));
          else ctx.lineTo(X(e.pts[i]) + jx, Y(e.pts[i + 1]) + jx);
        }
        ctx.strokeStyle = hsla(e.element, 1 - t);
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (e.type === 'kill') {
        ctx.beginPath();
        ctx.arc(X(e.x), Y(e.y), S * 0.05 * (0.5 + t), 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${ENEMIES[e.kind].hue}, 100%, 70%, ${1 - t})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (e.type === 'hit') {
        ctx.fillStyle = hsla(e.element, 1 - t);
        ctx.fillRect(X(e.x) - 2, Y(e.y) - 2, 4, 4);
      }
    }
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const f of this.floaters) {
      ctx.fillStyle = `rgba(255,209,102,${1 - f.age / 0.9})`;
      ctx.fillText(f.text, X(f.x), Y(f.y) - 10 - f.age * 20);
    }
  }
}

function hsla(el: Element, a: number): string {
  return `hsla(${ELEMENT_HUE[el]}, 100%, 65%, ${Math.max(0, a)})`;
}
