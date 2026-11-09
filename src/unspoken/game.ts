// Unspoken controller: owns the run (seed + actions) and builds the page:
// chapters of illustrated panels, the glyph sheet (contexts + meaning
// picker), challenges, the notebook and the ending. Rules live in core/.

import { Sfx } from '../afterglow/audio';
import { closeOverlay, showCard } from '../shared/cards';
import { dailySeed, leaveDaily, loadDaily, prettyDay, recordDaily, todayKey } from '../shared/daily';
import { copyText, toast } from '../shared/debug';
import { makeStore } from '../shared/storage';
import {
  CONCEPT,
  CONCEPTS,
  RULES_VERSION,
  apply,
  contexts,
  encode,
  english,
  grammarNotes,
  morphemes,
  newGame,
  progress,
  realize,
  replay,
  writtenGrammar,
  type Action,
  type Category,
  type Challenge,
  type Frame,
  type Panel,
  type Result,
  type State,
  type Token,
} from './core';
import { glyphCanvas, tokenCanvas } from './render/glyphs';
import { drawScene } from './render/scene';

export const store = makeStore('unspoken.');
const $ = (id: string) => document.getElementById(id)!;

/** Short labels for guesses under glyphs. */
const SHORT: Record<string, string> = {
  ama: 'red woman',
  tor: 'cap boy',
  sef: 'fisher',
  PL: 'many',
  NEG: 'not',
  PAST: 'before',
  FUT: 'later',
  Q: 'what?',
  TO: 'to',
};
const short = (id: string) => SHORT[id] ?? CONCEPT.get(id)!.en;

const TABS: { label: string; cats: Category[] }[] = [
  { label: 'People', cats: ['name', 'person'] },
  { label: 'Animals', cats: ['animal'] },
  { label: 'Things', cats: ['thing'] },
  { label: 'Nature', cats: ['nature'] },
  { label: 'Places', cats: ['place'] },
  { label: 'Actions', cats: ['action'] },
  { label: 'Qualities', cats: ['quality'] },
  { label: 'Grammar', cats: ['grammar'] },
];

interface Profile {
  finished: number;
  best: number;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export class Game {
  s!: State;
  seed = 0;
  actions: string[] = [];
  daily: string | null = null;
  replayOnly = false;
  view = 0;
  sfx = new Sfx();
  private sceneCache = new Map<string, HTMLCanvasElement>();
  private cacheWidth = 0;
  private compose = new Map<string, number[]>();
  private composeMarks = new Map<string, boolean[] | null>();
  private pickWrong = new Map<string, Set<number>>();
  private tab = 0;
  private freshChapter = -1;
  /** Chapter whose scenes are cached (only one at a time, to spare phone memory). */
  private cachedView = -1;

  constructor() {
    this.sfx.setMuted(store.load('muted', false));
    addEventListener('pointerdown', () => this.sfx.unlock(), { capture: true });
    $('notebookBtn').onclick = () => this.showNotebook();
    $('sheet').onclick = (e) => {
      if (e.target === $('sheet')) this.closeSheet();
    };
    new ResizeObserver(() => {
      const w = this.sceneWidth();
      if (Math.abs(w - this.cacheWidth) > 4) this.render();
    }).observe($('main'));
  }

  // ---------------------------------------------------------------- run

  start(seed: number, actions = '', fromLink = false, daily: string | null = null): void {
    this.seed = seed;
    this.daily = daily;
    this.replayOnly = fromLink;
    try {
      this.s = replay(seed, actions);
      this.actions = actions ? actions.split(',') : [];
    } catch (e) {
      if (fromLink) toast(`Replay failed: ${(e as Error).message}`);
      this.s = newGame(seed);
      this.actions = [];
    }
    this.sceneCache.clear();
    this.compose.clear();
    this.composeMarks.clear();
    this.pickWrong.clear();
    this.view = this.s.chapter;
    this.render();
    $('main').scrollTop = 0;
    if (this.s.over) setTimeout(() => this.showEnding(), 300);
  }

  private persist(): void {
    if (this.replayOnly) return;
    const run = this.s.over ? null : { v: RULES_VERSION, seed: this.seed, a: this.actions.join(','), day: this.daily };
    store.save(this.daily ? 'dailyRun' : 'run', run);
  }

  private act(a: Action): Result | null {
    const r = apply(this.s, a);
    if (!r) return null;
    this.actions.push(encode(a));
    this.persist();
    return r;
  }

  newLanguage(): void {
    closeOverlay();
    leaveDaily();
    this.start((Math.random() * 0xffffffff) >>> 0);
    this.persist();
  }

  playDaily(fresh = false): void {
    closeOverlay();
    const day = todayKey();
    const saved = store.load<{ v: number; seed: number; a: string; day: string } | null>('dailyRun', null);
    if (!fresh && saved && saved.v === RULES_VERSION && saved.day === day) this.start(saved.seed, saved.a, false, day);
    else this.start(dailySeed('unspoken', day), '', false, day);
    if (this.actions.length === 0) toast(`Today's language · ${prettyDay(day)}`);
  }

  resumeOwn(): void {
    closeOverlay();
    leaveDaily();
    const saved = store.load<{ v: number; seed: number; a: string } | null>('run', null);
    if (saved && saved.v === RULES_VERSION) this.start(saved.seed, saved.a);
    else this.start((Math.random() * 0xffffffff) >>> 0);
  }

  // ---------------------------------------------------------------- scenes

  private sceneWidth(): number {
    return Math.max(200, Math.min(560, $('main').clientWidth - 24 - 22));
  }

  private scene(key: string, frame: Frame, w: number, h: number, backdrop: State['world']['chapters'][number]['backdrop']): HTMLCanvasElement {
    const k = `${key}@${Math.round(w)}x${Math.round(h)}`;
    let c = this.sceneCache.get(k);
    if (!c) {
      c = document.createElement('canvas');
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      const g = c.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      try {
        drawScene(g, frame, w, h, { backdrop, seed: this.seed ^ hash(key), t: 0 });
      } catch (e) {
        console.error(e);
      }
      this.sceneCache.set(k, c);
    }
    return c;
  }

  // ---------------------------------------------------------------- tokens

  private status(m: string): 'known' | 'guessed' | 'doubt' | '' {
    if (this.s.confirmed.includes(m)) return 'known';
    if (this.s.notebook[m]) return 'guessed';
    if (this.s.doubted.includes(m)) return 'doubt';
    return '';
  }

  /** A tappable written word with your reading underneath. */
  private tokenButton(t: Token, size = 46, onTap?: () => void, label = true): HTMLButtonElement {
    const b = el('button', 'tok');
    b.appendChild(tokenCanvas(this.s.lang, t, size));
    const parts = [t.m, ...t.marks];
    const st = parts.map((m) => this.status(m));
    if (st.every((x) => x === 'known')) b.classList.add('known');
    else if (st.some((x) => x === 'doubt')) b.classList.add('doubt');
    else if (st.some((x) => x === 'guessed' || x === 'known')) b.classList.add('guessed');
    if (label) {
      const read = parts.map((m) => (this.s.notebook[m] ? short(this.s.notebook[m]) : this.status(m) === 'doubt' ? '✗' : '?'));
      b.appendChild(el('span', 'gl', read.join(' · ')));
    }
    b.onclick = onTap ?? (() => this.openSheet(t.m, t));
    return b;
  }

  private caption(tokens: Token[], size = 46): HTMLElement {
    const row = el('div', 'caption');
    for (const t of tokens) row.appendChild(this.tokenButton(t, size));
    return row;
  }

  // ---------------------------------------------------------------- page

  render(): void {
    const s = this.s;
    const p = progress(s);
    $('langName').textContent = s.lang.name + (this.daily ? ' · daily' : '');
    $('words').textContent = `${p.confirmed}/${p.total}`;
    const nav = $('chapters');
    nav.innerHTML = '';
    s.world.chapters.forEach((ch, i) => {
      const b = el('button');
      b.textContent = String(i + 1);
      b.disabled = i > s.chapter;
      if (i === this.view) b.classList.add('on');
      if (ch.challenges.every((c) => s.solved.includes(c.id))) b.classList.add('done');
      if (i === this.freshChapter) b.classList.add('new');
      b.onclick = () => {
        this.view = i;
        this.freshChapter = -1;
        this.render();
        $('main').scrollTop = 0;
      };
      nav.appendChild(b);
    });

    const main = $('main');
    const keep = main.scrollTop;
    main.innerHTML = '';
    const w = this.sceneWidth();
    if (Math.abs(w - this.cacheWidth) > 4 || this.cachedView !== this.view) {
      this.sceneCache.clear();
      this.cacheWidth = w;
      this.cachedView = this.view;
    }
    const ch = s.world.chapters[this.view];
    main.appendChild(el('h1', 'chapter-title', ch.title));
    main.appendChild(el('p', 'journal', ch.intro));
    for (const panel of ch.panels) main.appendChild(this.panelCard(panel, w, ch.backdrop));
    ch.challenges.forEach((c, i) => main.appendChild(this.challengeCard(c, i, w, ch.backdrop)));
    const done = ch.challenges.every((c) => s.solved.includes(c.id));
    if (done && this.view < s.world.chapters.length - 1) {
      const next = el('div', 'pcard next-card');
      const b = el('button', 'primary');
      b.textContent = `On to ${s.world.chapters[this.view + 1].title} →`;
      b.onclick = () => {
        this.view++;
        this.freshChapter = -1;
        this.render();
        $('main').scrollTop = 0;
      };
      next.appendChild(b);
      main.appendChild(next);
    } else if (done && s.over) {
      const next = el('div', 'pcard next-card');
      const b = el('button', 'primary');
      b.textContent = 'What you understood';
      b.onclick = () => this.showEnding();
      next.appendChild(b);
      main.appendChild(next);
    } else if (!done) {
      main.appendChild(el('p', 'locked-note', 'Solve the riddles above to go on.'));
    }
    main.scrollTop = keep;
  }

  private panelCard(p: Panel, w: number, backdrop: State['world']['chapters'][number]['backdrop']): HTMLElement {
    const card = el('div', 'pcard');
    card.id = p.id;
    const understood = this.s.understood.includes(p.id);
    if (understood) {
      card.classList.add('understood');
      card.appendChild(el('span', 'badge', '✓ understood'));
    }
    const sc = this.scene(p.id, p.frame, w, Math.round(w * 0.62), backdrop);
    sc.className = 'scene';
    card.appendChild(sc);
    card.appendChild(this.caption(p.tokens));
    return card;
  }

  private challengeCard(c: Challenge, i: number, w: number, backdrop: State['world']['chapters'][number]['backdrop']): HTMLElement {
    const s = this.s;
    const card = el('div', 'pcard challenge');
    const solved = s.solved.includes(c.id);
    if (solved) card.classList.add('solved');
    const title = c.question ? 'The elder asks you' : c.kind === 'pick' ? 'Riddle: which scene is this?' : 'Riddle: write what you see';
    card.appendChild(el('h3', '', `${title}<span>${solved ? '✓ solved' : `${i + 1}/${s.world.chapters[c.ch].challenges.length}`}</span>`));

    if (c.kind === 'pick') {
      card.appendChild(this.caption(c.tokens));
      const picks = el('div', 'picks');
      const tw = Math.floor((w - 16) / 3);
      const th = Math.round(tw * 0.72);
      const wrong = this.pickWrong.get(c.id) ?? new Set<number>();
      c.options.forEach((f, k) => {
        const b = el('button');
        b.appendChild(this.scene(`${c.id}.o${k}`, f, tw, th, backdrop));
        if (wrong.has(k)) b.classList.add('wrong');
        if (solved && k === c.answer) b.classList.add('right');
        b.disabled = solved || wrong.has(k);
        b.onclick = () => this.answerPick(c, k, b);
        picks.appendChild(b);
      });
      card.appendChild(picks);
      return card;
    }

    // Compose (and the elder's question).
    if (c.question) {
      const q = el('div', 'speech');
      q.appendChild(el('b', '', 'Elder:'));
      const cap = this.caption(c.question, 40);
      cap.style.margin = '0';
      q.appendChild(cap);
      card.appendChild(q);
      card.appendChild(el('p', 'hint', 'Answer with what the murals told you.'));
    } else {
      const sc = this.scene(c.id, c.frame, w, Math.round(w * 0.62), backdrop);
      sc.className = 'scene';
      card.appendChild(sc);
    }
    if (solved) {
      card.appendChild(this.caption(c.tokens));
      return card;
    }
    const chosen = this.compose.get(c.id) ?? [];
    const marks = this.composeMarks.get(c.id) ?? null;
    const slots = el('div', 'slots');
    chosen.forEach((ti, pos) => {
      const b = this.tokenButton(c.tiles[ti], 42, () => {
        chosen.splice(pos, 1);
        this.compose.set(c.id, chosen);
        this.composeMarks.set(c.id, null);
        this.sfx.click();
        this.render();
      });
      if (marks) b.classList.add(marks[pos] ? 'ok' : 'no');
      slots.appendChild(b);
    });
    card.appendChild(slots);
    const tiles = el('div', 'tiles');
    c.tiles.forEach((t, ti) => {
      const b = this.tokenButton(t, 42, () => {
        if (chosen.includes(ti)) return;
        chosen.push(ti);
        this.compose.set(c.id, chosen);
        this.composeMarks.set(c.id, null);
        this.sfx.click();
        this.render();
      });
      if (chosen.includes(ti)) b.classList.add('used');
      tiles.appendChild(b);
    });
    card.appendChild(tiles);
    const row = el('div', 'row-btns');
    const clear = el('button', 'secondary');
    clear.textContent = 'Clear';
    clear.onclick = () => {
      this.compose.set(c.id, []);
      this.composeMarks.set(c.id, null);
      this.render();
    };
    const go = el('button', 'primary');
    go.textContent = c.question ? 'Answer' : 'Write it';
    go.disabled = chosen.length === 0;
    go.onclick = () => this.answerCompose(c, card);
    row.append(clear, go);
    card.appendChild(row);
    return card;
  }

  // ---------------------------------------------------------------- answers

  private answerPick(c: Challenge, k: number, btn: HTMLElement): void {
    const r = this.act({ t: 'answer', challenge: c.id, pick: k });
    if (!r) return;
    if (!r.ok) {
      const set = this.pickWrong.get(c.id) ?? new Set<number>();
      set.add(k);
      this.pickWrong.set(c.id, set);
      this.sfx.hurt();
      btn.classList.add('shake');
      setTimeout(() => this.render(), 350);
      return;
    }
    this.solvedFeedback(r);
  }

  private answerCompose(c: Challenge, card: HTMLElement): void {
    const tiles = this.compose.get(c.id) ?? [];
    const r = this.act({ t: 'answer', challenge: c.id, tiles });
    if (!r) return;
    if (!r.ok) {
      this.composeMarks.set(c.id, r.right ?? null);
      this.sfx.hurt();
      card.classList.add('shake');
      setTimeout(() => this.render(), 350);
      toast(tiles.length !== c.tokens.length ? 'Not quite. Something is missing or extra.' : 'Not quite. Green ones are in the right place.');
      return;
    }
    this.solvedFeedback(r);
  }

  private solvedFeedback(r: Result): void {
    this.sfx.levelUp();
    const bits: string[] = [];
    if (r.confirmed.length) bits.push(`${r.confirmed.length} reading${r.confirmed.length > 1 ? 's' : ''} proven`);
    if (r.doubted.length) bits.push(`${r.doubted.length} guess${r.doubted.length > 1 ? 'es were' : ' was'} wrong (cleared)`);
    toast(bits.length ? `Solved! ${bits.join(', ')}.` : 'Solved!');
    if (r.opened !== undefined) {
      this.freshChapter = r.opened;
      setTimeout(() => toast(`A new place opens: ${this.s.world.chapters[r.opened!].title}`), 1600);
      this.sfx.evolve();
    }
    this.render();
    if (r.over) {
      this.recordEnd();
      setTimeout(() => this.showEnding(), 900);
    }
  }

  // ---------------------------------------------------------------- glyph sheet

  openSheet(id: string, token?: Token): void {
    const s = this.s;
    const lang = s.lang;
    const sheet = $('sheet');
    sheet.innerHTML = '';
    const inner = el('div', 'inner');
    const top = el('div', 'top');
    top.appendChild(glyphCanvas(lang, id, 84));
    const info = el('div');
    const st = this.status(id);
    info.appendChild(el('div', 'say', `“${lang.words[id]}”${lang.glyphs[id].mark ? ` · a mark ${lang.glyphs[id].mark} a word` : ''}`));
    const statusText =
      st === 'known'
        ? `✓ ${short(s.notebook[id])}: proven`
        : st === 'guessed'
          ? `Your guess: ${short(s.notebook[id])}`
          : st === 'doubt'
            ? '✗ A solved riddle showed your guess was wrong'
            : 'Not read yet';
    info.appendChild(el('div', `status ${st}`, statusText));
    top.appendChild(info);
    inner.appendChild(top);

    // Marks on this word can be read separately.
    const others = token ? [token.m, ...token.marks].filter((m) => m !== id) : [];
    if (others.length) {
      const row = el('div', 'marks', token && token.m === id ? 'Also on this word:' : 'This mark sits on:');
      for (const m of others) {
        const b = el('button');
        b.appendChild(glyphCanvas(lang, m, 32));
        b.appendChild(document.createTextNode(s.notebook[m] ? short(s.notebook[m]) : '?'));
        b.onclick = () => this.openSheet(m, token);
        row.appendChild(b);
      }
      inner.appendChild(row);
    }

    // Where it appears.
    const ctxs = contexts(s.world, s.chapter).get(id) ?? [];
    if (ctxs.length) {
      inner.appendChild(el('h4', '', `Seen in ${ctxs.length} scene${ctxs.length > 1 ? 's' : ''}`));
      const box = el('div', 'ctx');
      for (const p of ctxs.slice(0, 8)) {
        const row = el('div', 'row');
        const th = this.scene(p.id, p.frame, 96, 60, s.world.chapters[p.ch].backdrop).cloneNode(true) as HTMLCanvasElement;
        th.getContext('2d')!.drawImage(this.scene(p.id, p.frame, 96, 60, s.world.chapters[p.ch].backdrop), 0, 0);
        th.className = 'thumb';
        row.appendChild(th);
        const cap = el('div', 'caption');
        for (const t of p.tokens) {
          const b = this.tokenButton(t, 30, () => this.openSheet(t.m, t), false);
          if (t.m === id || t.marks.includes(id)) b.classList.add('hl');
          cap.appendChild(b);
        }
        row.appendChild(cap);
        box.appendChild(row);
      }
      inner.appendChild(box);
    }

    if (st !== 'known') {
      inner.appendChild(el('h4', '', 'What do you think it means?'));
      const guess = s.notebook[id];
      if (guess) this.tab = Math.max(0, TABS.findIndex((t) => t.cats.includes(CONCEPT.get(guess)!.cat)));
      const tabs = el('div', 'tabs');
      const chips = el('div', 'chips');
      const taken = new Set(Object.entries(s.notebook).filter(([g]) => g !== id).map(([, m]) => m));
      const showTab = () => {
        tabs.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === this.tab));
        chips.innerHTML = '';
        for (const c of CONCEPTS.filter((x) => TABS[this.tab].cats.includes(x.cat))) {
          if (c.cat === 'grammar' && !writtenGrammar(lang).includes(c.id)) continue;
          const b = el('button');
          b.textContent = c.cat === 'name' || c.cat === 'grammar' ? short(c.id) : c.en;
          if (guess === c.id) b.classList.add('on');
          if (taken.has(c.id)) b.classList.add('taken');
          b.onclick = () => this.guess(id, guess === c.id ? null : c.id);
          chips.appendChild(b);
        }
      };
      TABS.forEach((t, i) => {
        const b = el('button');
        b.textContent = t.label;
        b.onclick = () => {
          this.tab = i;
          showTab();
        };
        tabs.appendChild(b);
      });
      inner.appendChild(tabs);
      inner.appendChild(chips);
      showTab();
      if (guess) {
        const clr = el('button', 'secondary');
        clr.textContent = 'Clear my guess';
        clr.onclick = () => this.guess(id, null);
        inner.appendChild(clr);
      }
    }
    const close = el('button', 'secondary');
    close.textContent = 'Close';
    close.onclick = () => this.closeSheet();
    inner.appendChild(close);
    sheet.appendChild(inner);
    sheet.hidden = false;
  }

  closeSheet(): void {
    $('sheet').hidden = true;
    $('sheet').innerHTML = '';
  }

  private guess(id: string, meaning: string | null): void {
    const r = this.act({ t: 'guess', glyph: id, meaning });
    this.closeSheet();
    if (!r) return;
    this.sfx.pickup();
    if (r.understood.length) {
      this.sfx.levelUp();
      toast(r.understood.length > 1 ? `${r.understood.length} scenes come clear!` : 'A scene comes clear!');
    }
    this.render();
  }

  // ---------------------------------------------------------------- notebook, menu, ending

  showNotebook(): void {
    const s = this.s;
    const seen = new Set<string>();
    for (const ch of s.world.chapters.slice(0, s.chapter + 1)) for (const p of ch.panels) for (const m of morphemes(p.tokens)) seen.add(m);
    showCard(`<h2>Notebook</h2><p>${seen.size} glyphs seen · ${s.confirmed.length} proven. Tap one to revise it.</p><div class="nb-grid" id="nbGrid"></div>`, [
      { label: 'Close', primary: true, onClick: closeOverlay },
    ]);
    const grid = $('nbGrid');
    for (const m of [...seen].sort((a, b) => CONCEPTS.findIndex((c) => c.id === a) - CONCEPTS.findIndex((c) => c.id === b))) {
      const isMark = !!s.lang.glyphs[m].mark;
      const t: Token = { m: isMark ? m : m, marks: [] };
      const b = isMark ? this.markButton(m) : this.tokenButton(t, 44, () => (closeOverlay(), this.openSheet(m)));
      grid.appendChild(b);
    }
  }

  private markButton(m: string): HTMLButtonElement {
    const b = el('button', 'tok');
    b.appendChild(glyphCanvas(this.s.lang, m, 44));
    const st = this.status(m);
    if (st) b.classList.add(st === 'known' ? 'known' : st === 'doubt' ? 'doubt' : 'guessed');
    b.appendChild(el('span', 'gl', this.s.notebook[m] ? short(this.s.notebook[m]) : '?'));
    b.onclick = () => (closeOverlay(), this.openSheet(m));
    return b;
  }

  showMenu(): void {
    const muted = this.sfx.muted;
    showCard(`<h2>Unspoken</h2><p>The language of this village: <b>${this.s.lang.name}</b>${this.daily ? ` · today's language` : ''}.</p>`, [
      { label: 'Resume', primary: true, onClick: closeOverlay },
      { label: 'How to play', onClick: () => this.showHelp() },
      { label: 'Notebook', onClick: () => this.showNotebook() },
      this.daily ? { label: 'Back to my language', onClick: () => this.resumeOwn() } : { label: `Today's language · ${loadDaily(store)?.label ?? 'not played'}`, onClick: () => this.playDaily() },
      {
        label: muted ? 'Sound: off' : 'Sound: on',
        onClick: () => {
          this.sfx.setMuted(!muted);
          store.save('muted', !muted);
          this.showMenu();
        },
      },
      { label: 'Copy bug report', onClick: () => this.copyReport() },
      {
        label: 'A new language',
        onClick: () =>
          showCard('<h2>Leave this village?</h2><p>You will start over with a language no one has seen.</p>', [
            { label: 'New language', primary: true, onClick: () => this.newLanguage() },
            { label: 'Cancel', onClick: () => this.showMenu() },
          ]),
      },
      { label: 'Back to Game Lab', onClick: () => (location.href = '../') },
    ]);
  }

  showHelp(): void {
    store.save('seenHelp', true);
    showCard(
      `<h2>Unspoken</h2>
      <p>You are a traveler in a village whose language no one has ever written down for you. Every visit, it is a new language.</p>
      <ul>
        <li>Each painted <b>scene</b> has a sign beneath it. The sign says what the scene shows.</li>
        <li><b>Tap a glyph</b> to see every scene it appears in, and write down what you think it means.</li>
        <li>When every glyph under a scene is read right, the scene <b>comes clear</b> and those readings are proven.</li>
        <li>Little <b>marks</b> above or below a glyph change its meaning. Watch what changes in the pictures.</li>
        <li><b>Riddles</b> close each place: pick the scene a sign describes, or write a scene yourself. Solving one proves your right guesses and clears your wrong ones.</li>
        <li>Notice the order of words. Notice what repeats. Nobody will tell you.</li>
      </ul>`,
      [{ label: 'Begin', primary: true, onClick: closeOverlay }],
    );
  }

  private recordEnd(): void {
    if (this.replayOnly) return;
    const p = progress(this.s);
    const pct = Math.round((100 * p.confirmed) / p.total);
    const prof = store.load<Profile>('profile', { finished: 0, best: 0 });
    prof.finished++;
    prof.best = Math.max(prof.best, pct);
    store.save('profile', prof);
    if (this.daily) recordDaily(store, pct * 100 - this.s.mistakes, `${pct}% · ${this.s.mistakes} slip${this.s.mistakes === 1 ? '' : 's'}`, this.daily);
    this.persist();
  }

  showEnding(): void {
    const s = this.s;
    const p = progress(s);
    const pct = Math.round((100 * p.confirmed) / p.total);
    this.sfx.victory();
    const gloss = (id: string) => (s.notebook[id] ? short(s.notebook[id]) : '⟨?⟩');
    showCard(
      `<div class="ending"><h2>What you understood</h2>
      <p>You proved <b>${p.confirmed}</b> of the ${p.total} glyphs of ${s.lang.name} (${pct}%), with ${s.mistakes} slip${s.mistakes === 1 ? '' : 's'} along the way.</p>
      <h3>The village's story, as you read it</h3><div id="story"></div>
      <h3>How ${s.lang.name} works</h3><ul class="notes">${grammarNotes(s.lang).map((n) => `<li>${n}</li>`).join('')}</ul></div>`,
      [
        { label: 'A new language', primary: true, onClick: () => this.newLanguage() },
        { label: 'Stay in the village', onClick: closeOverlay },
        { label: 'Back to Game Lab', onClick: () => (location.href = '../') },
      ],
    );
    const box = $('story');
    for (const f of s.world.story) {
      const line = el('div', 'line');
      const cap = el('div', 'caption');
      for (const t of realize(s.lang, f)) cap.appendChild(this.tokenButton(t, 30, () => {}, false));
      line.appendChild(cap);
      line.appendChild(el('p', '', english(f, gloss).replace(/⟨\?⟩/g, '<i>?</i>')));
      box.appendChild(line);
    }
  }

  async copyReport(): Promise<void> {
    const a = this.actions.join(',');
    const url = `${location.origin}${location.pathname}?seed=${this.seed}&a=${a || '-'}`;
    toast((await copyText(`UNSPOKEN v${RULES_VERSION} seed=${this.seed} a=${a}\n${url}`)) ? 'Bug report copied' : 'Copy failed');
  }
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
