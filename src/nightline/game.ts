// Nightline controller: steering input, the fixed-step loop, HUD, screens.

import { closeOverlay, showCard } from '../shared/cards';
import { MONO, cellWidth, makeGrid, paintGrid, type Grid } from '../shared/ascii';
import { makeStore } from '../shared/storage';
import { Sfx } from '../afterglow/audio';
import { LOGO } from './art';
import { BIOME_NAMES, DT, MAX_SPEED, NITRO_MAX, newRace, randomSeed, stageProgress, step, type Input, type Race } from './core';
import { Engine } from './engine';
import { drawRace, type SkyState, type View } from './render';

const store = makeStore('nightline.');
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class Game {
  race: Race | null = null;
  private ctx: CanvasRenderingContext2D;
  private grid: Grid = makeGrid(1, 1);
  private view: View = { cols: 1, rows: 1, cw: 8, ch: 13, horizon: 1 };
  private font = '';
  private w = 0;
  private h = 0;
  private sky: SkyState = { offset: 0 };
  private acc = 0;
  private last = 0;
  private running = false;
  private steer = 0;
  private boost = false;
  private brake = false;
  private tilt = store.load('tilt', false);
  private sfx = new Sfx();
  private engine = new Engine();
  private flashTimer = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    addEventListener('resize', () => this.resize());
    this.resize();
    this.bindInput();
    this.sfx.setMuted(store.load('muted', false));
    this.engine.muted = this.sfx.muted;
    addEventListener('pointerdown', () => (this.sfx.unlock(), this.engine.unlock()), { capture: true });
    $('pauseBtn').onclick = () => this.pause();
    document.addEventListener('visibilitychange', () => document.hidden && this.pause());
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------- input ----------

  private bindInput(): void {
    let id: number | null = null;
    let x0 = 0;
    this.canvas.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      id = e.pointerId;
      x0 = e.clientX;
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id || this.tilt) return;
      // The further you drag from where you touched, the harder you steer.
      this.steer = Math.max(-1, Math.min(1, (e.clientX - x0) / 70));
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      if (!this.tilt) this.steer = 0;
    };
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', up);
    const hold = (el: HTMLElement, set: (v: boolean) => void) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        set(true);
        el.classList.add('down');
      });
      const off = () => {
        set(false);
        el.classList.remove('down');
      };
      el.addEventListener('pointerup', off);
      el.addEventListener('pointerleave', off);
      el.addEventListener('pointercancel', off);
    };
    hold($('boostBtn'), (v) => (this.boost = v));
    hold($('brakeBtn'), (v) => (this.brake = v));
    addEventListener('deviceorientation', (e) => {
      if (!this.tilt || e.gamma === null) return;
      this.steer = Math.max(-1, Math.min(1, e.gamma / 22));
    });
    const keys = new Set<string>();
    addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
    addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
    this.keyInput = () => {
      const l = keys.has('arrowleft') || keys.has('a');
      const r = keys.has('arrowright') || keys.has('d');
      return { steer: l ? -1 : r ? 1 : null, boost: keys.has(' ') || keys.has('w'), brake: keys.has('arrowdown') || keys.has('s') };
    };
  }

  private keyInput: () => { steer: number | null; boost: boolean; brake: boolean } = () => ({ steer: null, boost: false, brake: false });

  private input(): Input {
    const k = this.keyInput();
    return { steer: k.steer ?? this.steer, boost: this.boost || k.boost, brake: this.brake || k.brake };
  }

  // ---------- screens ----------

  title(): void {
    this.running = false;
    $('hud').hidden = true;
    this.sfx.stopMusic();
    const best = store.load<number>('best', 0);
    showCard(
      `<pre>${LOGO.join('\n')}</pre><p>Five stages. One clock. Pick your road at every fork.</p>${best ? `<p class="meta">Best score ${best.toLocaleString()}</p>` : ''}`,
      [
        { label: 'Drive', primary: true, onClick: () => this.start() },
        { label: `Steering: ${this.tilt ? 'tilt' : 'drag'}`, onClick: () => this.toggleTilt() },
        { label: 'How to play', onClick: () => this.help() },
        { label: 'All games', onClick: () => (location.href = '../') },
      ],
      false,
    );
  }

  private toggleTilt(): void {
    this.tilt = !this.tilt;
    store.save('tilt', this.tilt);
    // iOS-style permission prompt where required.
    const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    if (this.tilt && DOE.requestPermission) void DOE.requestPermission();
    this.title();
  }

  private help(): void {
    showCard(
      `<h2>How to drive</h2><ul>
      <li><b>Drag</b> left or right anywhere to steer (or turn on <b>tilt</b> on the title screen).</li>
      <li>You accelerate on your own. Hold <b>BOOST</b> to burn nitro; hold <b>BRAKE</b> to slow for tight turns.</li>
      <li>Curves push you outward. The grass slows you down; roadside objects stop you dead.</li>
      <li>Passing cars refills nitro. Ramming them costs speed.</li>
      <li>Reach each checkpoint before the clock runs out to earn more time.</li>
      <li>At the end of each stage the road forks: stay <b>left</b> for the gentler route or <b>right</b> for a harder, faster-scoring one.</li></ul>`,
      [{ label: 'Back', primary: true, onClick: () => this.title() }],
      false,
    );
  }

  start(): void {
    closeOverlay();
    this.race = newRace(randomSeed());
    this.sky = { offset: 0 };
    this.acc = 0;
    this.running = true;
    $('hud').hidden = false;
    this.sfx.startMusic();
    this.say('GO!');
  }

  private pause(): void {
    if (!this.running || !this.race) return;
    this.running = false;
    showCard('<h2>Paused</h2>', [
      { label: 'Resume', primary: true, onClick: () => (closeOverlay(), (this.running = true), (this.acc = 0)) },
      {
        label: this.sfx.muted ? 'Sound: off' : 'Sound: on',
        onClick: () => {
          this.sfx.setMuted(!this.sfx.muted);
          this.engine.muted = this.sfx.muted;
          store.save('muted', this.sfx.muted);
          this.running = true;
          this.pause();
        },
      },
      { label: 'Quit to title', onClick: () => this.title() },
    ]);
  }

  private finish(): void {
    const r = this.race!;
    this.running = false;
    this.sfx.stopMusic();
    const won = r.status === 'finished';
    if (won) this.sfx.victory();
    else this.sfx.defeat();
    const score = Math.round(r.score);
    const best = store.load<number>('best', 0);
    if (score > best) store.save('best', score);
    const route = r.stages.map((s) => BIOME_NAMES[s.biome]).join(' > ');
    setTimeout(
      () =>
        showCard(
          `<h2>${won ? 'GOAL!' : 'TIME UP'}</h2><p>${route}</p><p><b>${score.toLocaleString()}</b> points${score > best ? ' · new best!' : ''}</p><p>${r.passed} cars passed · ${r.crashes} crashes · ${Math.round(r.time)}s</p>`,
          [
            { label: 'Drive again', primary: true, onClick: () => this.start() },
            { label: 'Title', onClick: () => this.title() },
          ],
          false,
        ),
      700,
    );
  }

  private say(text: string): void {
    const f = $('flash');
    f.textContent = text;
    f.classList.add('show');
    this.flashTimer = 1.6;
  }

  // ---------- loop ----------

  private resize(): void {
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.w = innerWidth;
    this.h = innerHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const chh = Math.max(9, Math.round(this.w / 64 / 0.6));
    this.font = `700 ${chh}px ${MONO}`;
    const cw = cellWidth(this.ctx, this.font);
    const cols = Math.floor(this.w / cw);
    const rows = Math.floor(this.h / chh);
    this.view = { cols, rows, cw, ch: chh, horizon: Math.round(rows * 0.42) };
    this.grid = makeGrid(cols, rows);
  }

  private frame(t: number): void {
    requestAnimationFrame((tt) => this.frame(tt));
    const dt = Math.min(0.1, (t - (this.last || t)) / 1000);
    this.last = t;
    const r = this.race;
    if (r && this.running) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= DT && n < 5) {
        step(r, this.input());
        this.acc -= DT;
        n++;
        this.handleFx(r);
        if (r.status !== 'racing') {
          this.finish();
          break;
        }
      }
    }
    this.engine.set(r ? r.player.speed / MAX_SPEED : 0, !!r && this.running, !!r?.player.boosting);
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) $('flash').classList.remove('show');
    }
    this.draw(t / 1000);
  }

  private handleFx(r: Race): void {
    for (const e of r.fx) {
      if (e.type === 'checkpoint') {
        this.say(`EXTENDED +${e.bonus}s`);
        this.sfx.levelUp();
        setTimeout(() => this.say(BIOME_NAMES[r.stages[e.stage].biome].toUpperCase()), 1200);
      } else if (e.type === 'crash') {
        this.sfx.hurt();
        if (e.hard) {
          this.sfx.boom();
          navigator.vibrate?.(60);
        }
      } else if (e.type === 'pass') this.sfx.gem();
      else if (e.type === 'offroad') navigator.vibrate?.(8);
      else if (e.type === 'finish') this.say('GOAL!');
      else if (e.type === 'timeout') this.say('TIME UP');
    }
    r.fx.length = 0;
  }

  private draw(time: number): void {
    const { ctx } = this;
    const r = this.race;
    if (!r) {
      ctx.fillStyle = '#05010f';
      ctx.fillRect(0, 0, this.w, this.h);
      return;
    }
    const out = drawRace(this.grid, r, this.view, this.sky, time);
    // Sky gradient behind the characters, dark ground below the horizon.
    const hy = out.horizonRow * this.view.ch;
    const g = ctx.createLinearGradient(0, 0, 0, hy);
    g.addColorStop(0, out.skyGradient[0]);
    g.addColorStop(1, out.skyGradient[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, hy);
    ctx.fillStyle = '#07030f';
    ctx.fillRect(0, hy, this.w, this.h - hy);
    const x0 = Math.floor((this.w - this.view.cols * this.view.cw) / 2);
    paintGrid(ctx, this.grid, x0, 0, this.view.cw, this.view.ch, this.font);
    this.hud(r);
  }

  private hud(r: Race): void {
    const p = r.player;
    $('speed').textContent = String(Math.round((p.speed / MAX_SPEED) * 290));
    const clock = $('clock');
    clock.textContent = String(Math.ceil(r.clock));
    clock.classList.toggle('low', r.clock < 10);
    $('score').textContent = Math.round(r.score).toLocaleString();
    $('stageName').textContent = `${r.stage + 1}/5 ${BIOME_NAMES[r.stages[r.stage].biome].toUpperCase()}`;
    $('progFill').style.width = `${stageProgress(r) * 100}%`;
    $('nitroFill').style.width = `${(p.nitro / NITRO_MAX) * 100}%`;
  }
}
