// A colored character grid painted onto a canvas, shared by the ASCII games.

export interface Grid {
  cols: number;
  rows: number;
  ch: string[];
  color: string[];
}

export interface Art {
  rows: string[];
  accents?: Record<string, string>;
}

export function makeGrid(cols: number, rows: number): Grid {
  return { cols, rows, ch: new Array(cols * rows).fill(' '), color: new Array(cols * rows).fill('#000') };
}

export function clearGrid(g: Grid): void {
  g.ch.fill(' ');
  g.color.fill('#000');
}

export function put(g: Grid, r: number, c: number, ch: string, color: string): void {
  if (r < 0 || c < 0 || r >= g.rows || c >= g.cols || ch === ' ') return;
  const i = r * g.cols + c;
  g.ch[i] = ch;
  g.color[i] = color;
}

export function text(g: Grid, r: number, c: number, s: string, color: string): void {
  for (let i = 0; i < s.length; i++) put(g, r, c + i, s[i], color);
}

/**
 * Draw `art` resampled to `outRows` rows (width scales by the same factor),
 * bottom-centered at (bottomRow, centerCol). Rows at or below `clipRow` are
 * hidden (something nearer covers them). Spaces are transparent; with
 * `solid`, each row's span is blacked out first so the figure reads cleanly.
 */
export function blitArt(
  g: Grid,
  art: Art,
  outRows: number,
  bottomRow: number,
  centerCol: number,
  color: string,
  opts: { clipRow?: number; solid?: boolean; maxScale?: number } = {},
): void {
  const ar = art.rows.length;
  const ac = art.rows[0].length;
  const k = Math.min(outRows / ar, opts.maxScale ?? 1.5);
  const oR = Math.max(1, Math.round(ar * k));
  const oC = Math.max(1, Math.round(ac * k));
  const r0 = Math.round(bottomRow - oR);
  const c0 = Math.round(centerCol - oC / 2);
  const clip = opts.clipRow ?? Infinity;
  for (let rr = 0; rr < oR; rr++) {
    const r = r0 + rr;
    if (r < 0 || r >= g.rows || r >= clip) continue;
    const src = art.rows[Math.min(ar - 1, Math.floor(rr / k))];
    if (opts.solid) {
      const first = src.search(/\S/);
      if (first >= 0) {
        let last = src.length - 1;
        while (last > 0 && src[last] === ' ') last--;
        for (let cc = Math.floor(first * k); cc <= Math.ceil(last * k); cc++) {
          const c = c0 + cc;
          if (c >= 0 && c < g.cols) g.ch[r * g.cols + c] = ' ';
        }
      }
    }
    for (let cc = 0; cc < oC; cc++) {
      const c = c0 + cc;
      if (c < 0 || c >= g.cols) continue;
      const ch = src[Math.min(ac - 1, Math.floor(cc / k))];
      if (ch === ' ') continue;
      g.ch[r * g.cols + c] = ch;
      g.color[r * g.cols + c] = art.accents?.[ch] ?? color;
    }
  }
}

/** Paint the grid, batching horizontal runs of the same color into one fillText. */
export function paintGrid(ctx: CanvasRenderingContext2D, g: Grid, x0: number, y0: number, cw: number, chh: number, font: string): void {
  ctx.font = font;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  for (let r = 0; r < g.rows; r++) {
    let c = 0;
    const base = r * g.cols;
    while (c < g.cols) {
      if (g.ch[base + c] === ' ') {
        c++;
        continue;
      }
      const color = g.color[base + c];
      let run = '';
      let c2 = c;
      while (c2 < g.cols && g.color[base + c2] === color && g.ch[base + c2] !== ' ') run += g.ch[base + c2++];
      ctx.fillStyle = color;
      ctx.fillText(run, x0 + c * cw, y0 + r * chh);
      c = c2;
    }
  }
}

/** Measure a monospace font's cell width. */
export function cellWidth(ctx: CanvasRenderingContext2D, font: string): number {
  ctx.font = font;
  return ctx.measureText('MMMMMMMMMM').width / 10;
}

export const MONO = "ui-monospace, 'Cascadia Mono', 'Roboto Mono', 'Droid Sans Mono', 'DejaVu Sans Mono', Menlo, monospace";
