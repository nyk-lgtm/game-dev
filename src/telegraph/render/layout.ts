import { fromPixel, offsetToAxial, toPixel, type Hex } from '../core';

export interface Layout {
  /** Hex size (center to corner) in CSS pixels. */
  size: number;
  ox: number;
  oy: number;
}

/** Fit a cols x rows flat-top board into a w x h box, centered. */
export function fitBoard(w: number, h: number, cols: number, rows: number, pad = 8): Layout {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++) {
      const p = toPixel(offsetToAxial(c, r), 1);
      minX = Math.min(minX, p.x - 1);
      maxX = Math.max(maxX, p.x + 1);
      minY = Math.min(minY, p.y - Math.sqrt(3) / 2);
      maxY = Math.max(maxY, p.y + Math.sqrt(3) / 2);
    }
  const size = Math.max(1, Math.min((w - pad * 2) / (maxX - minX), (h - pad * 2) / (maxY - minY)));
  const ox = w / 2 - ((minX + maxX) / 2) * size;
  const oy = h / 2 - ((minY + maxY) / 2) * size;
  return { size, ox, oy };
}

/** Hex (possibly fractional, for animation) to canvas CSS pixels. */
export function hexToPx(L: Layout, q: number, r: number): { x: number; y: number } {
  const p = toPixel({ q, r }, L.size);
  return { x: p.x + L.ox, y: p.y + L.oy };
}

export function pxToHex(L: Layout, x: number, y: number): Hex {
  return fromPixel(x - L.ox, y - L.oy, L.size);
}
