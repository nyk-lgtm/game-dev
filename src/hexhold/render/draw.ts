// Drawing Hexhold: a night-time hex field in ink blue and brass. Ground,
// the live path, towers (with glowing links to the neighbors they help),
// enemies, and short-lived effects.
import { reducedFx } from '../../shared/settings';

import { fitHexes, hexPath, type HexLayout } from '../../shared/hexlayout';
import {
  ADJ,
  CELL,
  ENEMIES,
  HEXES,
  LEVEL_RANGE,
  N,
  POS,
  TOWERS,
  buried,
  pathFrom,
  towerStats,
  type Enemy,
  type EnemyId,
  type State,
  type TowerId,
} from '../core';

export interface View {
  L: HexLayout;
  w: number;
  h: number;
}

export function layout(w: number, h: number): View {
  return { L: fitHexes(HEXES, w, h, 6), w, h };
}

export const sx = (v: View, i: number) => POS[i].x * v.L.size + v.L.ox;
export const sy = (v: View, i: number) => POS[i].y * v.L.size + v.L.oy;
const wx = (v: View, x: number) => x * v.L.size + v.L.ox;
const wy = (v: View, y: number) => y * v.L.size + v.L.oy;

/** Paths from each portal to the core following a distance field. */
export function pathCells(dist: number[], portals: number[]): number[][] {
  return portals.map((p) => pathFrom(dist, p));
}

// ---------------------------------------------------------------- tower icons

/** A tower's emblem, centered at (x, y) with radius r. */
export function drawTowerIcon(g: CanvasRenderingContext2D, id: TowerId, x: number, y: number, r: number, level = 1, alpha = 1): void {
  const def = TOWERS[id];
  g.save();
  g.globalAlpha = alpha;
  // Base plinth.
  g.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 3) * k;
    const px = x + Math.cos(a) * r * 0.86;
    const py = y + Math.sin(a) * r * 0.86;
    if (k === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  g.fillStyle = '#1c2438';
  g.fill();
  g.lineWidth = Math.max(1.5, r * 0.09);
  g.strokeStyle = '#c9a25c';
  g.stroke();
  // Emblem.
  g.fillStyle = def.color;
  g.strokeStyle = def.color;
  g.lineWidth = Math.max(1.5, r * 0.12);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const s = r * 0.5;
  g.beginPath();
  switch (id) {
    case 'bolt':
      g.moveTo(x - s * 0.7, y + s * 0.7);
      g.lineTo(x + s * 0.7, y - s * 0.7);
      g.moveTo(x + s * 0.7, y - s * 0.7);
      g.lineTo(x + s * 0.05, y - s * 0.65);
      g.moveTo(x + s * 0.7, y - s * 0.7);
      g.lineTo(x + s * 0.65, y - s * 0.05);
      g.stroke();
      break;
    case 'mortar':
      g.arc(x, y + s * 0.2, s * 0.62, Math.PI, 0);
      g.closePath();
      g.fill();
      g.beginPath();
      g.arc(x + s * 0.3, y - s * 0.55, s * 0.18, 0, Math.PI * 2);
      g.fill();
      break;
    case 'frost':
      for (let k = 0; k < 3; k++) {
        const a = (Math.PI / 3) * k;
        g.moveTo(x - Math.cos(a) * s * 0.8, y - Math.sin(a) * s * 0.8);
        g.lineTo(x + Math.cos(a) * s * 0.8, y + Math.sin(a) * s * 0.8);
      }
      g.stroke();
      break;
    case 'tesla':
      g.moveTo(x - s * 0.15, y - s * 0.8);
      g.lineTo(x - s * 0.45, y + s * 0.05);
      g.lineTo(x + s * 0.2, y + s * 0.05);
      g.lineTo(x - s * 0.05, y + s * 0.8);
      g.lineTo(x + s * 0.5, y - s * 0.15);
      g.lineTo(x - s * 0.05, y - s * 0.15);
      g.closePath();
      g.fill();
      break;
    case 'flame':
      g.moveTo(x, y + s * 0.75);
      g.quadraticCurveTo(x - s * 0.75, y + s * 0.1, x - s * 0.05, y - s * 0.8);
      g.quadraticCurveTo(x + s * 0.2, y - s * 0.2, x + s * 0.4, y - s * 0.35);
      g.quadraticCurveTo(x + s * 0.75, y + s * 0.2, x, y + s * 0.75);
      g.fill();
      break;
    case 'beacon':
      for (let k = 0; k < 8; k++) {
        const a = (Math.PI / 4) * k;
        g.moveTo(x + Math.cos(a) * s * 0.4, y + Math.sin(a) * s * 0.4);
        g.lineTo(x + Math.cos(a) * s * 0.8, y + Math.sin(a) * s * 0.8);
      }
      g.stroke();
      g.beginPath();
      g.arc(x, y, s * 0.28, 0, Math.PI * 2);
      g.fill();
      break;
  }
  // Level pips.
  for (let k = 0; k < level; k++) {
    g.beginPath();
    g.arc(x + (k - (level - 1) / 2) * r * 0.26, y + r * 0.66, r * 0.08, 0, Math.PI * 2);
    g.fillStyle = '#ffe9b0';
    g.fill();
  }
  g.restore();
}

// ---------------------------------------------------------------- enemies

const SHAPE: Record<EnemyId, 'circle' | 'tri' | 'square' | 'diamond' | 'wing' | 'cross' | 'hex' | 'boss'> = {
  runner: 'tri',
  grunt: 'circle',
  swarm: 'circle',
  brute: 'square',
  flyer: 'wing',
  healer: 'cross',
  splitter: 'hex',
  digger: 'diamond',
  boss: 'boss',
};

function drawEnemy(g: CanvasRenderingContext2D, v: View, e: Enemy, time: number) {
  const def = ENEMIES[e.id];
  const x = wx(v, e.x);
  const y = wy(v, e.y);
  const base = v.L.size * (e.id === 'boss' ? 0.62 : e.id === 'swarm' ? 0.2 : e.id === 'brute' ? 0.38 : 0.3);
  const fly = !!def.fly;
  const bob = fly ? Math.sin(time * 6 + e.uid) * v.L.size * 0.06 : 0;
  // Shadow.
  g.beginPath();
  g.ellipse(x, y + base * 0.75 + (fly ? v.L.size * 0.25 : 0), base * 0.8, base * 0.3, 0, 0, Math.PI * 2);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fill();
  const cy = y - (fly ? v.L.size * 0.2 : 0) + bob;
  g.fillStyle = e.chill > 0 ? '#bfe6ff' : def.color;
  g.strokeStyle = 'rgba(10,12,20,0.85)';
  g.lineWidth = Math.max(1.2, base * 0.16);
  g.beginPath();
  switch (SHAPE[e.id]) {
    case 'circle':
      g.arc(x, cy, base, 0, Math.PI * 2);
      break;
    case 'tri': {
      const a = Math.atan2(POS[e.next].y - POS[e.cell].y, POS[e.next].x - POS[e.cell].x);
      for (let k = 0; k < 3; k++) {
        const t = a + (k * Math.PI * 2) / 3;
        const px = x + Math.cos(t) * base * 1.15;
        const py = cy + Math.sin(t) * base * 1.15;
        if (k === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      break;
    }
    case 'square':
      g.roundRect(x - base, cy - base, base * 2, base * 2, base * 0.3);
      break;
    case 'wing': {
      const f = Math.sin(time * 14 + e.uid) * 0.4;
      g.moveTo(x, cy);
      g.quadraticCurveTo(x - base * 1.4, cy - base * (1 + f), x - base * 1.6, cy + base * 0.2);
      g.quadraticCurveTo(x - base * 0.6, cy + base * 0.1, x, cy + base * 0.5);
      g.quadraticCurveTo(x + base * 0.6, cy + base * 0.1, x + base * 1.6, cy + base * 0.2);
      g.quadraticCurveTo(x + base * 1.4, cy - base * (1 + f), x, cy);
      break;
    }
    case 'cross':
      g.roundRect(x - base * 0.35, cy - base, base * 0.7, base * 2, 2);
      g.roundRect(x - base, cy - base * 0.35, base * 2, base * 0.7, 2);
      break;
    case 'hex':
      hexPath(g, x, cy, base * 1.05);
      break;
    case 'diamond':
      g.moveTo(x, cy - base * 1.2);
      g.lineTo(x + base, cy);
      g.lineTo(x, cy + base * 1.2);
      g.lineTo(x - base, cy);
      g.closePath();
      break;
    case 'boss':
      for (let k = 0; k < 10; k++) {
        const t = (k * Math.PI) / 5 + time * 0.4;
        const rr = k % 2 ? base * 0.75 : base;
        const px = x + Math.cos(t) * rr;
        const py = cy + Math.sin(t) * rr;
        if (k === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      break;
  }
  g.fill();
  g.stroke();
  if (e.burn > 0) {
    g.fillStyle = 'rgba(255,120,40,0.85)';
    g.beginPath();
    g.arc(x + base * 0.6, cy - base * 0.7, base * 0.3 + Math.sin(time * 20) * base * 0.06, 0, Math.PI * 2);
    g.fill();
  }
  if (e.stun > 0) {
    g.strokeStyle = '#e6d2ff';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(x, cy - base * 1.3, base * 0.5, 0, Math.PI * 2);
    g.stroke();
  }
  // Health bar once hurt.
  if (e.hp < e.maxHp) {
    const bw = Math.max(16, base * 2.2);
    const bx = x - bw / 2;
    const by = cy - base - 7;
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(bx, by, bw, 3.5);
    g.fillStyle = e.hp / e.maxHp > 0.4 ? '#7ee08a' : '#ff6b5e';
    g.fillRect(bx, by, (bw * Math.max(0, e.hp)) / e.maxHp, 3.5);
  }
}

// ---------------------------------------------------------------- effects

export interface Effect {
  kind: 'shot' | 'burst' | 'chain' | 'die' | 'gold';
  pts: number[];
  color: string;
  t0: number;
  life: number;
  text?: string;
  r?: number;
}

// ---------------------------------------------------------------- the board

export interface DrawOpts {
  time: number;
  selected: number;
  /** A tower being considered for the selected cell. */
  ghost: TowerId | null;
  /** The paths as they would be with the ghost built. */
  ghostPath: number[][] | null;
  /** Towers the ghost's path would walk past (circled red). */
  bypass: number[];
  /** Burrowers are coming: show their straight route. */
  showDig: boolean;
  effects: Effect[];
  /** 0..1 red flash after a leak. */
  hurt: number;
}

export function drawBoard(g: CanvasRenderingContext2D, v: View, s: State, o: DrawOpts): void {
  const size = v.L.size;
  // Background.
  const bg = g.createLinearGradient(0, 0, 0, v.h);
  bg.addColorStop(0, '#0e1424');
  bg.addColorStop(1, '#141a2c');
  g.fillStyle = bg;
  g.fillRect(0, 0, v.w, v.h);

  // Ground.
  for (let i = 0; i < N; i++) {
    const x = sx(v, i);
    const y = sy(v, i);
    const gr = s.ground[i];
    hexPath(g, x, y, size * 0.96);
    g.fillStyle = gr === 'rock' ? '#2a2f3d' : gr === 'ley' ? '#16324a' : gr === 'portal' ? '#2c1a46' : gr === 'core' ? '#3a2e14' : (HEXES[i].q + HEXES[i].r) % 2 ? '#1a2236' : '#1c2539';
    g.fill();
    if (gr === 'rock') {
      g.fillStyle = '#3c4255';
      g.beginPath();
      g.ellipse(x - size * 0.15, y + size * 0.05, size * 0.38, size * 0.28, -0.3, 0, Math.PI * 2);
      g.ellipse(x + size * 0.25, y - size * 0.12, size * 0.25, size * 0.2, 0.4, 0, Math.PI * 2);
      g.fill();
    } else if (gr === 'ley') {
      g.strokeStyle = `rgba(110, 220, 255, ${0.35 + 0.15 * Math.sin(o.time * 2 + i)})`;
      g.lineWidth = 1.5;
      hexPath(g, x, y, size * 0.7);
      g.stroke();
    } else if (gr === 'portal') {
      for (let k = 0; k < 3; k++) {
        g.strokeStyle = `rgba(196, 140, 255, ${0.8 - k * 0.22})`;
        g.lineWidth = 2;
        g.beginPath();
        const a0 = o.time * (2 + k) + k * 2;
        g.arc(x, y, size * (0.25 + k * 0.17), a0, a0 + 3.6);
        g.stroke();
      }
    } else if (gr === 'core') {
      const pulse = 1 + 0.06 * Math.sin(o.time * 3);
      g.fillStyle = '#ffd77a';
      g.beginPath();
      g.moveTo(x, y - size * 0.55 * pulse);
      g.lineTo(x + size * 0.35 * pulse, y);
      g.lineTo(x, y + size * 0.55 * pulse);
      g.lineTo(x - size * 0.35 * pulse, y);
      g.closePath();
      g.fill();
    }
  }

  // The path enemies will walk (and the one they'd walk with the ghost built).
  const drawPath = (cells: number[], color: string, dash: number[]) => {
    g.save();
    g.strokeStyle = color;
    g.lineWidth = Math.max(2, size * 0.1);
    g.setLineDash(dash);
    g.lineDashOffset = -o.time * 18;
    g.beginPath();
    cells.forEach((c, k) => (k ? g.lineTo(sx(v, c), sy(v, c)) : g.moveTo(sx(v, c), sy(v, c))));
    g.stroke();
    g.restore();
  };
  // Burrowers' straight route: a faint line strung with small diamonds in their own color,
  // so it can't be mistaken for the walking path's pale dashes.
  if (o.showDig) {
    const seen = new Set<number>();
    for (const p of pathCells(s.dig, s.portals)) {
      drawPath(p, 'rgba(143, 168, 255, 0.35)', []);
      for (const c of p) {
        if (seen.has(c) || s.ground[c] === 'portal' || s.ground[c] === 'core') continue;
        seen.add(c);
        const x = sx(v, c);
        const y = sy(v, c);
        const d = size * 0.2;
        g.beginPath();
        g.moveTo(x, y - d * 1.3);
        g.lineTo(x + d, y);
        g.lineTo(x, y + d * 1.3);
        g.lineTo(x - d, y);
        g.closePath();
        g.fillStyle = 'rgba(143, 168, 255, 0.85)';
        g.fill();
        g.strokeStyle = 'rgba(10, 12, 20, 0.8)';
        g.lineWidth = 1;
        g.stroke();
      }
    }
  }
  for (const p of pathCells(s.field.dist, s.portals)) drawPath(p, 'rgba(255, 210, 120, 0.28)', [4, 8]);
  if (o.ghostPath) for (const p of o.ghostPath) drawPath(p, 'rgba(140, 230, 255, 0.75)', [6, 6]);

  // Links between towers that help each other.
  g.save();
  g.lineWidth = Math.max(2, size * 0.12);
  for (let i = 0; i < N; i++) {
    const t = s.towers[i];
    if (!t) continue;
    for (const j of ADJ[i]) {
      if (j < i || !s.towers[j]) continue;
      g.strokeStyle = `rgba(255, 220, 140, ${0.18 + 0.08 * Math.sin(o.time * 3 + i)})`;
      g.beginPath();
      g.moveTo(sx(v, i), sy(v, i));
      g.lineTo(sx(v, j), sy(v, j));
      g.stroke();
    }
  }
  g.restore();

  // Selection, range ring, ghost.
  if (o.selected >= 0) {
    const x = sx(v, o.selected);
    const y = sy(v, o.selected);
    const t = s.towers[o.selected];
    let r = 0;
    if (t) r = towerStats(s, t).range;
    else if (o.ghost) r = TOWERS[o.ghost].range * LEVEL_RANGE[1] * CELL;
    if (r > 0) {
      g.beginPath();
      g.arc(x, y, r * size, 0, Math.PI * 2);
      g.fillStyle = 'rgba(140, 220, 255, 0.08)';
      g.fill();
      g.strokeStyle = 'rgba(140, 220, 255, 0.55)';
      g.lineWidth = 1.5;
      g.stroke();
    }
    hexPath(g, x, y, size * 0.96);
    g.strokeStyle = '#ffe9b0';
    g.lineWidth = 2.5;
    g.stroke();
  }

  // Towers.
  for (let i = 0; i < N; i++) {
    const t = s.towers[i];
    if (!t) continue;
    if (t.spec >= 0) {
      // Specialized: a brass halo.
      g.beginPath();
      g.arc(sx(v, i), sy(v, i), size * 0.95, 0, Math.PI * 2);
      g.strokeStyle = `rgba(255, 215, 122, ${0.55 + 0.2 * Math.sin(o.time * 2.5 + i)})`;
      g.lineWidth = 2.5;
      g.stroke();
    }
    drawTowerIcon(g, t.id, sx(v, i), sy(v, i), size * 0.92, t.level);
  }
  // Towers a planned build would leave out of reach: a pulsing red ring and a cross.
  for (const c of o.bypass) {
    const x = sx(v, c);
    const y = sy(v, c);
    const pulse = reducedFx() ? 1 : 0.8 + 0.2 * Math.sin(o.time * 6);
    g.save();
    g.strokeStyle = `rgba(255, 77, 109, ${pulse})`;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(x, y, size * 0.98, 0, Math.PI * 2);
    g.stroke();
    const d = size * 0.3;
    const cx = x + size * 0.62;
    const cy = y - size * 0.62;
    g.beginPath();
    g.arc(cx, cy, d, 0, Math.PI * 2);
    g.fillStyle = '#ff4d6d';
    g.fill();
    g.strokeStyle = '#2a0610';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx - d * 0.45, cy - d * 0.45);
    g.lineTo(cx + d * 0.45, cy + d * 0.45);
    g.moveTo(cx + d * 0.45, cy - d * 0.45);
    g.lineTo(cx - d * 0.45, cy + d * 0.45);
    g.stroke();
    g.restore();
  }
  if (o.ghost && o.selected >= 0 && !s.towers[o.selected]) drawTowerIcon(g, o.ghost, sx(v, o.selected), sy(v, o.selected), size * 0.92, 1, 0.55);

  // Enemies: ground first, flyers on top.
  for (const e of s.enemies) if (!ENEMIES[e.id].fly && !buried(s, e)) drawEnemy(g, v, e, o.time);
  for (const e of s.enemies) if (ENEMIES[e.id].fly) drawEnemy(g, v, e, o.time);
  // Burrowers under a tower: just a ring of churned earth.
  for (const e of s.enemies) {
    if (!buried(s, e)) continue;
    const x = wx(v, e.x);
    const y = wy(v, e.y);
    g.save();
    g.setLineDash([3, 4]);
    g.lineDashOffset = -o.time * 20;
    g.strokeStyle = 'rgba(200, 150, 100, 0.9)';
    g.lineWidth = 2.5;
    g.beginPath();
    g.ellipse(x, y + size * 0.15, size * 0.42, size * 0.24, 0, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }

  // Effects.
  for (const f of o.effects) {
    const k = (o.time - f.t0) / f.life;
    if (k < 0 || k > 1) continue;
    g.save();
    g.globalAlpha = 1 - k;
    switch (f.kind) {
      case 'shot':
        g.strokeStyle = f.color;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(wx(v, f.pts[0]), wy(v, f.pts[1]));
        g.lineTo(wx(v, f.pts[2]), wy(v, f.pts[3]));
        g.stroke();
        break;
      case 'burst':
        g.strokeStyle = f.color;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(wx(v, f.pts[0]), wy(v, f.pts[1]), (f.r ?? 1) * size * (0.4 + k * 0.6), 0, Math.PI * 2);
        g.stroke();
        break;
      case 'chain':
        g.strokeStyle = f.color;
        g.lineWidth = 2;
        g.beginPath();
        for (let p = 0; p < f.pts.length; p += 2) {
          const x = wx(v, f.pts[p]) + (p ? Math.sin(o.time * 50 + p) * 3 : 0);
          const y = wy(v, f.pts[p + 1]);
          if (p === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
        break;
      case 'die':
        g.fillStyle = f.color;
        for (let p = 0; p < 6; p++) {
          const a = (p / 6) * Math.PI * 2;
          g.beginPath();
          g.arc(wx(v, f.pts[0]) + Math.cos(a) * k * size * 0.6, wy(v, f.pts[1]) + Math.sin(a) * k * size * 0.6, 2.2, 0, Math.PI * 2);
          g.fill();
        }
        break;
      case 'gold':
        g.fillStyle = '#ffd77a';
        g.font = `700 ${Math.round(size * 0.55)}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.fillText(f.text ?? '', wx(v, f.pts[0]), wy(v, f.pts[1]) - k * size * 0.8);
        break;
    }
    g.restore();
  }

  if (o.hurt > 0) {
    g.fillStyle = `rgba(255, 60, 60, ${o.hurt * (reducedFx() ? 0.04 : 0.12)})`;
    g.fillRect(0, 0, v.w, v.h);
  }
}
