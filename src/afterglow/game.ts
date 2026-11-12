// Afterglow controller: screens, the fixed-step loop, camera, HUD, audio,
// pausing, and saving meta progress between runs.

import { copyText, toast } from '../shared/debug';
import { makeStore } from '../shared/storage';
import { dailySeed, leaveDaily, loadDaily, prettyDay, recordDaily, todayKey, wantsDaily } from '../shared/daily';
import { Sfx } from './audio';
import {
  CHARACTERS,
  DT,
  ENEMIES,
  META,
  NIGHTS,
  RUN_SECONDS,
  banish,
  choose,
  createWorld,
  emptyProfile,
  randomSeed,
  reroll,
  skip,
  step,
  takeChest,
  waiting,
  xpToNext,
  type Profile,
  type WeaponId,
  type World,
} from './core';
import { Stick } from './input';
import { drawWorld, type Camera } from './render/draw';
import { Fx } from './render/fx';
import { setSpriteScale } from './render/sprites';
import { fmtTime, hideUi, showChest, showHelp, showLevelUp, showPause, showResults, showShop, showTitle, type RunSummary } from './ui';

const store = makeStore('afterglow.');
const $ = (id: string) => document.getElementById(id)!;

/** The daily's arena alternates with the seed. */
const dailyArena = (day: string) => dailySeed('afterglow-arena', day) % 2;

type Mode = 'title' | 'run' | 'paused' | 'choice' | 'over';

export class Game {
  profile: Profile = { ...emptyProfile(), ...store.load<Partial<Profile>>('profile', {}) };
  world: World | null = null;
  private fx = new Fx();
  private stick: Stick;
  private sfx = new Sfx();
  private mode: Mode = 'title';
  private character = store.load<string>('character', 'spark');
  private night = store.load<number>('night', 0);
  private arena = store.load<number>('arena', 0);
  /** Today's date while in daily mode (?daily), else null. */
  private daily: string | null = wantsDaily() ? todayKey() : null;
  private dailyResult: ReturnType<typeof recordDaily> | null = null;
  private ctx: CanvasRenderingContext2D;
  private cam: Camera = { x: 0, y: 0, k: 1, w: 0, h: 0 };
  private acc = 0;
  private last = 0;
  private prismDown = false;
  private hudCache = '';

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.stick = new Stick(canvas);
    this.sfx.setMuted(store.load('muted', false));
    addEventListener('resize', () => this.resize());
    this.resize();
    $('pauseBtn').onclick = () => this.pause();
    const autoPause = () => {
      if (this.mode === 'run') this.pause();
    };
    document.addEventListener('visibilitychange', () => document.hidden && autoPause());
    addEventListener('blur', autoPause);
    // Any tap unlocks audio on mobile.
    addEventListener('pointerdown', () => this.sfx.unlock(), { capture: true });
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------- screens ----------

  title(): void {
    this.mode = 'title';
    this.world = null;
    $('hud').hidden = true;
    this.sfx.stopMusic();
    const daily = this.daily ? { day: this.daily, arena: dailyArena(this.daily), best: loadDaily(store, this.daily)?.label ?? null } : null;
    showTitle(this.profile, this.character, this.night, this.arena, daily, {
      start: (c, n, a) => this.start(c, n, a),
      normal: () => {
        this.daily = null;
        leaveDaily();
        this.title();
      },
      shop: () => this.shop(),
      help: () => showHelp(() => this.title()),
      hub: () => (location.href = '../'),
    });
  }

  private shop(): void {
    showShop(this.profile, {
      buy: (id) => {
        const m = META.find((x) => x.id === id)!;
        const rank = this.profile.ranks[id] ?? 0;
        const cost = m.cost(rank);
        if (rank >= m.max || this.profile.shards < cost) return;
        this.profile.shards -= cost;
        this.profile.ranks[id] = rank + 1;
        this.saveProfile();
        this.sfx.click();
        this.shop();
      },
      back: () => this.title(),
    });
  }

  start(character: string, night = this.night, arena = this.arena): void {
    this.character = character;
    store.save('character', character);
    this.dailyResult = null;
    if (this.daily) {
      // Everyone gets the same night: same seed, same arena, Night 1.
      this.world = createWorld(dailySeed('afterglow', this.daily), character, this.profile, 0, dailyArena(this.daily));
    } else {
      this.night = night;
      this.arena = arena;
      store.save('night', night);
      store.save('arena', arena);
      this.world = createWorld(randomSeed(), character, this.profile, night, arena);
    }
    this.fx = new Fx();
    this.prismDown = false;
    this.acc = 0;
    this.mode = 'run';
    hideUi();
    $('hud').hidden = false;
    this.stick.release();
    this.sfx.startMusic();
  }

  private pause(): void {
    if (this.mode !== 'run' || !this.world) return;
    this.mode = 'paused';
    this.stick.release();
    showPause(this.world, {
      resume: () => this.resume(),
      quit: () => this.end(),
      report: () => this.copyReport(),
      muted: this.sfx.muted,
      toggleMute: () => {
        this.sfx.setMuted(!this.sfx.muted);
        store.save('muted', this.sfx.muted);
        this.mode = 'run';
        this.pause();
      },
    });
  }

  private resume(): void {
    this.mode = 'run';
    this.acc = 0;
    hideUi();
  }

  /** Show whatever the sim is waiting on: a chest first, then level-ups. */
  private offerChoice(): void {
    const w = this.world!;
    this.mode = 'choice';
    this.stick.release();
    if (w.chestQueue > 0) {
      const got = takeChest(w);
      if (got.some((c) => c.evolves)) this.sfx.evolve();
      else this.sfx.chest();
      showChest(w, got, () => this.afterChoice());
      return;
    }
    this.sfx.levelUp();
    showLevelUp(w, {
      choose: (i) => {
        this.sfx.click();
        choose(w, i);
        this.afterChoice();
      },
      reroll: () => {
        reroll(w);
        this.offerChoice();
      },
      skip: () => {
        skip(w);
        this.afterChoice();
      },
      banish: (i) => {
        banish(w, i);
        this.offerChoice();
      },
    });
  }

  private afterChoice(): void {
    if (this.world && waiting(this.world)) this.offerChoice();
    else this.resume();
  }

  private end(): void {
    const w = this.world!;
    this.mode = 'over';
    $('hud').hidden = true;
    this.sfx.stopMusic();
    if (w.status === 'won') this.sfx.victory();
    else this.sfx.defeat();
    const before = new Set(CHARACTERS.filter((c) => !c.unlock || c.unlock.check(this.profile)).map((c) => c.id));
    const bonus = w.time / 20 + w.kills / 150 + (w.status === 'won' ? 150 : 0) + (this.prismDown ? 40 : 0);
    const shards = Math.floor((w.shards + bonus * w.stats.greed) * NIGHTS[w.night].shards);
    const pr = this.profile;
    pr.shards += shards;
    pr.runs++;
    pr.bestTime = Math.max(pr.bestTime, Math.min(w.time, RUN_SECONDS + 60));
    pr.bestLevel = Math.max(pr.bestLevel, w.player.level);
    pr.bestKills = Math.max(pr.bestKills, w.kills);
    if (this.prismDown) pr.prismKills++;
    if (w.status === 'won') pr.wins++;
    const nightUnlock = w.status === 'won' && w.night + 1 > (pr.nightsWon ?? 0) && w.night + 1 < NIGHTS.length;
    if (w.status === 'won') pr.nightsWon = Math.max(pr.nightsWon ?? 0, w.night + 1);
    this.saveProfile();
    const unlocked = CHARACTERS.filter((c) => !before.has(c.id) && c.unlock?.check(pr)).map((c) => c.name);
    if (nightUnlock) unlocked.push(NIGHTS[w.night + 1].name);
    if (this.daily) {
      const won = w.status === 'won';
      this.dailyResult = recordDaily(store, Math.floor(w.time) + (won ? 10000 : 0), won ? `Dawn in ${fmtTime(w.time)}` : fmtTime(w.time), this.daily);
    }
    const dealt = (Object.entries(w.dealt) as [WeaponId, number][]).sort((a, b) => b[1] - a[1]);
    const taken = Object.entries(w.taken).sort((a, b) => b[1] - a[1]);
    const summary: RunSummary = { won: w.status === 'won', time: w.time, level: w.player.level, kills: w.kills, shards, night: w.night, arena: w.arena, daily: this.daily ? { day: prettyDay(this.daily), improved: !!this.dailyResult?.improved, best: this.dailyResult?.best.label ?? '' } : null, dealt, taken, killedBy: w.killedBy, unlocked };
    showResults(summary, { again: () => this.start(this.character), menu: () => this.title() });
  }

  private saveProfile(): void {
    store.save('profile', this.profile);
  }

  // ---------- loop ----------

  private resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = innerWidth;
    const h = innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // About 400 world units across a portrait phone.
    const k = Math.min(w / 400, h / 680);
    this.cam = { ...this.cam, k, w, h };
    setSpriteScale(k);
  }

  private frame(t: number): void {
    requestAnimationFrame((tt) => this.frame(tt));
    const dt = Math.min(0.1, (t - (this.last || t)) / 1000);
    this.last = t;
    const w = this.world;
    if (this.mode === 'run' && w) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= DT && steps < 4) {
        const inp = this.stick.read();
        step(w, inp.x, inp.y);
        this.acc -= DT;
        steps++;
        this.consumeFx(w);
        if (w.status !== 'playing' || waiting(w)) break;
      }
      if (steps === 4) this.acc = 0;
      if (w.status !== 'playing') {
        this.end();
      } else if (waiting(w)) this.offerChoice();
      this.sfx.setIntensity(Math.min(1, w.enemies.length / 220 + (w.boss !== null ? 0.4 : 0)));
    }
    this.fx.update(dt);
    if (w) {
      // Camera eases toward the player.
      this.cam.x += (w.player.x - this.cam.x) * Math.min(1, dt * 12);
      this.cam.y += (w.player.y - this.cam.y) * Math.min(1, dt * 12);
      try {
        drawWorld(this.ctx, w, this.fx, this.cam, t / 1000, this.mode === 'run' ? this.stick.view : null);
      } catch (err) {
        setTimeout(() => {
          throw err;
        });
      }
      this.hud(w);
    } else this.drawIdle(t / 1000);
  }

  private consumeFx(w: World): void {
    this.fx.consume(w.fx);
    w.fx.length = 0;
    const c = this.fx.counts;
    if (c.hit) this.sfx.hit();
    if (c.kill) this.sfx.kill();
    if (c.bigKill) this.sfx.kill(true);
    if (c.gem) this.sfx.gem();
    if (c.pickup) this.sfx.pickup();
    if (c.hurt) {
      this.sfx.hurt();
      navigator.vibrate?.(25);
    }
    if (c.ring) this.sfx.nova();
    if (c.chain) this.sfx.zap();
    if (c.beam) this.sfx.beam();
    if (c.boom) this.sfx.boom();
    else if (c.mine) this.sfx.mine();
    if (c.warn) this.sfx.warn();
    if (w.boss === null && w.eventsDone.includes('prism') && !this.prismDown && w.time < RUN_SECONDS) this.prismDown = true;
  }

  private hud(w: World): void {
    const boss = w.boss !== null ? w.enemies.find((e) => e.id === w.boss) : null;
    const key = `${w.player.level}|${Math.floor(w.time)}|${w.kills}|${Math.round((100 * w.player.xp) / xpToNext(w.player.level))}|${boss ? Math.round((100 * boss.hp) / boss.maxHp) : -1}|${this.fx.banner?.text ?? ''}`;
    if (key === this.hudCache) return;
    this.hudCache = key;
    $('lvl').textContent = `LV ${w.player.level}`;
    $('timer').textContent = fmtTime(w.time);
    $('kills').textContent = String(w.kills);
    $('xpfill').style.width = `${Math.min(100, (100 * w.player.xp) / xpToNext(w.player.level))}%`;
    const bar = $('bossbar');
    bar.hidden = !boss;
    if (boss) {
      $('bossname').textContent = ENEMIES[boss.kind].name;
      $('bossfill').style.width = `${(100 * boss.hp) / boss.maxHp}%`;
    }
    const banner = $('banner');
    if (this.fx.banner) {
      banner.textContent = this.fx.banner.text;
      banner.classList.add('show');
    } else banner.classList.remove('show');
  }

  /** Title backdrop: drifting grid and a slow pulse. */
  private drawIdle(t: number): void {
    const { ctx, cam } = this;
    ctx.fillStyle = '#05060d';
    ctx.fillRect(0, 0, cam.w, cam.h);
    const g = 80 * cam.k;
    const off = (t * 20) % g;
    ctx.strokeStyle = 'rgba(80, 110, 200, 0.12)';
    ctx.beginPath();
    for (let x = -off; x < cam.w; x += g) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, cam.h);
    }
    for (let y = -off; y < cam.h; y += g) {
      ctx.moveTo(0, y);
      ctx.lineTo(cam.w, y);
    }
    ctx.stroke();
  }

  async copyReport(): Promise<void> {
    const w = this.world;
    const text = `AFTERGLOW build=${__BUILD_ID__} seed=${w?.seed} t=${w?.time.toFixed(1)} lvl=${w?.player.level} weapons=${w?.weapons.map((x) => x.id + x.level).join(',')} ua="${navigator.userAgent}"`;
    toast((await copyText(text)) ? 'Bug report copied' : 'Copy failed');
  }
}
