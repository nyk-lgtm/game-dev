// Pre-rendered glowing sprites. shadowBlur is far too slow to use per frame on
// phones, so every (shape, hue, size, variant) is drawn once with its glow
// into an offscreen canvas and then blitted.

export type Shape =
  | 'circle'
  | 'tri'
  | 'square'
  | 'kite'
  | 'pent'
  | 'diamond'
  | 'ring'
  | 'hex'
  | 'star'
  | 'dot'
  | 'gem'
  | 'disc'
  | 'cross';

export type Variant = 'normal' | 'white' | 'elite';

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Offset from the sprite's top-left to its center, in CSS px. */
  half: number;
  /** Drawn size in CSS px. */
  size: number;
}

const cache = new Map<string, Sprite>();
let scale = 1;

/** Call on resize: sprites are rendered at (world units × scale × dpr). */
export function setSpriteScale(s: number): void {
  if (Math.abs(s - scale) > 1e-6) {
    scale = s;
    cache.clear();
  }
}

function path(ctx: CanvasRenderingContext2D, shape: Shape, R: number): void {
  ctx.beginPath();
  const poly = (n: number, rot: number, rr = R) => {
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * Math.PI * 2;
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
  };
  switch (shape) {
    case 'circle':
    case 'dot':
    case 'disc':
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      break;
    case 'ring':
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.moveTo(R * 0.55, 0);
      ctx.arc(0, 0, R * 0.55, 0, Math.PI * 2, true);
      break;
    case 'tri':
      poly(3, -Math.PI / 2);
      break;
    case 'square':
      poly(4, Math.PI / 4, R * 1.15);
      break;
    case 'diamond':
    case 'gem':
      ctx.moveTo(0, -R * 1.2);
      ctx.lineTo(R * 0.8, 0);
      ctx.lineTo(0, R * 1.2);
      ctx.lineTo(-R * 0.8, 0);
      ctx.closePath();
      break;
    case 'kite':
      // Points right (+x); rotate when drawing.
      ctx.moveTo(R * 1.3, 0);
      ctx.lineTo(-R * 0.8, -R * 0.8);
      ctx.lineTo(-R * 0.35, 0);
      ctx.lineTo(-R * 0.8, R * 0.8);
      ctx.closePath();
      break;
    case 'pent':
      poly(5, -Math.PI / 2);
      break;
    case 'hex':
      poly(6, 0);
      break;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
        const rr = i % 2 ? R * 0.5 : R;
        if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      break;
    case 'cross':
      ctx.rect(-R, -R * 0.35, R * 2, R * 0.7);
      ctx.rect(-R * 0.35, -R, R * 0.7, R * 2);
      break;
  }
}

export function sprite(shape: Shape, hue: number, r: number, variant: Variant = 'normal'): Sprite {
  const k = `${shape}|${hue}|${Math.round(r * 4)}|${variant}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const R = r * scale;
  const glow = Math.max(4, R * 0.9);
  const size = Math.ceil((R * 1.4 + glow) * 2);
  const c = document.createElement('canvas');
  c.width = Math.ceil(size * dpr);
  c.height = Math.ceil(size * dpr);
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.translate(size / 2, size / 2);
  const white = variant === 'white';
  const fill = white ? '#ffffff' : `hsl(${hue}, 95%, ${shape === 'dot' ? 70 : 58}%)`;
  ctx.shadowColor = white ? 'rgba(255,255,255,0.9)' : `hsla(${hue}, 100%, 60%, 0.95)`;
  ctx.shadowBlur = glow;
  path(ctx, shape, R);
  ctx.fillStyle = fill;
  ctx.fill(shape === 'ring' ? 'evenodd' : 'nonzero');
  ctx.shadowBlur = 0;
  if (!white && shape !== 'ring' && shape !== 'dot') {
    // A bright inner core gives shapes depth.
    ctx.save();
    ctx.scale(0.5, 0.5);
    path(ctx, shape, R);
    ctx.fillStyle = `hsla(${hue}, 100%, 88%, 0.75)`;
    ctx.fill();
    ctx.restore();
  }
  if (shape === 'dot') {
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
  if (variant === 'elite') {
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.35, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(2, R * 0.12);
    ctx.strokeStyle = 'hsl(48, 100%, 62%)';
    ctx.shadowColor = 'hsla(48, 100%, 60%, 0.9)';
    ctx.shadowBlur = glow * 0.6;
    ctx.stroke();
  }
  const s = { canvas: c, half: size / 2, size };
  cache.set(k, s);
  return s;
}

/** Soft radial glow (for auras, explosions, the player). */
export function glowSprite(hue: number, r: number, alpha = 0.5): Sprite {
  const k = `glow|${hue}|${Math.round(r * 4)}|${alpha}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const R = r * scale;
  const size = Math.ceil(R * 2);
  const c = document.createElement('canvas');
  c.width = Math.ceil(size * dpr);
  c.height = Math.ceil(size * dpr);
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `hsla(${hue}, 100%, 65%, ${alpha})`);
  g.addColorStop(1, `hsla(${hue}, 100%, 55%, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const s = { canvas: c, half: size / 2, size };
  cache.set(k, s);
  return s;
}

/** Draw a glowing shape icon onto a small UI canvas (CSS px size). */
export function drawIcon(c: HTMLCanvasElement, shape: Shape, hue: number, css: number, ring = false): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.round(css * dpr);
  c.height = Math.round(css * dpr);
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.translate(css / 2, css / 2);
  const R = css * 0.26;
  ctx.shadowColor = `hsla(${hue}, 100%, 60%, 0.95)`;
  ctx.shadowBlur = css * 0.25;
  path(ctx, shape, R);
  ctx.fillStyle = `hsl(${hue}, 95%, 60%)`;
  ctx.fill(shape === 'ring' ? 'evenodd' : 'nonzero');
  if (ring) {
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.55, 0, Math.PI * 2);
    ctx.strokeStyle = 'hsl(330, 100%, 65%)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
