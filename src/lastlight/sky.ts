// The sky strip above the story: storm, the lighthouse, the ship's lantern
// creeping toward the Teeth as the night runs out, and the beam once lit.

import { END_T as N2_END, FOG_T as N2_FOG, type State as N2State } from './core/night2';
import { END_T, type State } from './core/story';

export function drawSky(g: CanvasRenderingContext2D, w: number, h: number, s: State, time: number): void {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0a0f1c');
  grad.addColorStop(1, '#16223a');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  const sea = h * 0.72;
  // Sea with swell.
  g.fillStyle = '#0c1626';
  g.beginPath();
  g.moveTo(0, h);
  for (let x = 0; x <= w; x += 8) g.lineTo(x, sea + Math.sin(x * 0.05 + time * 1.6) * 2.5);
  g.lineTo(w, h);
  g.fill();
  // The Teeth.
  g.fillStyle = '#05080f';
  for (const [x, hh] of [[0.18, 9], [0.22, 14], [0.26, 7]] as const) {
    g.beginPath();
    g.moveTo(w * x - 7, sea + 2);
    g.lineTo(w * x, sea - hh);
    g.lineTo(w * x + 7, sea + 2);
    g.fill();
  }
  // Cliff and lighthouse on the right.
  const lx = w * 0.82;
  g.fillStyle = '#05080f';
  g.beginPath();
  g.moveTo(w * 0.66, h);
  g.lineTo(w * 0.7, sea - 6);
  g.lineTo(w, sea - 16);
  g.lineTo(w, h);
  g.fill();
  g.fillStyle = '#1d2638';
  g.beginPath();
  g.moveTo(lx - 7, sea - 12);
  g.lineTo(lx - 4, sea - 48);
  g.lineTo(lx + 4, sea - 48);
  g.lineTo(lx + 7, sea - 12);
  g.fill();
  const lit = s.f.lit;
  g.fillStyle = lit ? '#ffd77a' : '#2a3448';
  g.fillRect(lx - 5, sea - 56, 10, 8);
  g.fillStyle = '#1d2638';
  g.beginPath();
  g.moveTo(lx - 6, sea - 56);
  g.lineTo(lx, sea - 62);
  g.lineTo(lx + 6, sea - 56);
  g.fill();
  if (lit) {
    // The beam: sweeping if wound, a still glow if not.
    const a = s.f.wound ? Math.PI + Math.sin(time * 0.9) * 0.9 : Math.PI;
    const len = w * 0.9;
    const bx = lx, by = sea - 52;
    const beam = g.createLinearGradient(bx, by, bx + Math.cos(a) * len, by + Math.sin(a) * len * 0.15);
    beam.addColorStop(0, 'rgba(255, 220, 140, 0.55)');
    beam.addColorStop(1, 'rgba(255, 220, 140, 0)');
    g.fillStyle = beam;
    g.beginPath();
    g.moveTo(bx, by);
    g.lineTo(bx + Math.cos(a - 0.07) * len, by + Math.sin(a - 0.07) * len * 0.3);
    g.lineTo(bx + Math.cos(a + 0.07) * len, by + Math.sin(a + 0.07) * len * 0.3);
    g.fill();
    g.fillStyle = 'rgba(255, 215, 122, 0.25)';
    g.beginPath();
    g.arc(lx, sea - 52, 14, 0, Math.PI * 2);
    g.fill();
  }
  // The ship's lantern: from far left toward the Teeth as time runs out (or away once the light turns).
  const k = Math.min(1, s.t / END_T);
  const saved = lit && s.f.wound;
  // Once the light turns, the ship bears away to open water (left).
  const sx = saved ? w * 0.06 : w * (0.02 + 0.16 * k);
  const sy = sea - 3 + Math.sin(time * 1.4) * 2;
  g.fillStyle = '#ffcf7a';
  g.beginPath();
  g.arc(sx, sy, 2.2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255, 207, 122, 0.25)';
  g.beginPath();
  g.arc(sx, sy, 6, 0, Math.PI * 2);
  g.fill();
  // Rain.
  g.strokeStyle = 'rgba(160, 180, 210, 0.28)';
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 0; i < 70; i++) {
    const x = ((i * 53.7 + time * 220) % (w + 40)) - 20;
    const y = ((i * 31.3 + time * 520) % (h + 20)) - 10;
    g.moveTo(x, y);
    g.lineTo(x - 5, y + 11);
  }
  g.stroke();
}

/** Night 2: fog thickening over the sea, the lamp a smear of gold, the horn's call
 * rolling out once it sounds, a match flickering on the Point until Nell is found. */
export function drawFog(g: CanvasRenderingContext2D, w: number, h: number, s: N2State, time: number): void {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#151a22');
  grad.addColorStop(1, '#262d38');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  const sea = h * 0.74;
  g.fillStyle = '#121821';
  g.beginPath();
  g.moveTo(0, h);
  for (let x = 0; x <= w; x += 8) g.lineTo(x, sea + Math.sin(x * 0.04 + time * 0.8) * 1.5);
  g.lineTo(w, h);
  g.fill();
  // The Point on the left, with the beacon cairn.
  g.fillStyle = '#0b0f15';
  g.beginPath();
  g.moveTo(0, sea + 4);
  g.lineTo(0, sea - 16);
  g.quadraticCurveTo(w * 0.1, sea - 30, w * 0.24, sea + 4);
  g.fill();
  g.beginPath();
  g.moveTo(w * 0.08 - 6, sea - 23);
  g.lineTo(w * 0.08, sea - 33);
  g.lineTo(w * 0.08 + 6, sea - 23);
  g.fill();
  // The Teeth.
  for (const [x, hh] of [[0.36, 8], [0.39, 12], [0.42, 6]] as const) {
    g.beginPath();
    g.moveTo(w * x - 6, sea + 2);
    g.lineTo(w * x, sea - hh);
    g.lineTo(w * x + 6, sea + 2);
    g.fill();
  }
  // Cliff, lighthouse and the fog-signal house with its horn.
  const lx = w * 0.84;
  g.beginPath();
  g.moveTo(w * 0.62, h);
  g.lineTo(w * 0.66, sea - 8);
  g.lineTo(w, sea - 18);
  g.lineTo(w, h);
  g.fill();
  g.fillStyle = '#1f2633';
  g.beginPath();
  g.moveTo(lx - 7, sea - 14);
  g.lineTo(lx - 4, sea - 50);
  g.lineTo(lx + 4, sea - 50);
  g.lineTo(lx + 7, sea - 14);
  g.fill();
  g.fillStyle = '#ffd77a';
  g.fillRect(lx - 5, sea - 58, 10, 8);
  g.fillStyle = '#1f2633';
  g.beginPath();
  g.moveTo(lx - 6, sea - 58);
  g.lineTo(lx, sea - 64);
  g.lineTo(lx + 6, sea - 58);
  g.fill();
  const hx = w * 0.7, hy = sea - 16;
  g.fillRect(hx - 2, hy - 2, 16, 10);
  g.beginPath();
  g.moveTo(hx - 2, hy + 1);
  g.lineTo(hx - 9, hy - 3);
  g.lineTo(hx - 9, hy + 7);
  g.lineTo(hx - 2, hy + 4);
  g.fill();
  // The ship's lantern: creeping toward the Teeth, or into harbour once the horn sounds.
  const k = Math.min(1, s.t / N2_END);
  const sx = s.f.horn ? w * 0.52 : w * (0.18 + 0.16 * k);
  const sy = sea - 3 + Math.sin(time * 1.1) * 1.5;
  g.fillStyle = 'rgba(255, 207, 122, 0.7)';
  g.beginPath();
  g.arc(sx, sy, 2, 0, Math.PI * 2);
  g.fill();
  // A match flaring on the Point, now and then, until Nell is found.
  if (!s.nell.found && Math.sin(time * 2.3) + Math.sin(time * 5.1) > 1.2) {
    g.fillStyle = 'rgba(255, 190, 110, 0.85)';
    g.beginPath();
    g.arc(w * 0.08 + 7, sea - 27, 1.6, 0, Math.PI * 2);
    g.fill();
  }
  // Fog banks, thicker as the night goes on.
  const thick = Math.min(1, s.t / N2_FOG);
  for (let i = 0; i < 9; i++) {
    const y = h * (0.25 + 0.08 * i);
    const x = ((i * 97 + time * (6 + i)) % (w + 240)) - 120;
    const r = 70 + (i % 3) * 30;
    const fog = g.createRadialGradient(x, y, 0, x, y, r);
    fog.addColorStop(0, `rgba(170, 180, 192, ${0.1 + 0.16 * thick})`);
    fog.addColorStop(1, 'rgba(170, 180, 192, 0)');
    g.fillStyle = fog;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.fillStyle = `rgba(150, 160, 172, ${0.06 + 0.3 * thick})`;
  g.fillRect(0, 0, w, h);
  // The lamp, a smear of gold in the fog, its beam swallowed within yards.
  const glow = g.createRadialGradient(lx, sea - 54, 0, lx, sea - 54, 34);
  glow.addColorStop(0, 'rgba(255, 215, 122, 0.5)');
  glow.addColorStop(1, 'rgba(255, 215, 122, 0)');
  g.fillStyle = glow;
  g.fillRect(lx - 34, sea - 88, 68, 68);
  const a = Math.PI + Math.sin(time * 0.9) * 0.9;
  const beam = g.createLinearGradient(lx, sea - 54, lx + Math.cos(a) * 60, sea - 54);
  beam.addColorStop(0, 'rgba(255, 220, 140, 0.35)');
  beam.addColorStop(1, 'rgba(255, 220, 140, 0)');
  g.fillStyle = beam;
  g.beginPath();
  g.moveTo(lx, sea - 54);
  g.lineTo(lx + Math.cos(a - 0.12) * 60, sea - 54 + Math.sin(a - 0.12) * 18);
  g.lineTo(lx + Math.cos(a + 0.12) * 60, sea - 54 + Math.sin(a + 0.12) * 18);
  g.fill();
  // The horn's call: a ring rolling out to sea every few seconds.
  if (s.f.horn) {
    const p = (time % 4) / 4;
    g.strokeStyle = `rgba(220, 230, 240, ${0.45 * (1 - p)})`;
    g.lineWidth = 2;
    for (const d of [0, 10]) {
      g.beginPath();
      g.arc(hx - 9, hy + 2, 8 + p * w * 0.5 + d, Math.PI * 0.8, Math.PI * 1.2);
      g.stroke();
    }
  }
}
