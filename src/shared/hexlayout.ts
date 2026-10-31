// Fit a set of flat-top hexes into a canvas box and convert between hex
// coordinates and CSS pixels.

import { fromPixel, toPixel, type Hex } from './hex';

export interface HexLayout {
  /** Hex size (center to corner) in CSS pixels. */
  size: number;
  ox: number;
  oy: number;
}

export function fitHexes(cells: Hex[], w: number, h: number, pad = 8): HexLayout {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of cells) {
    const p = toPixel(c, 1);
    minX = Math.min(minX, p.x - 1);
    maxX = Math.max(maxX, p.x + 1);
    minY = Math.min(minY, p.y - Math.sqrt(3) / 2);
    maxY = Math.max(maxY, p.y + Math.sqrt(3) / 2);
  }
  const size = Math.max(1, Math.min((w - pad * 2) / (maxX - minX), (h - pad * 2) / (maxY - minY)));
  return { size, ox: w / 2 - ((minX + maxX) / 2) * size, oy: h / 2 - ((minY + maxY) / 2) * size };
}

export function hexToPx(L: HexLayout, q: number, r: number): { x: number; y: number } {
  const p = toPixel({ q, r }, L.size);
  return { x: p.x + L.ox, y: p.y + L.oy };
}

export function pxToHex(L: HexLayout, x: number, y: number): Hex {
  return fromPixel(x - L.ox, y - L.oy, L.size);
}

export function hexPath(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    if (i === 0) ctx.moveTo(x + size * Math.cos(a), y + size * Math.sin(a));
    else ctx.lineTo(x + size * Math.cos(a), y + size * Math.sin(a));
  }
  ctx.closePath();
}
