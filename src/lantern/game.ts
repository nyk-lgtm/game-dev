// Lantern controller: tap to walk/fight/talk, auto-walk, dialogue, HUD.

import { closeOverlay, showCard } from '../shared/cards';
import { copyText, toast } from '../shared/debug';
import {
  ARMORS,
  MAPS,
  NPC_NAMES,
  RULES_VERSION,
  WEAPONS,
  WORLD,
  XP_TABLE,
  applyAction,
  attackOf,
  defenceOf,
  dialogue,
  encodeAction,
  fov,
  isLegal,
  monsterAt,
  newGame,
  pathTo,
  randomSeed,
  replay,
  samePos,
  type Action,
  type GameEvent,
  type GameState,
  type NpcId,
  type Pos,
} from './core';
import { DIRS8, addPos } from './core/world';
import { camera, cellAtPx, draw, fitView, type Fx, type View } from './render';
import { load, save } from './storage';

interface SavedGame {
  seed: number;
  actions: string;
  v: number;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const STEP_MS = 95;

export class Game {
  private state!: GameState;
  private run!: SavedGame;
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private fx: Fx[] = [];
  private flash: { at: Pos; t: number; color: string } | null = null;
  /** Auto-walk: remaining steps and where they lead. */
  private walk: { dirs: number[]; target: Pos; chase: number | null } | null = null;
  private nextStepAt = 0;
  private last = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement!);
    this.resize();
    this.bindInput();
    $('waitBtn').onclick = () => this.act({ type: 'wait' });
    $('potionBtn').onclick = () => this.act({ type: 'potion' });
    $('packBtn').onclick = () => this.showPack();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------- lifecycle ----------

  start(seed: number, actions = ''): void {
    let s: GameState;
    try {
      s = replay(seed, actions);
    } catch {
      actions = '';
      s = newGame(seed);
    }
    this.run = { seed, actions, v: RULES_VERSION };
    this.state = s;
    this.walk = null;
    this.fx = [];
    this.persist();
    this.refreshUi();
  }

  newGame(): void {
    closeOverlay();
    this.start(randomSeed());
  }

  private persist(): void {
    save('game', this.run);
    if (this.state.quest === 'won') {
      const best = load<number | null>('bestTurns', null);
      if (best === null || this.state.turn < best) save('bestTurns', this.state.turn);
    }
  }

  // ---------- input ----------

  private bindInput(): void {
    let down: { x: number; y: number; id: number } | null = null;
    this.canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY, id: e.pointerId }));
    this.canvas.addEventListener('pointerup', (e) => {
      if (!down || down.id !== e.pointerId) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 16) return;
      const r = this.canvas.getBoundingClientRect();
      this.tap(e.clientX - r.left, e.clientY - r.top);
    });
    this.canvas.addEventListener('pointercancel', () => (down = null));
  }

  private view(): View {
    const m = WORLD[this.state.player.map];
    return camera(fitView(this.w, this.h, m.w, m.h), this.state);
  }

  private tap(px: number, py: number): void {
    if (!$('overlay').hidden) return;
    if (this.walk) {
      // A tap while walking just stops.
      this.walk = null;
      return;
    }
    const target = cellAtPx(this.view(), px, py);
    const s = this.state;
    if (samePos(target, s.player.pos)) return;
    const foe = monsterAt(s, s.player.map, target);
    const dirs = pathTo(s, target);
    if (!dirs) {
      this.say('You can’t get there from here.');
      return;
    }
    this.walk = { dirs, target, chase: foe ? foe.id : null };
    this.nextStepAt = 0;
  }

  /** One auto-walk step; stops on anything noteworthy. */
  private walkStep(): void {
    const w = this.walk!;
    const s = this.state;
    if (w.chase !== null) {
      // Follow a moving monster.
      const foe = s.monsters.find((m) => m.id === w.chase && m.hp > 0 && m.map === s.player.map);
      if (!foe) {
        this.walk = null;
        return;
      }
      w.target = foe.pos;
      w.dirs = pathTo(s, foe.pos) ?? [];
    }
    const dir = w.dirs.shift();
    if (dir === undefined || !isLegal(s, { type: 'step', dir })) {
      this.walk = null;
      return;
    }
    const before = this.visibleMonsters();
    const events = this.act({ type: 'step', dir }, true);
    const stop = events.some((e) =>
      ['hit', 'miss', 'kill', 'talk', 'read', 'loot', 'levelUp', 'enterMap', 'playerDown', 'win'].includes(e.type),
    );
    if (stop || w.dirs.length === 0 && w.chase === null) this.walk = null;
    else if (this.visibleMonsters() > before) {
      this.walk = null;
      this.say('Something moves nearby.');
    }
  }

  private visibleMonsters(): number {
    const s = this.state;
    const m = WORLD[s.player.map];
    const lit = MAPS[s.player.map].dark ? fov(m, s.player.pos) : null;
    return s.monsters.filter(
      (mo) =>
        mo.hp > 0 &&
        mo.map === s.player.map &&
        Math.max(Math.abs(mo.pos.x - s.player.pos.x), Math.abs(mo.pos.y - s.player.pos.y)) <= 8 &&
        (!lit || lit.has(mo.pos.y * m.w + mo.pos.x)),
    ).length;
  }

  /** Apply an action if legal; returns its events. */
  private act(a: Action, fromWalk = false): GameEvent[] {
    if (!fromWalk) this.walk = null;
    if (!isLegal(this.state, a)) return [];
    const { state, events } = applyAction(this.state, a);
    this.run.actions += encodeAction(a);
    this.state = state;
    this.persist();
    this.react(events);
    this.refreshUi();
    return events;
  }

  private react(events: GameEvent[]): void {
    const s = this.state;
    for (const e of events) {
      switch (e.type) {
        case 'hit':
          this.fx.push({ text: `-${e.dmg}`, color: e.onPlayer ? '#ff5c5c' : '#ffffff', x: e.at.x, y: e.at.y, age: 0, life: 700 });
          this.flash = { at: e.at, t: 0, color: e.onPlayer ? '#ff3d5a' : '#ffffff' };
          if (e.onPlayer) navigator.vibrate?.(40);
          break;
        case 'miss':
          this.fx.push({ text: 'miss', color: '#8b8a95', x: e.at.x, y: e.at.y, age: 0, life: 600 });
          break;
        case 'levelUp':
          this.fx.push({ text: `LEVEL ${e.level}`, color: '#ffd166', x: s.player.pos.x, y: s.player.pos.y, age: 0, life: 1400 });
          navigator.vibrate?.(30);
          break;
        case 'loot':
          this.fx.push({ text: '+loot', color: '#e7b84a', x: s.player.pos.x, y: s.player.pos.y, age: 0, life: 1000 });
          break;
        case 'heal':
          if (e.amount > 0) this.fx.push({ text: `+${e.amount}`, color: '#7bed9f', x: s.player.pos.x, y: s.player.pos.y, age: 0, life: 800 });
          break;
        case 'talk':
          setTimeout(() => this.showTalk(e.npc), 50);
          break;
        case 'win':
          setTimeout(() => this.showWin(), 400);
          break;
        case 'playerDown':
          setTimeout(
            () =>
              showCard(
                `<h2>You fall</h2><p>You wake by the cold Lantern in Emberwick. Half your gold is gone, but you keep everything else. The monsters you slew stay slain.</p>`,
                [{ label: 'Get up', primary: true, onClick: closeOverlay }],
                false,
              ),
            200,
          );
          break;
      }
    }
  }

  // ---------- UI ----------

  private say(text: string): void {
    this.state.log.push(text);
    this.refreshUi();
  }

  private refreshUi(): void {
    const s = this.state;
    const p = s.player;
    $('hpText').textContent = `${p.hp}/${p.maxHp}`;
    $('hpBar').style.width = `${(100 * p.hp) / p.maxHp}%`;
    $('lvl').textContent = String(p.level);
    $('atkdef').textContent = `${attackOf(s)}/${defenceOf(s)}`;
    $('gold').textContent = String(p.gold);
    const pot = $<HTMLButtonElement>('potionBtn');
    pot.textContent = `Potion ×${p.potions}`;
    pot.disabled = !isLegal(s, { type: 'potion' });
    $('log').innerHTML = s.log
      .slice(-3)
      .map((l) => `<div>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>`)
      .join('');
  }

  private showTalk(npc: NpcId): void {
    const d = dialogue(this.state, npc);
    const buttons = d.options.map((o) => ({
      label: o.label,
      primary: false,
      onClick: () => {
        if (!o.enabled) return;
        this.act(o.action);
        this.showTalk(npc);
      },
    }));
    showCard(
      `<p class="speaker">${d.name}</p><p>${d.text}</p><p>You have ${this.state.player.gold} gold.</p>`,
      [...buttons, { label: 'Goodbye', primary: true, onClick: closeOverlay }],
    );
    // Grey out options you can't afford.
    const btns = document.querySelectorAll<HTMLButtonElement>('#overlay .card button');
    d.options.forEach((o, i) => (btns[i].disabled = !o.enabled));
  }

  private showPack(): void {
    const s = this.state;
    const p = s.player;
    const next = XP_TABLE[p.level] ?? null;
    showCard(
      `<h2>Pack</h2>
      <table>
        <tr><td>Level</td><td>${p.level}</td></tr>
        <tr><td>XP</td><td>${p.xp}${next !== null ? ` / ${next}` : ''}</td></tr>
        <tr><td>Health</td><td>${p.hp} / ${p.maxHp}</td></tr>
        <tr><td>Weapon</td><td>${WEAPONS[p.weapon].name} (+${WEAPONS[p.weapon].atk})</td></tr>
        <tr><td>Armor</td><td>${ARMORS[p.armor].name} (+${ARMORS[p.armor].def})</td></tr>
        <tr><td>Attack / Defence</td><td>${attackOf(s)} / ${defenceOf(s)}</td></tr>
        <tr><td>Potions</td><td>${p.potions}</td></tr>
        <tr><td>Gold</td><td>${p.gold}</td></tr>
        <tr><td>Quest</td><td>${
          { none: 'Talk to the Elder', started: 'Find the Ember', ember: 'Bring the Ember home', won: 'Done!' }[s.quest]
        }</td></tr>
      </table>`,
      [{ label: 'Close', primary: true, onClick: closeOverlay }],
    );
  }

  showHelp(): void {
    showCard(
      `<h2>How to play Lantern</h2>
      <ul>
        <li><b>Tap anywhere</b> to walk there. Tap again to stop. You stop by yourself when something shows up.</li>
        <li><b>Tap a monster</b> to walk up and hit it. One tap, one attack (monsters hit back each turn).</li>
        <li><b>Tap a person</b> (coloured <b>@</b>) to talk and shop. <b>?</b> is a sign, <b>≡</b> a chest.</li>
        <li><b>Potion</b> heals 12. <b>Wait</b> passes a turn. You also heal slowly over time.</li>
        <li>Level up by winning fights. Bram sells steel, Mira heals.</li>
        <li>Caves are dark: you see only what your lantern lights. Explored ground stays dimly remembered.</li>
        <li>If you fall, you wake in the village with half your gold. Slain monsters stay slain.</li>
      </ul>`,
      [{ label: 'Begin', primary: true, onClick: closeOverlay }],
    );
    save('seenHelp', true);
  }

  showMenu(): void {
    const s = this.state;
    showCard(
      `<h2>Lantern</h2><p>${MAPS[s.player.map].name} · Turn ${s.turn} · Falls ${s.deaths}</p>`,
      [
        { label: 'Resume', primary: true, onClick: closeOverlay },
        { label: 'How to play', onClick: () => this.showHelp() },
        { label: 'Copy bug report', onClick: () => this.copyReport() },
        { label: 'All games', onClick: () => (location.href = '../') },
        { label: 'Abandon & start over', onClick: () => this.newGame() },
      ],
    );
  }

  private showWin(): void {
    const s = this.state;
    showCard(
      `<h2>The Lantern burns again</h2><p>Light pours over Emberwick. ${NPC_NAMES.elder} weeps and laughs at once.</p>
      <p>Level ${s.player.level} · ${s.turn} turns · ${s.deaths} fall${s.deaths === 1 ? '' : 's'}</p>`,
      [
        { label: 'Walk the village', primary: true, onClick: closeOverlay },
        { label: 'New game', onClick: () => this.newGame() },
        { label: 'All games', onClick: () => (location.href = '../') },
      ],
    );
  }

  private async copyReport(): Promise<void> {
    const ua = navigator.userAgent.replace(/\s+/g, ' ');
    const text = `LANTERN build=${__BUILD_ID__} rules=${RULES_VERSION} seed=${this.run.seed} a=${this.run.actions || '-'} screen=${innerWidth}x${innerHeight}@${devicePixelRatio} ua="${ua}"`;
    toast((await copyText(text)) ? 'Bug report copied — paste it in chat' : 'Copy failed');
  }

  // ---------- rendering ----------

  private resize(): void {
    const parent = this.canvas.parentElement!;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.w = parent.clientWidth;
    this.h = parent.clientHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private frame(t: number): void {
    requestAnimationFrame((tt) => this.frame(tt));
    const dt = Math.min(50, t - (this.last || t));
    this.last = t;
    if (!this.state || this.w < 1 || this.h < 1) return;
    try {
      if (this.walk && $('overlay').hidden && t >= this.nextStepAt) {
        this.nextStepAt = t + STEP_MS;
        this.walkStep();
      }
      for (const f of this.fx) f.age += dt;
      this.fx = this.fx.filter((f) => f.age < f.life);
      if (this.flash) {
        this.flash.t += dt / 250;
        if (this.flash.t >= 1) this.flash = null;
      }
      const v = this.view();
      const path: Pos[] = [];
      if (this.walk) {
        let cur = this.state.player.pos;
        for (const d of this.walk.dirs) {
          cur = addPos(cur, DIRS8[d]);
          path.push(cur);
        }
      }
      draw(this.ctx, this.w, this.h, v, this.state, this.fx, this.flash, path, t);
    } catch (err) {
      this.walk = null;
      setTimeout(() => {
        throw err;
      });
    }
  }
}
