// The first-person view: a classic grid raycaster whose output is a buffer of
// colored ASCII characters. Walls are textured with characters (bricks,
// planks), shaded by distance under torchlight; floor and ceiling are cast
// per cell; monsters and items are ASCII-art billboards with a depth buffer.

import { makeGrid, paintGrid, type Grid } from '../shared/ascii';
import { ITEM_ART, MONSTER_ART, STAIRS_ART, type Art } from './art';
import { SIZE, idx, type GameState, type Tile } from './core';

export { makeGrid, paintGrid, type Grid };

export interface Pose {
  /** Position in cell units (cell centers are at +0.5). */
  x: number;
  y: number;
  /** Facing angle, radians (0 = east, -PI/2 = north). */
  a: number;
}

export const FOV_PLANE = 0.66;
const RAMP = '@#%*+=-:.';

/** Lightness steps per material ramp. */
const STEPS = 20;
type Ramp = readonly string[];
/** Quantized colors: hue/sat fixed per material, lightness in STEPS+1 steps. */
const ramps = new Map<number, Ramp>();
function ramp(h: number, s: number): Ramp {
  const k = h * 1000 + s;
  let r = ramps.get(k);
  if (!r) {
    r = Array.from({ length: STEPS + 1 }, (_, q) => `hsl(${h}, ${s}%, ${Math.round((q / STEPS) * 78)}%)`);
    ramps.set(k, r);
  }
  return r;
}
function shadeOf(r: Ramp, l: number): string {
  return r[Math.max(0, Math.min(STEPS, Math.round(l * STEPS)))];
}
function shade(h: number, s: number, l: number): string {
  return shadeOf(ramp(h, s), l);
}
const DOOR = ramp(28, 55);
const PILLAR = ramp(38, 18);
const WALL_NEAR = ramp(30, 22);
const WALL_FAR = ramp(220, 14);
const STAIRS = ramp(42, 80);
const FLOOR_EDGE = ramp(30, 12);
const FLOOR = ramp(30, 10);
const BEAM = ramp(220, 10);
/** Lowest lightness of a monster billboard (walls fade much darker). */
const FOE_MIN = 0.62;
/** Lit edges of walls where the depth jumps (corners, openings). */
const EDGE = ramp(40, 55);

const hash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};

function light(d: number, flicker: number): number {
  return Math.min(1, (1.05 * flicker) / (1 + d * d * 0.07));
}

export interface Sprite {
  x: number;
  y: number;
  art: { large: Art; small: Art } | Art;
  /** Height relative to a wall at the same distance. */
  scale: number;
  hue: number;
  sat: number;
  /** Draw fully white (hit flash). */
  flash?: boolean;
  /** Tint (frozen). */
  frozen?: boolean;
  /** Vertical lift relative to the floor, in wall heights (bats fly). */
  lift?: number;
  /** Asleep: a "zZ" floats over it. */
  asleep?: boolean;
  /** A monster: kept bright at a distance so it stands out from the dim walls. */
  foe?: boolean;
}

function wallChar(t: Tile, u: number, v: number, d: number, side: number): string {
  const ramp = RAMP[Math.min(RAMP.length - 1, Math.floor((d / 9) * RAMP.length))];
  if (t === 'door') {
    if (u < 0.08 || u > 0.92) return u < 0.5 ? '[' : ']';
    if (Math.abs(u - 0.78) < 0.05 && Math.abs(v - 0.55) < 0.04) return 'o';
    if ((u * 5) % 1 < 0.14) return '|';
    return d < 4 ? '#' : ramp;
  }
  if (t === 'pillar') {
    if ((u * 4) % 1 < 0.18) return '|';
    if (v < 0.06 || v > 0.94) return '=';
    return ramp;
  }
  if (d < 7) {
    const course = Math.floor(v * 5);
    if ((v * 5) % 1 < 0.13) return d < 3 ? '_' : '-';
    const off = course % 2 ? 0.5 : 0;
    if (((u * 2 + off) % 1) < 0.07) return '|';
  }
  if (u < 0.02 || u > 0.98) return '|';
  return side ? ramp : RAMP[Math.min(RAMP.length - 1, Math.floor((d / 9) * RAMP.length) + 1)];
}

let zbuf = new Float32Array(0);

/** Render the scene into `g`. */
export function castView(g: Grid, s: GameState, pose: Pose, aspect: number, flicker: number, sprites: Sprite[]): void {
  const { cols, rows } = g;
  g.ch.fill(' ');
  g.color.fill('#000');
  const dirX = Math.cos(pose.a);
  const dirY = Math.sin(pose.a);
  const plX = -dirY * FOV_PLANE;
  const plY = dirX * FOV_PLANE;
  // A wall at distance 1 spans this many rows (square walls given the cell aspect).
  const H = (cols * aspect) / (2 * FOV_PLANE);
  const horizon = rows / 2;
  if (zbuf.length !== cols) zbuf = new Float32Array(cols);
  const tiles = s.level.tiles;

  for (let c = 0; c < cols; c++) {
    const cam = (2 * (c + 0.5)) / cols - 1;
    const rx = dirX + plX * cam;
    const ry = dirY + plY * cam;
    let mx = Math.floor(pose.x);
    let my = Math.floor(pose.y);
    const ddx = Math.abs(1 / rx);
    const ddy = Math.abs(1 / ry);
    const stepX = rx < 0 ? -1 : 1;
    const stepY = ry < 0 ? -1 : 1;
    let sdx = rx < 0 ? (pose.x - mx) * ddx : (mx + 1 - pose.x) * ddx;
    let sdy = ry < 0 ? (pose.y - my) * ddy : (my + 1 - pose.y) * ddy;
    let side = 0;
    let t: Tile = 'wall';
    for (let i = 0; i < 64; i++) {
      if (sdx < sdy) {
        sdx += ddx;
        mx += stepX;
        side = 0;
      } else {
        sdy += ddy;
        my += stepY;
        side = 1;
      }
      if (mx < 0 || my < 0 || mx >= SIZE || my >= SIZE) break;
      t = tiles[idx(mx, my)];
      if (t === 'wall' || t === 'door' || t === 'pillar') break;
    }
    const dist = Math.max(0.05, side === 0 ? sdx - ddx : sdy - ddy);
    zbuf[c] = dist;
    let u = side === 0 ? pose.y + dist * ry : pose.x + dist * rx;
    u -= Math.floor(u);
    if ((side === 0 && rx > 0) || (side === 1 && ry < 0)) u = 1 - u;
    const h = H / dist;
    const top = horizon - h / 2;
    const bot = horizon + h / 2;
    const L = light(dist, flicker) * (side ? 0.82 : 1);
    const wallColor = shadeOf(t === 'door' ? DOOR : t === 'pillar' ? PILLAR : dist < 3 ? WALL_NEAR : WALL_FAR, L);

    for (let r = 0; r < rows; r++) {
      const i = r * cols + c;
      const y = r + 0.5;
      if (y >= top && y <= bot) {
        const v = (y - top) / h;
        g.ch[i] = wallChar(t, u, v, dist, side);
        g.color[i] = wallColor;
      } else if (y > bot) {
        // Floor: find where this row hits the ground along this ray.
        const d = H / (2 * (y - horizon));
        const fx = pose.x + rx * d;
        const fy = pose.y + ry * d;
        const cx = Math.floor(fx);
        const cy = Math.floor(fy);
        const ux = fx - cx;
        const uy = fy - cy;
        const ft = cx >= 0 && cy >= 0 && cx < SIZE && cy < SIZE ? tiles[idx(cx, cy)] : 'wall';
        const fl = light(d, flicker) * 0.85;
        if (ft === 'stairs') {
          g.ch[i] = (Math.floor(uy * 4) + Math.floor(ux * 4)) % 2 ? '=' : '>';
          g.color[i] = shadeOf(STAIRS, Math.max(fl, 0.25));
        } else if (ux < 0.05 || uy < 0.05) {
          g.ch[i] = d < 3 ? '+' : '.';
          g.color[i] = shadeOf(FLOOR_EDGE, fl * 0.7);
        } else {
          const n = hash(Math.floor(fx * 6), Math.floor(fy * 6)) % 9;
          const chx = n === 0 ? ',' : n === 1 ? '.' : n === 2 && d < 2.5 ? '`' : ' ';
          if (chx !== ' ') {
            g.ch[i] = chx;
            g.color[i] = shadeOf(FLOOR, fl * 0.6);
          }
        }
      } else {
        // Ceiling: faint beams over cell edges.
        const d = H / (2 * (horizon - y));
        const fx = pose.x + rx * d;
        const fy = pose.y + ry * d;
        const ux = fx - Math.floor(fx);
        const uy = fy - Math.floor(fy);
        if (d < 5 && (ux < 0.05 || uy < 0.05)) {
          g.ch[i] = '-';
          g.color[i] = shadeOf(BEAM, light(d, flicker) * 0.35);
        }
      }
    }
  }

  // Edges where the depth jumps (a corner, a side opening, the mouth of a corridor):
  // outline the nearer wall's edge so openings stand out from the brick texture.
  for (let c = 1; c < cols; c++) {
    const a = zbuf[c - 1];
    const b = zbuf[c];
    if (Math.abs(a - b) < 0.75 + 0.12 * Math.min(a, b)) continue;
    const near = a < b ? c - 1 : c;
    const d = zbuf[near];
    const h = H / d;
    const top = Math.max(0, Math.ceil(horizon - h / 2 - 0.5));
    const bot = Math.min(rows - 1, Math.floor(horizon + h / 2 - 0.5));
    const col = shadeOf(EDGE, Math.min(1, light(d, flicker) * 1.35 + 0.08));
    for (let r = top; r <= bot; r++) {
      const i = r * cols + near;
      g.ch[i] = r === top || r === bot ? '+' : '|';
      g.color[i] = col;
    }
  }

  // Billboards, far to near.
  const invDet = 1 / (plX * dirY - dirX * plY);
  const placed = sprites
    .map((sp) => {
      const rx = sp.x - pose.x;
      const ry = sp.y - pose.y;
      return { sp, tx: invDet * (dirY * rx - dirX * ry), ty: invDet * (-plY * rx + plX * ry) };
    })
    .filter((p) => p.ty > 0.2)
    .sort((a, b) => b.ty - a.ty);
  for (const { sp, tx, ty } of placed) {
    const screenX = (cols / 2) * (1 + tx / ty);
    const wallH = H / ty;
    const target = Math.max(1, Math.round(wallH * sp.scale));
    const pair = 'large' in sp.art ? sp.art : null;
    const art: Art = pair ? (target >= pair.small.rows.length * 1.6 ? pair.large : pair.small) : (sp.art as Art);
    const ar = art.rows.length;
    const ac = art.rows[0].length;
    const k = Math.min(target / ar, 1.4);
    const outR = Math.max(1, Math.round(ar * k));
    const outC = Math.max(1, Math.round(ac * k));
    const floorY = horizon + wallH / 2 - (sp.lift ?? 0) * wallH;
    const r0 = Math.round(floorY - outR);
    const c0 = Math.round(screenX - outC / 2);
    const L = light(ty, flicker);
    // Foes never fade below FOE_MIN lightness (and gain a little saturation far off), so a distant one is easy to spot.
    const far = sp.foe ? Math.min(1, Math.max(0, (ty - 2) / 4)) : 0;
    const base = sp.flash ? '#ffffff' : sp.frozen ? shade(190, 70, Math.max(0.5, L)) : shade(sp.hue, Math.min(90, sp.sat + 25 * far), Math.max(sp.foe ? FOE_MIN : 0.12, L));
    for (let rr = 0; rr < outR; rr++) {
      const r = r0 + rr;
      if (r < 0 || r >= rows) continue;
      const srcRow = art.rows[Math.min(ar - 1, Math.floor(rr / k))];
      // Black out the silhouette's span on this row so the figure reads
      // cleanly against busy wall textures.
      const first = srcRow.search(/\S/);
      if (first >= 0) {
        let lastSrc = srcRow.length - 1;
        while (lastSrc > first && srcRow[lastSrc] === ' ') lastSrc--;
        for (let cc = Math.floor(first * k); cc <= Math.ceil(lastSrc * k); cc++) {
          const c = c0 + cc;
          if (c < 0 || c >= cols || zbuf[c] < ty) continue;
          g.ch[r * cols + c] = ' ';
        }
      }
      for (let cc = 0; cc < outC; cc++) {
        const c = c0 + cc;
        if (c < 0 || c >= cols || zbuf[c] < ty) continue;
        const ch = srcRow[Math.min(ac - 1, Math.floor(cc / k))];
        if (ch === ' ') continue;
        const i = r * cols + c;
        g.ch[i] = ch;
        g.color[i] = !sp.flash && art.accents?.[ch] ? art.accents[ch] : base;
      }
    }
    // A sleeping foe: "zZ" just above its head's right side.
    if (sp.asleep) {
      const r = Math.max(0, r0 - 1);
      const c = Math.round(screenX + outC * 0.25);
      for (let j = 0; j < 2; j++) {
        const cc = c + j;
        if (r >= rows || cc < 0 || cc >= cols || zbuf[cc] < ty) continue;
        g.ch[r * cols + cc] = j ? 'Z' : 'z';
        g.color[r * cols + cc] = '#8fb8ff';
      }
    }
  }
}

export { ITEM_ART, MONSTER_ART, STAIRS_ART };
