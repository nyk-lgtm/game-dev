// Draws one frame of the world: background grid, pickups, telegraphs,
// enemies, weapons, the player, bullets and effects.

import { BLOAT_SWELL, DART_AIM, PRISM_AIM, SLAM_AIM, SPIT_AIM, ENEMIES, RUN_SECONDS, type Enemy, type EnemyKind, type World } from '../core';
import type { Fx } from './fx';
import { glowSprite, sprite, type Shape, type Sprite } from './sprites';

export interface Camera {
  x: number;
  y: number;
  /** CSS px per world unit. */
  k: number;
  w: number;
  h: number;
}

const ENEMY_SHAPE: Record<EnemyKind, Shape> = {
  drone: 'tri',
  mite: 'tri',
  brute: 'square',
  dart: 'kite',
  spitter: 'pent',
  splitter: 'diamond',
  bloater: 'circle',
  orbiter: 'ring',
  warden: 'hex',
  prism: 'hex',
  eclipse: 'circle',
};

const PLAYER_HUE = 190;
const BULLET_HUE = 330;
const GEM_HUES = [200, 130, 280, 0];

function blit(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, rot = 0, scale = 1): void {
  if (rot === 0 && scale === 1) {
    ctx.drawImage(s.canvas, x - s.half, y - s.half, s.size, s.size);
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  if (scale !== 1) ctx.scale(scale, scale);
  ctx.drawImage(s.canvas, -s.half, -s.half, s.size, s.size);
  ctx.restore();
}

export function drawWorld(ctx: CanvasRenderingContext2D, w: World, fx: Fx, cam: Camera, time: number, joy: { ox: number; oy: number; x: number; y: number } | null): void {
  const { k } = cam;
  let shakeX = 0;
  let shakeY = 0;
  if (fx.shake > 0.3) {
    shakeX = (Math.random() - 0.5) * fx.shake;
    shakeY = (Math.random() - 0.5) * fx.shake;
  }
  const ox = cam.w / 2 - cam.x * k + shakeX;
  const oy = cam.h / 2 - cam.y * k + shakeY;
  const sx = (x: number) => x * k + ox;
  const sy = (y: number) => y * k + oy;
  const margin = 80;
  const onScreen = (x: number, y: number, r = 0) => {
    const X = sx(x);
    const Y = sy(y);
    return X > -margin - r * k && X < cam.w + margin + r * k && Y > -margin - r * k && Y < cam.h + margin + r * k;
  };

  // Background: deep night with a drifting grid.
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#05060d';
  ctx.fillRect(0, 0, cam.w, cam.h);
  const g = 80 * k;
  const gx = ((ox % g) + g) % g;
  const gy = ((oy % g) + g) % g;
  ctx.strokeStyle = 'rgba(80, 110, 200, 0.10)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = gx; x < cam.w; x += g) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, cam.h);
  }
  for (let y = gy; y < cam.h; y += g) {
    ctx.moveTo(0, y);
    ctx.lineTo(cam.w, y);
  }
  ctx.stroke();
  // Grid intersections glow faintly.
  ctx.fillStyle = 'rgba(120, 160, 255, 0.18)';
  for (let x = gx; x < cam.w; x += g) for (let y = gy; y < cam.h; y += g) ctx.fillRect(x - 1, y - 1, 2, 2);

  const p = w.player;

  // Auras under everything.
  for (const a of w.auras) {
    blit(ctx, glowSprite(a.hue, a.r, 0.28), sx(p.x), sy(p.y));
    ctx.beginPath();
    ctx.arc(sx(p.x), sy(p.y), a.r * k, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${a.hue}, 100%, 65%, ${0.25 + 0.1 * Math.sin(time * 4)})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Pickups.
  for (const it of w.pickups) {
    if (!onScreen(it.x, it.y)) continue;
    const bob = Math.sin(time * 4 + it.x * 0.1) * 1.5 * k;
    let s: Sprite;
    switch (it.kind) {
      case 'gem': {
        const tier = it.value < 3 ? 0 : it.value < 10 ? 1 : it.value < 40 ? 2 : 3;
        s = sprite('gem', GEM_HUES[tier], 3 + tier * 0.8);
        break;
      }
      case 'shard':
        s = sprite('diamond', 185, 3.2);
        break;
      case 'heart':
        s = sprite('cross', 355, 6);
        break;
      case 'magnet':
        s = sprite('ring', 220, 7);
        break;
      case 'bomb':
        s = sprite('star', 15, 8);
        break;
      default:
        s = sprite('square', 48, 9, 'elite');
    }
    blit(ctx, s, sx(it.x), sy(it.y) + bob);
  }

  // Mines.
  for (const m of w.mines) {
    if (!onScreen(m.x, m.y)) continue;
    const armed = m.arm <= 0;
    const blink = armed && Math.sin(time * 12 + m.x) > 0;
    blit(ctx, sprite('circle', 20, 6, blink ? 'white' : 'normal'), sx(m.x), sy(m.y));
  }

  // Telegraphs: what's about to hurt you.
  for (const e of w.enemies) drawTelegraph(ctx, e, sx, sy, k, time);

  // Enemies.
  for (const e of w.enemies) {
    if (!onScreen(e.x, e.y, e.r)) continue;
    const def = ENEMIES[e.kind];
    const shape = ENEMY_SHAPE[e.kind];
    const variant = e.flash > 0 ? 'white' : e.elite ? 'elite' : 'normal';
    let rot = 0;
    let scale = 1;
    if (e.kind === 'dart') rot = e.phase > 0 ? Math.atan2(e.ay, e.ax) : Math.atan2(p.y - e.y, p.x - e.x);
    else if (e.kind === 'prism') rot = time * 0.6;
    else if (shape === 'tri') rot = Math.atan2(p.y - e.y, p.x - e.x) + Math.PI / 2;
    if (e.kind === 'bloater' && e.phase === 1) scale = 1 + (e.t / BLOAT_SWELL) * 0.5 + 0.05 * Math.sin(time * 40);
    if (e.kind === 'eclipse') {
      blit(ctx, glowSprite(def.hue, e.r * 2.4, 0.35), sx(e.x), sy(e.y));
    }
    blit(ctx, sprite(shape, def.hue, def.r * (e.elite ? 1.4 : 1), variant), sx(e.x), sy(e.y), rot, scale);
    if (e.shielded) {
      ctx.beginPath();
      ctx.arc(sx(e.x), sy(e.y), (e.r + 4) * k, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(140,160,255,0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    if (e.kind === 'warden') {
      ctx.beginPath();
      ctx.arc(sx(e.x), sy(e.y), 95 * k, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(120,140,255,0.12)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  ctx.globalCompositeOperation = 'lighter';
  // Orbiting blades.
  for (const b of w.blades) blit(ctx, sprite('diamond', b.hue, b.r * 0.9), sx(b.x), sy(b.y), time * 8);

  // Player shots.
  for (const s of w.shots) {
    if (!onScreen(s.x, s.y)) continue;
    const disc = s.weapon === 'ricochet' || s.weapon === 'pinball';
    const hue = disc ? 300 : 190;
    blit(ctx, sprite(disc ? 'disc' : 'dot', hue, s.r), sx(s.x), sy(s.y));
  }
  ctx.globalCompositeOperation = 'source-over';

  // The player.
  const blink = p.iframes > 0 && Math.sin(time * 40) > 0;
  blit(ctx, glowSprite(PLAYER_HUE, 34, 0.35), sx(p.x), sy(p.y));
  if (!blink) blit(ctx, sprite('circle', PLAYER_HUE, 11), sx(p.x), sy(p.y));
  // Facing notch.
  ctx.beginPath();
  ctx.arc(sx(p.x + p.fx * 16), sy(p.y + p.fy * 16), 2.4 * k, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(220,250,255,0.9)';
  ctx.fill();
  // Health bar under the player.
  const hpw = 30 * k;
  const frac = Math.max(0, p.hp / w.stats.maxHp);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(sx(p.x) - hpw / 2, sy(p.y) + 17 * k, hpw, 3.5 * k);
  ctx.fillStyle = frac > 0.35 ? '#5ef0a0' : '#ff4d6d';
  ctx.fillRect(sx(p.x) - hpw / 2, sy(p.y) + 17 * k, hpw * frac, 3.5 * k);

  // Enemy bullets: hot pink, a color player shots never use.
  ctx.globalCompositeOperation = 'lighter';
  for (const b of w.bullets) {
    if (!onScreen(b.x, b.y)) continue;
    blit(ctx, sprite('dot', BULLET_HUE, b.r), sx(b.x), sy(b.y));
  }

  // Effects.
  for (const e of fx.effects) {
    const t = e.age / e.life;
    switch (e.kind) {
      case 'ring': {
        ctx.beginPath();
        ctx.arc(sx(e.x), sy(e.y), e.r * k * (0.35 + 0.65 * t), 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${e.hue}, 100%, 65%, ${0.7 * (1 - t)})`;
        ctx.lineWidth = (6 - 4 * t) * k;
        ctx.stroke();
        break;
      }
      case 'boom':
        blit(ctx, glowSprite(e.hue, e.r, 0.8 * (1 - t)), sx(e.x), sy(e.y), 0, 0.5 + 0.6 * t);
        break;
      case 'beam': {
        ctx.beginPath();
        ctx.moveTo(sx(e.x1), sy(e.y1));
        ctx.lineTo(sx(e.x2), sy(e.y2));
        ctx.strokeStyle = `hsla(${e.hue}, 100%, 60%, ${0.5 * (1 - t)})`;
        ctx.lineWidth = e.w * k * (1.4 - 0.6 * t);
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,240,${0.9 * (1 - t)})`;
        ctx.lineWidth = e.w * k * 0.35;
        ctx.stroke();
        break;
      }
      case 'chain': {
        ctx.beginPath();
        let s = e.seed;
        const jitter = () => {
          s = (s * 9301 + 49297) % 233280;
          return (s / 233280 - 0.5) * 14;
        };
        for (let i = 0; i + 3 < e.pts.length; i += 2) {
          const x1 = e.pts[i];
          const y1 = e.pts[i + 1];
          const x2 = e.pts[i + 2];
          const y2 = e.pts[i + 3];
          if (i === 0) ctx.moveTo(sx(x1), sy(y1));
          for (let j = 1; j <= 3; j++) ctx.lineTo(sx(x1 + ((x2 - x1) * j) / 4 + jitter()), sy(y1 + ((y2 - y1) * j) / 4 + jitter()));
          ctx.lineTo(sx(x2), sy(y2));
        }
        ctx.strokeStyle = `hsla(${e.hue}, 100%, 70%, ${1 - t})`;
        ctx.lineWidth = 2.5 * k;
        ctx.lineJoin = 'round';
        ctx.stroke();
        break;
      }
    }
  }
  for (const q of fx.particles) {
    const a = q.life / q.max;
    ctx.fillStyle = `hsla(${q.hue}, 100%, 65%, ${a})`;
    const r = q.size * k * (0.5 + a);
    ctx.fillRect(sx(q.x) - r, sy(q.y) - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = 'source-over';

  // Arrows at the screen edge pointing to off-screen bosses and elites.
  for (const e of w.enemies) {
    if (!e.elite && e.kind !== 'prism' && e.kind !== 'eclipse') continue;
    const X = sx(e.x);
    const Y = sy(e.y);
    if (X > 0 && X < cam.w && Y > 60 && Y < cam.h) continue;
    const cx = cam.w / 2;
    const cy = cam.h / 2;
    const a = Math.atan2(Y - cy, X - cx);
    const t = Math.min((cam.w / 2 - 22) / Math.abs(Math.cos(a) || 1e-6), (cam.h / 2 - 70) / Math.abs(Math.sin(a) || 1e-6));
    const ax = cx + Math.cos(a) * t;
    const ay = cy + Math.sin(a) * t;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-6, -8);
    ctx.lineTo(-6, 8);
    ctx.closePath();
    ctx.fillStyle = e.elite ? 'rgba(255,209,102,0.9)' : 'rgba(255,61,139,0.95)';
    ctx.fill();
    ctx.restore();
  }

  // Joystick.
  if (joy) {
    ctx.beginPath();
    ctx.arc(joy.ox, joy.oy, 56, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(160,220,255,0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(joy.x, joy.y, 22, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(160,220,255,0.25)';
    ctx.fill();
  }

  // Damage vignette and level-up flash.
  if (fx.hurt > 0.01) {
    const vg = ctx.createRadialGradient(cam.w / 2, cam.h / 2, Math.min(cam.w, cam.h) * 0.3, cam.w / 2, cam.h / 2, Math.max(cam.w, cam.h) * 0.75);
    vg.addColorStop(0, 'rgba(255,40,80,0)');
    vg.addColorStop(1, `rgba(255,40,80,${0.4 * fx.hurt})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, cam.w, cam.h);
  }
  if (fx.levelFlash > 0.01) {
    ctx.fillStyle = `rgba(120,230,255,${0.12 * fx.levelFlash})`;
    ctx.fillRect(0, 0, cam.w, cam.h);
  }
  // The finale darkens the world.
  if (w.time > RUN_SECONDS - 5) {
    const d = Math.min(1, (w.time - (RUN_SECONDS - 5)) / 5);
    ctx.fillStyle = `rgba(40,0,10,${0.18 * d})`;
    ctx.fillRect(0, 0, cam.w, cam.h);
  }
}

function drawTelegraph(ctx: CanvasRenderingContext2D, e: Enemy, sx: (x: number) => number, sy: (y: number) => number, k: number, time: number): void {
  const X = sx(e.x);
  const Y = sy(e.y);
  const warn = (alpha: number) => `rgba(255, 60, 110, ${alpha})`;
  if (e.kind === 'dart' && e.phase === 1) {
    const t = e.t / DART_AIM;
    ctx.beginPath();
    ctx.moveTo(X, Y);
    ctx.lineTo(X + e.ax * 145 * k, Y + e.ay * 145 * k);
    ctx.strokeStyle = warn(0.25 + 0.5 * t);
    ctx.lineWidth = (3 + 6 * t) * k * 0.5;
    ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (e.kind === 'spitter' && e.phase === 1) {
    const t = e.t / SPIT_AIM;
    ctx.beginPath();
    ctx.arc(X, Y, (e.r + 8 * (1 - t)) * k, 0, Math.PI * 2);
    ctx.strokeStyle = warn(0.4 + 0.5 * t);
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (e.kind === 'bloater' && e.phase === 1) {
    const t = e.t / BLOAT_SWELL;
    ctx.beginPath();
    ctx.arc(X, Y, 78 * k, 0, Math.PI * 2);
    ctx.fillStyle = warn(0.08 + 0.18 * t);
    ctx.fill();
    ctx.strokeStyle = warn(0.5 + 0.4 * Math.sin(time * 30));
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (e.kind === 'prism' && e.phase === 1) {
    const t = e.t / PRISM_AIM;
    ctx.beginPath();
    ctx.moveTo(X, Y);
    ctx.lineTo(X + Math.cos(e.ay) * 280 * k, Y + Math.sin(e.ay) * 280 * k);
    ctx.strokeStyle = warn(0.3 + 0.5 * t);
    ctx.lineWidth = e.r * 2 * k * 0.6;
    ctx.stroke();
  } else if (e.kind === 'eclipse' && e.ay === 1) {
    const cycle = e.hp < e.maxHp * 0.35 ? 9 : 12;
    const t = Math.min(1, ((e.t % cycle) - 4) / SLAM_AIM);
    const SX = sx(e.sx);
    const SY = sy(e.sy);
    ctx.beginPath();
    ctx.arc(SX, SY, 150 * k, 0, Math.PI * 2);
    ctx.fillStyle = warn(0.06);
    ctx.fill();
    ctx.strokeStyle = warn(0.7);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(SX, SY, 150 * k * t, 0, Math.PI * 2);
    ctx.fillStyle = warn(0.18);
    ctx.fill();
  }
}
