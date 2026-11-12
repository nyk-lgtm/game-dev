// Nightline controller: steering input, the fixed-step loop, HUD, screens.

import { closeOverlay, showCard } from '../shared/cards';
import { dailySeed, leaveDaily, loadDaily, prettyDay, recordDaily, todayKey } from '../shared/daily';
import { MONO, cellWidth, makeGrid, paintGrid, type Grid } from '../shared/ascii';
import { makeStore } from '../shared/storage';
import { Sfx } from '../afterglow/audio';
import { LOGO } from './art';
import { BIOME_NAMES, DT, FORK_SPLIT, MAX_SPEED, NEAR_MISS_POINTS, NITRO_MAX, RISK_STEP, SEG_LEN, SHARP_CURVE, STAGES, TREE, newRace, randomSeed, stageProgress, step, type Input, type Race } from './core';
import { Engine } from './engine';
import { FORK_LEAD, advanceSky, drawRace, type SkyState, type View } from './render';

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
  /** Pending "next biome" banner after a checkpoint. */
  private bannerTimer: ReturnType<typeof setTimeout> | undefined;
  /** Today's date while driving the daily route, else null. */
  private day: string | null = null;
  /** Last text written to each HUD element (DOM writes only on change). */
  private hudCache = new Map<string, string>();

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
    const stick = $('stick');
    const knob = stick.firstElementChild as HTMLElement;
    this.canvas.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      id = e.pointerId;
      x0 = e.clientX;
      if (this.tilt || !this.running) return;
      // A little slider under your thumb shows how hard you're steering.
      stick.style.left = `${x0}px`;
      stick.style.top = `${e.clientY - 46}px`;
      knob.style.transform = '';
      stick.hidden = false;
      if (!$('hint').hidden) {
        $('hint').hidden = true;
        store.save('steered', true);
      }
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id || this.tilt) return;
      // The further you drag from where you touched, the harder you steer.
      // ~120 px of drag is full lock (70 was twitchy on a phone).
      this.steer = Math.max(-1, Math.min(1, (e.clientX - x0) / 120));
      knob.style.transform = `translateX(${this.steer * 64}px)`;
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      stick.hidden = true;
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
    this.clearBanner();
    leaveDaily();
    this.day = null;
    $('hud').hidden = true;
    this.sfx.stopMusic();
    const best = store.load<number>('best', 0);
    const goals = store.load<number[]>('goals', []);
    const daily = loadDaily(store);
    const goalList = TREE[STAGES - 1]
      .map((b, i) => `<span style="color:${goals.includes(i) ? '#ffd166' : '#4a3a6a'}">${goals.includes(i) ? '[x]' : '[ ]'} ending ${i + 1}: ${BIOME_NAMES[b]}</span>`)
      .join('<br>');
    showCard(
      `<pre>${LOGO.join('\n')}</pre><p>Five stages. One clock. Pick your road at every fork: right is harder, but every hard road raises your score multiplier.</p>${best ? `<p class="meta">Best score ${best.toLocaleString()}</p>` : ''}<p class="meta" style="text-align:left;display:inline-block;margin:0 auto">Endings found ${goals.length}/${TREE[STAGES - 1].length}<br>${goalList}</p>`,
      [
        { label: 'Drive', primary: true, onClick: () => this.start() },
        { label: `Daily route · ${daily ? daily.label : 'not driven'}`, onClick: () => this.start(todayKey()) },
        { label: `Steering: ${this.tilt ? 'tilt' : 'drag'}`, onClick: () => this.toggleTilt() },
        { label: 'How to play', onClick: () => this.help() },
        { label: 'All games', onClick: () => (location.href = '../') },
      ],
      false,
    );
  }

  /** Opened with ?daily: today's route, one tap away (the tap also unlocks audio). */
  dailyCard(): void {
    const day = todayKey();
    const best = loadDaily(store, day);
    showCard(
      `<pre>${LOGO.join('\n')}</pre><h2>Daily route</h2><p>${prettyDay(day)}: the same road and traffic for everyone today.</p>${best ? `<p class="meta">Today's best ${best.label} · ${best.plays} ${best.plays === 1 ? 'drive' : 'drives'}</p>` : ''}`,
      [
        { label: 'Drive', primary: true, onClick: () => this.start(day) },
        { label: 'Title', onClick: () => this.title() },
      ],
      false,
    );
  }

  private toggleTilt(): void {
    this.tilt = !this.tilt;
    // Don't keep steering with the last tilt reading.
    this.steer = 0;
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
      <li>Passing cars refills nitro; a <b>close</b> pass (just beside them) scores extra and refills more. Ramming them costs speed.</li>
      <li>Reach each checkpoint before the clock runs out to earn more time.</li>
      <li>At the end of each stage the road forks (a yellow divider and arrows mark it): be <b>left</b> of the divider for the gentler route or <b>right</b> for a harder one. Each hard road adds x${RISK_STEP} to your score multiplier but gives a little less time.</li>
      <li>Your forks decide which of five <b>endings</b> the last stage leads to (each a different road to the finish). Can you find them all?</li></ul>`,
      [{ label: 'Back', primary: true, onClick: () => this.title() }],
      false,
    );
  }

  /** Start a race; with `day`, that day's daily route (the same road and traffic for everyone). */
  start(day: string | null = null): void {
    closeOverlay();
    this.clearBanner();
    this.day = day;
    if (!day) leaveDaily();
    this.hudCache.clear();
    this.race = newRace(day ? dailySeed('nightline', day) : randomSeed());
    this.sky = { offset: 0 };
    this.acc = 0;
    this.steer = 0;
    this.running = true;
    $('hud').hidden = false;
    $('stick').hidden = true;
    // Until you've steered once, say how.
    $('hint').hidden = this.tilt || store.load('steered', false);
    this.sfx.startMusic();
    this.say(day ? 'DAILY · GO!' : 'GO!');
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
    // Which of the five goals (if any) this was.
    let goalLine = '';
    if (won) {
      const pos = r.route.reduce((a, b) => a + b, 0);
      const goals = store.load<number[]>('goals', []);
      const fresh = !goals.includes(pos);
      if (fresh) store.save('goals', [...goals, pos].sort());
      goalLine = `<p>${fresh ? '<b>New ending found!</b> ' : ''}Endings ${goals.length + (fresh ? 1 : 0)}/${TREE[STAGES - 1].length}</p>`;
    } else {
      goalLine = `<p>Time ran out ${Math.round(stageProgress(r) * 100)}% into stage ${r.stage + 1} of ${STAGES} (${BIOME_NAMES[r.stages[r.stage].biome]}).</p>`;
    }
    const day = this.day;
    const daily = day ? recordDaily(store, score, `${score.toLocaleString()}${won ? ' · goal' : ` · stage ${r.stage + 1}`}`, day) : null;
    const dailyLine = day ? `<p><b>Daily route · ${prettyDay(day)}</b><br>${daily!.improved ? 'New best for today!' : `Today's best: ${daily!.best.score.toLocaleString()}`}</p>` : '';
    const route = r.stages.map((s, i) => `<span style="color:${i && r.route[i - 1] ? '#ff2a6d' : '#05d9e8'}">${BIOME_NAMES[s.biome]}</span>`).join(' &gt; ');
    setTimeout(
      () =>
        showCard(
          `<h2>${won ? 'GOAL!' : 'TIME UP'}</h2><p>${route}</p><p><b>${score.toLocaleString()}</b> points${r.mult > 1 ? ` (x${r.mult})` : ''}${score > best ? ' · new best!' : ''}</p>${goalLine}<p>${r.passed} cars passed · ${r.crashes} crashes · ${Math.round(r.time)}s</p>${dailyLine}`,
          [
            { label: day ? 'Retry today’s route' : 'Drive again', primary: true, onClick: () => this.start(day) },
            ...(day ? [{ label: 'Free drive', onClick: () => this.start() }] : []),
            { label: 'Title', onClick: () => this.title() },
          ],
          false,
        ),
      700,
    );
  }

  private clearBanner(): void {
    clearTimeout(this.bannerTimer);
    this.bannerTimer = undefined;
  }

  private say(text: string, secs = 1.6): void {
    // A near-miss shout never cuts short a checkpoint or route banner.
    if (secs < 1 && this.flashTimer > 0.8) return;
    const f = $('flash');
    f.textContent = text;
    f.classList.add('show');
    this.flashTimer = secs;
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
        advanceSky(this.sky, r);
        this.acc -= DT;
        n++;
        this.handleFx(r);
        if (r.status !== 'racing') {
          this.finish();
          break;
        }
      }
      // Too far behind (slow device): drop the backlog instead of carrying it forever.
      if (n >= 5) this.acc = Math.min(this.acc, DT);
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
        this.say(e.hard ? `HARD ROAD x${r.mult} · +${e.bonus}s` : `EXTENDED +${e.bonus}s`);
        this.sfx.levelUp();
        const biome = BIOME_NAMES[r.stages[e.stage].biome].toUpperCase();
        this.clearBanner();
        this.bannerTimer = setTimeout(() => {
          this.bannerTimer = undefined;
          if (this.race === r && r.status === 'racing') this.say(biome);
        }, 1200);
      } else if (e.type === 'crash') {
        this.sfx.hurt();
        if (e.hard) {
          this.sfx.boom();
          navigator.vibrate?.(60);
        }
      } else if (e.type === 'pass') {
        this.sfx.gem();
        if (e.close) {
          this.say(`CLOSE! +${NEAR_MISS_POINTS * r.mult}`, 0.7);
          navigator.vibrate?.(12);
        }
      }
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

  /** Set an element's text (or a style width) only when it changed. */
  private set(id: string, value: string, width = false): void {
    const key = width ? `${id}.w` : id;
    if (this.hudCache.get(key) === value) return;
    this.hudCache.set(key, value);
    if (width) $(id).style.width = value;
    else $(id).textContent = value;
  }

  private hud(r: Race): void {
    const p = r.player;
    this.set('speed', String(Math.round((p.speed / MAX_SPEED) * 290)));
    this.set('clock', String(Math.ceil(r.clock)));
    const low = r.clock < 10 ? '1' : '';
    if (this.hudCache.get('low') !== low) {
      this.hudCache.set('low', low);
      $('clock').classList.toggle('low', !!low);
    }
    this.set('score', Math.round(r.score).toLocaleString());
    this.set('mult', r.mult > 1 ? `x${r.mult}` : '');
    this.set('stageName', `${r.stage + 1}/5 ${BIOME_NAMES[r.stages[r.stage].biome].toUpperCase()}`);
    this.set('progFill', `${(stageProgress(r) * 100).toFixed(1)}%`, true);
    this.set('nitroFill', `${((p.nitro / NITRO_MAX) * 100).toFixed(1)}%`, true);
    // Sharp curve ahead (one you can't hold at top speed): warn about two seconds out.
    let warn = '';
    if (r.status === 'racing') {
      const here = Math.floor(p.z / SEG_LEN);
      const ahead = Math.ceil((Math.max(p.speed, MAX_SPEED * 0.5) * 2) / SEG_LEN);
      const cur = r.segments[here]?.curve ?? 0;
      for (let k = 4; k <= ahead; k++) {
        const c = r.segments[here + k]?.curve ?? 0;
        if (Math.abs(c) > SHARP_CURVE && Math.abs(cur) < SHARP_CURVE * 0.8) {
          warn = c < 0 ? '◀ SHARP LEFT · BRAKE' : 'BRAKE · SHARP RIGHT ▶';
          break;
        }
      }
    }
    if (this.hudCache.get('warn') !== warn) {
      this.hudCache.set('warn', warn);
      $('curveWarn').textContent = warn;
      $('curveWarn').hidden = !warn;
    }
    // The fork panel: both destinations, with the side you're on lit up.
    const stage = r.stages[r.stage];
    const toFork = stage.end - p.z / SEG_LEN;
    const forkOn = r.status === 'racing' && r.stage + 1 < STAGES && toFork > 0 && toFork < FORK_LEAD + 50;
    const side = forkOn ? (p.x > FORK_SPLIT ? 'R' : 'L') : '';
    const key = forkOn ? `${r.stage}${side}` : '';
    if (this.hudCache.get('fork') !== key) {
      this.hudCache.set('fork', key);
      $('fork').hidden = !forkOn;
      if (forkOn) {
        const pos = r.route.reduce((a, b) => a + b, 0);
        const next = TREE[r.stage + 1];
        $('forkL').innerHTML = `&lt; ${BIOME_NAMES[next[pos]].toUpperCase()}<small>gentle · x${r.mult}</small>`;
        $('forkR').innerHTML = `${BIOME_NAMES[next[pos + 1]].toUpperCase()} &gt;<small>hard · x${r.mult + RISK_STEP}</small>`;
        $('forkL').classList.toggle('on', side === 'L');
        $('forkR').classList.toggle('on', side === 'R');
      }
    }
  }
}
