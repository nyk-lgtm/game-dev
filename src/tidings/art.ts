// Tidings card art: a little SVG landscape per card (sky by the card's mood,
// ground by the region, shapes varied by the card's id) with its emoji figures
// standing in it.

import type { Region, Sky } from './core';

const SKIES: Record<Sky, [string, string, string]> = {
  // top, horizon, sun/moon
  day: ['#7fb8e0', '#f4e6bf', '#fff4c8'],
  dusk: ['#36345f', '#e8936a', '#ffd38a'],
  night: ['#0c1430', '#2c3a68', '#f3f0d8'],
  storm: ['#3e4652', '#87919c', ''],
  snow: ['#8ea4bb', '#e6edf4', ''],
  fog: ['#a9b0ba', '#e2e4e7', '#f4f1e6'],
  dawn: ['#e89c84', '#fbe2b8', '#fff1c2'],
};
/** Far and near ground per region, then a tint for night/storm. */
const GROUND: [string, string][] = [
  ['#7fa55e', '#557f3f'],
  ['#4f7a66', '#2f5446'],
  ['#c9d5e2', '#8ea2b8'],
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const shade = (hex: string, k: number): string => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

const EMOJI = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:\uFE0F|\u20E3|[\u{1F3FB}-\u{1F3FF}])*(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|[\u{1F3FB}-\u{1F3FF}])*)*/gu;
/** The emoji in a card's art string, one per figure. */
export const figures = (art: string): string[] => art.match(EMOJI) ?? [];

/** A landscape SVG with the figures; `big` for the focused card. */
export function cardArt(id: string, art: string, sky: Sky = 'day', region: Region = 0, big = false, narrow = false): string {
  const h = hash(id);
  const r = (i: number) => ((h >>> (i * 3)) & 7) / 7;
  const [top, hor, orb] = SKIES[sky];
  const dark = sky === 'night' ? 0.45 : sky === 'storm' ? 0.7 : sky === 'dusk' ? 0.78 : sky === 'fog' ? 0.92 : 1;
  const [far, near] = GROUND[region].map((c) => shade(c, dark));
  const g = `g${h.toString(36)}${big ? 'b' : ''}`;
  const W = 300, H = 160;
  let s = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${hor}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#${g})"/>`;
  // Sun or moon, stars.
  if (sky === 'night') {
    for (let i = 0; i < 18; i++) {
      const x = (hash(id + i) % 300), y = (hash(i + id) % 70);
      s += `<circle cx="${x}" cy="${y}" r="${i % 4 ? 0.8 : 1.4}" fill="#fff" opacity="${0.5 + (i % 3) * 0.2}"/>`;
    }
  }
  if (orb) s += `<circle cx="${narrow ? 110 + r(1) * 80 : 60 + r(1) * 180}" cy="${sky === 'dawn' || sky === 'dusk' ? 70 : 34}" r="${sky === 'night' ? 11 : 16}" fill="${orb}" opacity="${sky === 'fog' ? 0.6 : 0.95}"/>`;
  // Far ground.
  if (region === 2) {
    let p = `M0 ${H}L0 ${92}`;
    for (let x = 0; x <= W; x += 30) p += `L${x + 15} ${44 + ((hash(id + x) % 40))}L${x + 30} ${86 + (hash(x + id) % 16)}`;
    s += `<path d="${p}L${W} ${H}Z" fill="${far}"/>`;
    // Snow caps.
    for (let x = 0; x <= W; x += 30) {
      const py = 44 + (hash(id + x) % 40);
      s += `<path d="M${x + 7} ${py + 13}L${x + 15} ${py}L${x + 23} ${py + 13}L${x + 18} ${py + 10}L${x + 15} ${py + 14}L${x + 11} ${py + 10}Z" fill="${shade('#ffffff', dark)}" opacity="0.9"/>`;
    }
  } else {
    const y0 = 92 + r(2) * 12;
    s += `<path d="M0 ${y0}C${70 + r(3) * 40} ${y0 - 30} ${150 + r(4) * 40} ${y0 + 10} ${W} ${y0 - 18}L${W} ${H}L0 ${H}Z" fill="${far}"/>`;
    if (region === 1) {
      for (let i = 0; i < 9; i++) {
        const x = (hash(id + 'p' + i) % 300), y = y0 - 4 + (hash('q' + i + id) % 14);
        const t = 16 + (i % 3) * 5;
        s += `<path d="M${x} ${y - t}L${x - t / 3} ${y}L${x + t / 3} ${y}Z" fill="${shade('#24433a', dark)}"/>`;
      }
    } else {
      for (let i = 0; i < 4; i++) {
        const x = (hash(id + 'h' + i) % 300);
        s += `<ellipse cx="${x}" cy="${y0 + 4}" rx="${14 + (i % 2) * 8}" ry="7" fill="${shade('#4a6e35', dark)}"/>`;
      }
    }
  }
  // Near ground.
  const y1 = 124 + r(5) * 8;
  s += `<path d="M0 ${y1 + 6}C${90 + r(6) * 30} ${y1 - 8} ${200 - r(7) * 30} ${y1 + 12} ${W} ${y1 - 2}L${W} ${H}L0 ${H}Z" fill="${near}"/>`;
  // Weather.
  if (sky === 'storm') for (let i = 0; i < 26; i++) s += `<path d="M${(hash(id + 'r' + i) % 320) - 10} ${hash('s' + i) % 150}l-6 14" stroke="#dfe7f0" stroke-width="1.2" opacity="0.55"/>`;
  if (sky === 'snow') for (let i = 0; i < 30; i++) s += `<circle cx="${hash(id + 'f' + i) % 300}" cy="${hash('g' + i + id) % 160}" r="${1 + (i % 3) * 0.6}" fill="#fff" opacity="0.85"/>`;
  if (sky === 'fog') s += `<rect y="70" width="300" height="26" fill="#eef0f2" opacity="0.45"/><rect y="104" width="300" height="18" fill="#eef0f2" opacity="0.4"/>`;
  // Figures, standing on the near ground with soft shadows.
  const figs = figures(art);
  // A narrow frame (the hand's square crop) shows only the middle third or so.
  const xs = figs.length === 1 ? [150] : narrow ? (figs.length === 2 ? [128, 180] : [112, 152, 192]) : figs.length === 2 ? [118, 192] : [92, 156, 214];
  figs.forEach((f, i) => {
    const size = (i === 0 ? 56 : 44) * (narrow && figs.length > 1 ? 0.85 : 1);
    const x = xs[i] ?? 150;
    const y = y1 + 12;
    s += `<ellipse cx="${x}" cy="${y + 2}" rx="${size * 0.36}" ry="5" fill="#000" opacity="0.22"/>`;
    s += `<text x="${x}" y="${y}" font-size="${size}" text-anchor="middle" style="font-family:'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif">${f}</text>`;
  });
  if (sky === 'night' || sky === 'dusk') s += `<rect width="${W}" height="${H}" fill="#0b0f24" opacity="${sky === 'night' ? 0.12 : 0.05}"/>`;
  return s + '</svg>';
}
