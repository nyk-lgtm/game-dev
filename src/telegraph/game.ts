// Game controller: owns the run, wires input -> rules -> animation -> UI.

import {
  ENEMIES,
  RULES_VERSION,
  applyAction,
  bashTargets,
  distanceField,
  key,
  playerWalkable,
  tileAt,
  encodeAction,
  enemyAt,
  eq,
  isAdjacent,
  inBounds,
  legalMoves,
  newRun,
  previewAction,
  randomSeed,
  replay,
  threats,
  threatsAt,
  type Action,
  type Enemy,
  type GameState,
  type Hex,
  type Outcome,
  type ThreatSource,
} from './core';
import { copyText, toast } from '../shared/debug';
import { bugReport } from './debug';
import { Animator } from './render/anim';
import { draw } from './render/draw';
import { fitBoard, pxToHex, type Layout } from './render/layout';
import { sceneFromState, type Scene } from './render/scene';
import { load, save } from './storage';
import { HELP_HTML, closeOverlay, enemyIntroHtml, renderHud, renderPanel, showCard } from './ui/dom';

/** In-play hint: a toast over the bottom panel, under menus, clear of the board's top row. */
const hint = (msg: string) => toast(msg).classList.add('hint');

/** A short note on what an enemy is about to do, for the inspect panel. */
function statusOf(e: Enemy): string {
  if (e.staggered) return ' · dazed';
  if (e.aim !== null) return ` · <span class="bad">${e.kind === 'pylon' ? 'zaps after your move' : 'aiming'}</span>`;
  if (e.reload > 0) return ' · resting';
  return e.kind === 'pylon' ? ' · charges after your move' : '';
}

/** "a Brute's smash", "an Archer's arrow"…: who threatens a hex, and how. */
function threatPhrase(s: GameState, t: ThreatSource): string {
  if (t.kind === 'bomb') return t.fuse === 1 ? 'a bomb blast' : `a bomb (in ${t.fuse ?? 2} turns)`;
  const e = s.enemies.find((x) => x.id === t.by);
  const name = e ? ENEMIES[e.kind].name : 'enemy';
  const a = /^[AEIOU]/i.test(name) ? 'an' : 'a';
  const what = { smash: 'smash', shot: 'arrow', charge: 'charge', hook: 'hook', zap: 'zap' }[t.kind];
  return `${a} <span class="c-${e?.kind ?? 'threat'}">${name}</span>'s ${what}`;
}

function threatList(s: GameState, ts: ThreatSource[]): string {
  const parts = ts.map((t) => threatPhrase(s, t));
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

interface SavedRun {
  seed: number;
  actions: string;
  v?: number;
}

export class Game {
  private state!: GameState;
  private run!: SavedRun;
  private scene!: { current: Scene };
  private animator = new Animator({ onPlayerHurt: () => navigator.vibrate?.(60) });
  private ctx: CanvasRenderingContext2D;
  private layout: Layout = { size: 30, ox: 0, oy: 0 };
  private w = 0;
  private h = 0;
  private selected: Hex | null = null;
  private bashSel: Hex | null = null;
  private outcome: Outcome | null = null;
  private inspect: number | null = null;
  /** A hex tapped just to look at it: which enemies threaten it. */
  private probe: Hex | null = null;
  /** A fatal action's button was pressed once; the second press does it. */
  private armed = false;
  private last = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement!);
    this.resize();
    this.bindInput();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------- run lifecycle ----------

  start(seed: number, actions = ''): void {
    let s: GameState;
    try {
      s = replay(seed, actions);
    } catch {
      // Saved run incompatible with the current rules: start it over.
      actions = '';
      s = newRun(seed);
    }
    this.animator.cancel();
    this.run = { seed, actions, v: RULES_VERSION };
    this.state = s;
    this.scene = { current: sceneFromState(s) };
    this.clearSelection();
    this.persist();
    this.refreshUi();
    if (s.status === 'dead') this.showGameOver();
    else this.introduceEnemies();
  }

  newRun(): void {
    closeOverlay();
    this.start(randomSeed());
  }

  private persist(): void {
    save('run', this.state.status === 'playing' ? this.run : null);
    const best = load<number>('best', 0);
    if (this.state.depth > best) save('best', this.state.depth);
  }

  // ---------- input ----------

  private bindInput(): void {
    let down: { x: number; y: number; id: number } | null = null;
    this.canvas.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
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

  private tap(x: number, y: number): void {
    if (this.animator.busy || this.state.status !== 'playing') return;
    const h = pxToHex(this.layout, x, y);
    if (!inBounds(this.state, h)) {
      this.clearSelection();
      this.refreshUi();
      return;
    }
    if (legalMoves(this.state).some((m) => eq(m, h))) {
      if (this.selected && eq(this.selected, h)) {
        // A move that hurts only goes through the red button.
        if (this.outcome && (this.outcome.damageTaken > 0 || this.outcome.dies)) {
          hint(this.outcome.dies ? 'That move kills you: use the red button if you mean it' : 'That move hurts: press the red button if you mean it');
          return;
        }
        this.commit({ type: 'move', to: h });
        return;
      }
      this.clearSelection();
      this.selected = h;
      this.outcome = previewAction(this.state, { type: 'move', to: h });
      navigator.vibrate?.(8);
    } else if (bashTargets(this.state).some((m) => eq(m, h))) {
      // Bash commits only from the panel button, so tapping an enemy to read
      // about it can never shove it by accident.
      this.clearSelection();
      this.bashSel = h;
      this.inspect = enemyAt(this.state, h)?.id ?? null;
      this.outcome = previewAction(this.state, { type: 'bash', target: h });
      navigator.vibrate?.(8);
    } else {
      this.clearSelection();
      const e = enemyAt(this.state, h);
      this.inspect = e ? e.id : null;
      if (!e && playerWalkable(tileAt(this.state, h)) && this.state.enemies.length === 0) {
        // Floor cleared: walk there (around any bomb still ticking).
        this.walkTo = h;
        this.walkStep();
        return;
      }
      // Anything else: look at the hex and who threatens it.
      if (!e && !eq(h, this.state.player.pos)) this.probe = h;
    }
    this.refreshUi();
  }

  /**
   * Auto-walk on a cleared floor: one step toward `walkTo`, then the next
   * after it animates. A bomb that is still lit is walked around: each step
   * is the closest one that takes no damage, and if every step would, the
   * walk stops and says so.
   */
  private walkTo: Hex | null = null;
  private walkStep(): void {
    const s = this.state;
    const goal = this.walkTo;
    if (!goal || s.status !== 'playing' || s.enemies.length > 0 || eq(s.player.pos, goal)) {
      this.walkTo = null;
      this.refreshUi();
      return;
    }
    const field = distanceField(s, goal, playerWalkable);
    const here = field.get(key(s.player.pos));
    const steps = legalMoves(s)
      .filter((m) => field.has(key(m)))
      .map((m) => ({ m, d: field.get(key(m))!, hurt: s.bombs.length ? previewAction(s, { type: 'move', to: m }).damageTaken : 0 }))
      .filter((x) => x.hurt === 0 && (s.bombs.length > 0 || x.d < here!))
      .sort((a, b) => a.d - b.d);
    if (here === undefined || steps.length === 0) {
      this.walkTo = null;
      hint(here === undefined ? "Can't reach that" : 'A bomb is about to go off: step clear of its blast first');
      this.refreshUi();
      return;
    }
    this.commit({ type: 'move', to: steps[0].m });
  }

  private clearSelection(): void {
    this.selected = null;
    this.bashSel = null;
    this.outcome = null;
    this.inspect = null;
    this.probe = null;
    this.armed = false;
  }

  private commit(a: Action): void {
    const prev = this.state;
    const { state, events } = applyAction(prev, a);
    this.run.actions += encodeAction(prev, a);
    this.state = state;
    this.clearSelection();
    this.persist();
    renderPanel('', null);
    const depth = prev.depth;
    this.animator.play(this.scene, events, state, () => {
      if (this.walkTo && state.depth === depth) {
        this.walkStep();
        return;
      }
      this.walkTo = null;
      this.refreshUi();
      if (events.some((e) => e.type === 'descend')) this.introduceEnemies();
      if (state.status === 'dead')
        setTimeout(() => this.state === state && this.showGameOver(), 250);
    });
  }

  // ---------- UI ----------

  private refreshUi(): void {
    const s = this.state;
    renderHud(s);
    if (s.status === 'dead') {
      renderPanel('<span class="title">You fell.</span>', { label: 'New run', onClick: () => this.newRun() });
      return;
    }
    if ((this.selected || this.bashSel) && this.outcome) {
      const o = this.outcome;
      const parts: string[] = [];
      const bashing = this.bashSel !== null;
      const target = bashing ? s.enemies.find((x) => x.id === this.inspect) : undefined;
      if (target) parts.push(`Bash ${ENEMIES[target.kind].name}`);
      if (o.descends) parts.push('<span class="good">Take the stairs</span>');
      if (o.kills.length) parts.push(`<span class="good">Kills ${o.kills.length}</span>`);
      if (o.wounded.length) parts.push(`Wounds ${o.wounded.length}`);
      if (o.hookedTo) parts.push('<span class="bad">Hooked!</span>');
      if (o.dies) parts.push('<span class="bad">You will die</span>');
      else if (o.damageTaken) parts.push(`<span class="bad">You take ${o.damageTaken} damage</span>`);
      else if (!o.descends && o.next.length) parts.push('Safe this turn');
      else if (!o.descends) parts.push('Safe');
      if (o.healed) parts.push('<span class="good">+1 ♥</span>');
      const act: Action | null = this.selected
        ? { type: 'move', to: this.selected }
        : this.bashSel
          ? { type: 'bash', target: this.bashSel }
          : null;
      // Who hurts you (outlined in red on the board), or what aims at you next.
      const hurtBy = o.hurtBy.length ? `Hit by ${threatList(s, o.hurtBy)}. ` : '';
      const then = o.next.length ? `<span class="warn">Then in line for ${threatList(s, o.next)}.</span> ` : '';
      const body = target
        ? `${hurtBy}${then}${ENEMIES[target.kind].name} ${target.hp}/${target.maxHp} HP: ${ENEMIES[target.kind].blurb}`
        : o.dies
          ? `${hurtBy}This move kills you.`
          : o.damageTaken > 0
            ? `${hurtBy}Press the red button if you mean it.`
            : `${then}Tap again or press Move.`;
      const verb = bashing ? 'Bash' : 'Move';
      const hurts = o.damageTaken > 0 || o.dies;
      renderPanel(`<div class="title">${parts.join(' · ')}</div>${body}`, {
        label: o.dies
          ? this.armed
            ? 'Sure? You die'
            : `${verb} — you die`
          : o.damageTaken > 0
            ? `${verb} (−${o.damageTaken} ♥)`
            : verb,
        danger: hurts,
        onClick: () => {
          if (!act) return;
          // A fatal action takes two presses.
          if (o.dies && !this.armed) {
            this.armed = true;
            navigator.vibrate?.(30);
            this.refreshUi();
            return;
          }
          this.commit(act);
        },
      });
      return;
    }
    if (this.probe) {
      const h = this.probe;
      const ts = threatsAt(threats(s), h);
      const stairs = eq(h, s.stairs);
      const title = ts.length
        ? `<span class="bad">Threatened</span> by ${threatList(s, ts)}`
        : stairs
          ? 'The stairs'
          : 'No threat here this turn';
      const left = s.enemies.length;
      const body = stairs
        ? `${left} enem${left === 1 ? 'y' : 'ies'} left: clear the floor first to <span class="good">heal 1 ♥</span>. You move one hex per turn.`
        : 'You move one hex per turn: tap a hex next to you.';
      renderPanel(`<div class="title">${title}</div>${body}`, null);
      return;
    }
    if (this.inspect !== null) {
      const e = s.enemies.find((x) => x.id === this.inspect);
      if (e) {
        const def = ENEMIES[e.kind];
        const adjacent = isAdjacent(e.pos, s.player.pos);
        const bashNote =
          adjacent && s.player.bashCd > 0 ? `<br><b>Bash ready in ${s.player.bashCd}.</b>` : '';
        renderPanel(
          `<div class="title">${def.name} · ${e.hp}/${e.maxHp} HP${statusOf(e)}</div>${def.blurb}${bashNote}`,
          null,
        );
        return;
      }
    }
    if (legalMoves(s).length === 0 && bashTargets(s).length === 0) {
      renderPanel('<div class="title">Boxed in.</div>No moves available.', {
        label: 'Wait',
        onClick: () => this.commit({ type: 'wait' }),
      });
      return;
    }
    const hint =
      s.depth === 1 && s.turn < 3
        ? 'Tap a hex next to you to preview a move. Tap an enemy to learn what it does. Tap an adjacent enemy to Bash it.'
        : 'Reach the stairs. Red = danger.';
    renderPanel(`<div class="title">Depth ${s.depth}</div>${hint}`, null);
  }

  /** First time an enemy kind shows up, explain it. */
  private introduceEnemies(): void {
    const seen = new Set(load<string[]>('seenKinds', ['brute']));
    const fresh = [...new Set(this.state.enemies.map((e) => e.kind))].filter((k) => !seen.has(k));
    if (fresh.length === 0) return;
    fresh.forEach((k) => seen.add(k));
    save('seenKinds', [...seen]);
    showCard(enemyIntroHtml(fresh), [{ label: 'Got it', primary: true, onClick: closeOverlay }]);
  }

  showHelp(): void {
    showCard(HELP_HTML, [{ label: 'Got it', primary: true, onClick: closeOverlay }]);
    save('seenHelp', true);
  }

  showMenu(): void {
    const best = load<number>('best', 0);
    showCard(
      `<h2>Telegraph</h2><p>Depth ${this.state.depth} · Best ${best} · Seed ${this.run.seed}</p>`,
      [
        { label: 'Resume', primary: true, onClick: closeOverlay },
        { label: 'How to play', onClick: () => this.showHelp() },
        { label: 'Copy bug report', onClick: () => this.copyReport() },
        { label: 'All games', onClick: () => (location.href = '../') },
        {
          label: 'Abandon run & start new',
          onClick: () =>
            showCard(`<h2>Abandon this run?</h2><p>You're on depth ${this.state.depth}. The run will be lost.</p>`, [
              { label: 'Keep playing', primary: true, onClick: closeOverlay },
              { label: 'Abandon it', onClick: () => this.newRun() },
            ]),
        },
      ],
    );
  }

  private showGameOver(): void {
    const best = load<number>('best', 0);
    showCard(
      `<h2>You fell on depth ${this.state.depth}</h2><p>${this.state.kills} kills · ${this.state.turn} turns · Best depth ${best}</p>`,
      [
        { label: 'New run', primary: true, onClick: () => this.newRun() },
        { label: 'Copy bug report', onClick: () => this.copyReport() },
        { label: 'All games', onClick: () => (location.href = '../') },
      ],
      false,
    );
  }

  private async copyReport(): Promise<void> {
    const ok = await copyText(bugReport(this.run.seed, this.run.actions, this.state.depth));
    toast(ok ? 'Bug report copied — paste it in chat' : 'Copy failed');
  }

  // ---------- rendering ----------

  /** Enemies to ring in red: who hurts the previewed action, or threatens the looked-at hex. */
  private marked(): number[] {
    if (this.outcome) return this.outcome.hurtBy.map((t) => t.by);
    if (this.probe) return threatsAt(threats(this.state), this.probe).map((t) => t.by);
    return [];
  }

  private resize(): void {
    const parent = this.canvas.parentElement!;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.w = parent.clientWidth;
    this.h = parent.clientHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.layout = fitBoard(this.w, this.h, 7, 9);
  }

  private frame(t: number): void {
    // Schedule first so one bad frame can never stop the loop.
    requestAnimationFrame((tt) => this.frame(tt));
    const dt = Math.min(50, t - (this.last || t));
    this.last = t;
    if (!this.scene || this.w < 1 || this.h < 1) return;
    try {
      this.renderFrame(t, dt);
    } catch (err) {
      // Surface the error on screen and unstick the turn rather than freezing.
      this.animator.cancel();
      this.scene = { current: sceneFromState(this.state) };
      this.refreshUi();
      setTimeout(() => {
        throw err;
      });
    }
  }

  private renderFrame(t: number, dt: number): void {
    this.animator.update(dt);
    const sc = this.scene.current;
    sc.shake *= Math.pow(0.001, dt / 1000);
    sc.hurt = Math.max(0, sc.hurt - dt / 500);
    for (const u of sc.units.values()) u.flash = Math.max(0, u.flash - dt / 180);
    for (const f of sc.floaters) f.age += dt;
    sc.floaters = sc.floaters.filter((f) => f.age < f.life);
    const idle = !this.animator.busy && this.state.status === 'playing';
    draw(
      this.ctx,
      this.w,
      this.h,
      this.layout,
      sc,
      {
        legal: idle ? legalMoves(this.state) : [],
        selected: idle ? this.selected : null,
        outcome: idle ? this.outcome : null,
        threats: idle ? threats(this.state) : null,
        inspect: idle ? this.inspect : null,
        bashTargets: idle ? bashTargets(this.state) : [],
        bashSelected: idle ? this.bashSel : null,
        probe: idle ? this.probe : null,
        marked: idle ? this.marked() : [],
        warned: idle && this.outcome ? this.outcome.next.map((t) => t.by) : [],
      },
      t,
    );
  }
}
