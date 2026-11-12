// Last Light controller: the story log, the choice buttons, saving, endings.
// It drives whichever night is chosen (core/nights.ts); each night saves apart.

import { closeOverlay, showCard } from '../shared/cards';
import { copyText, toast } from '../shared/debug';
import { makeStore } from '../shared/storage';
import { NIGHTS } from './core/nights';
import type { State as N2State } from './core/night2';
import type { State as N1State } from './core/story';
import type { Choice, Story, StoryState } from './core/types';
import { drawFog, drawSky } from './sky';

export const store = makeStore('lastlight.');
const $ = (id: string) => document.getElementById(id)!;

interface NightProfile {
  plays: number;
  best: number;
  endings: string[];
}
/** Night 1 keeps the top-level fields (older saves); later nights live under n2, n3, … */
type Profile = NightProfile & Record<`n${number}`, NightProfile | undefined>;

const emptyNight = (): NightProfile => ({ plays: 0, best: 0, endings: [] });
const loadProfile = () => store.load<Profile>('profile', emptyNight() as Profile);
export function nightProfile(p: Profile, night: number): NightProfile {
  return night === 1 ? p : (p[`n${night}`] ?? emptyNight());
}

export const storyFor = (night: number): Story => NIGHTS[Math.max(0, Math.min(NIGHTS.length - 1, night - 1))];

export class Game {
  story: Story = NIGHTS[0];
  s: StoryState = this.story.newGame();
  ids: string[] = [];
  private open: string | null = null;
  private sky = $('sky') as HTMLCanvasElement;
  private time = 0;
  private last = 0;

  constructor() {
    new ResizeObserver(() => this.sizeSky()).observe(this.sky);
    requestAnimationFrame((t) => this.frame(t));
  }

  /** Starts the night fresh, or replays saved actions (rebuilding the story text). */
  start(ids: string[] = [], night = this.story.night): void {
    this.story = storyFor(night);
    store.save('night', this.story.night);
    document.body.dataset.night = String(this.story.night);
    this.s = this.story.newGame();
    this.ids = [];
    this.open = null;
    $('story').innerHTML = '';
    this.para(this.story.intro, 'intro', `Night ${this.story.night} · ${this.story.name}`);
    this.para(this.story.describe(this.s), 'room', this.story.roomName(this.s));
    for (const id of ids) {
      const out = this.story.act(this.s, id);
      if (!out) break;
      this.ids.push(id);
      this.para(out, id.startsWith('go:') ? 'room' : '', id.startsWith('go:') ? this.story.roomName(this.s) : undefined);
    }
    this.markOld();
    this.render(true);
    this.save();
    if (this.s.over) setTimeout(() => this.showEnd(), 400);
  }

  /** Switches to another night, resuming its saved run. */
  playNight(night: number): void {
    closeOverlay();
    const story = storyFor(night);
    const saved = store.load<{ v: number; a: string } | null>(story.saveKey, null);
    this.start(saved && saved.v === story.RULES_VERSION ? saved.a.split(',').filter(Boolean) : [], night);
  }

  private save(): void {
    store.save(this.story.saveKey, { v: this.story.RULES_VERSION, a: this.ids.join(',') });
  }

  private para(lines: string[], cls = '', heading?: string): void {
    const box = document.createElement('div');
    box.className = `beat new ${cls}`;
    if (heading) {
      const h = document.createElement('h3');
      h.textContent = heading;
      box.appendChild(h);
    }
    for (const l of lines) {
      const p = document.createElement('p');
      p.textContent = l;
      box.appendChild(p);
    }
    $('story').appendChild(box);
  }

  private markOld(): void {
    document.querySelectorAll('#story .beat.new').forEach((b, k, all) => {
      if (k < all.length - 1) b.classList.remove('new');
    });
  }

  private do(id: string): void {
    const out = this.story.act(this.s, id);
    if (!out) return;
    this.ids.push(id);
    this.open = null;
    document.querySelectorAll('#story .beat.new').forEach((b) => b.classList.remove('new'));
    this.render(false);
    this.para(out, id.startsWith('go:') ? 'room' : '', id.startsWith('go:') ? this.story.roomName(this.s) : undefined);
    this.save();
    navigator.vibrate?.(6);
    const story = $('story');
    requestAnimationFrame(() => {
      // Show the whole new beat: scroll to the bottom, unless it's taller than the view.
      const last = story.lastElementChild as HTMLElement | null;
      if (!last) return;
      const top = last.offsetTop - story.offsetTop - 8;
      const bottom = story.scrollHeight - story.clientHeight;
      story.scrollTo({ top: last.offsetHeight + 16 > story.clientHeight ? top : bottom, behavior: 'smooth' });
    });
    if (this.s.over) {
      this.render(false);
      this.recordEnd();
      setTimeout(() => this.showEnd(), 900);
    }
  }

  // ---------------------------------------------------------------- the choice area

  render(scroll: boolean): void {
    const s = this.s;
    const st = this.story;
    $('clock').textContent = st.clock(s);
    $('clock').classList.toggle('late', st.late(s));
    $('placeName').textContent = st.roomName(s);
    const box = $('acts');
    box.innerHTML = '';
    if (s.over) {
      box.innerHTML = '<button class="primary wide" id="endBtn">The night is over</button>';
      $('endBtn').onclick = () => this.showEnd();
      return;
    }
    const cs = st.choices(s);
    const go = cs.filter((c) => c.about === 'go');
    const rest = cs.filter((c) => c.about !== 'go');
    // Group by subject: people, then things here, then what you carry.
    const groups = new Map<string, Choice[]>();
    for (const c of rest) groups.set(c.about, [...(groups.get(c.about) ?? []), c]);
    const isPerson = (k: string) => st.people.includes(k);
    const rank = (k: string) => (isPerson(k) ? 0 : st.carried(s, k) ? 2 : 1);
    const order = [...groups.keys()].sort((a, b) => rank(a) - rank(b));
    const row = (title: string, els: HTMLElement[], cls = '') => {
      if (!els.length) return;
      const r = document.createElement('div');
      r.className = `row ${cls}`;
      r.innerHTML = `<span class="lab">${title}</span>`;
      const list = document.createElement('div');
      list.className = 'list';
      els.forEach((e) => list.appendChild(e));
      r.appendChild(list);
      box.appendChild(r);
    };
    const btn = (label: string, cls: string, on: () => void) => {
      const b = document.createElement('button');
      b.className = cls;
      b.textContent = label;
      b.onclick = on;
      return b;
    };
    const subjects = (filter: (k: string) => boolean) =>
      order.filter(filter).flatMap((k) => {
        const list = groups.get(k)!;
        // Carried things always show by name, so you can see what you have.
        const carried = st.carried(s, k);
        // A lone action stands in for its subject; people keep their name on it.
        const label = isPerson(k) ? `${st.subjectName(s, k)}: ${list[0].label[0].toLowerCase()}${list[0].label.slice(1)}` : list[0].label;
        if (list.length === 1 && !carried) return [btn(label, 'act', () => this.do(list[0].id))];
        const chip = btn(st.subjectName(s, k), `chip${this.open === k ? ' on' : ''}`, () => {
          this.open = this.open === k ? null : k;
          this.render(false);
        });
        const out = [chip];
        if (this.open === k) for (const c of list) out.push(btn(c.label, 'act sub', () => this.do(c.id)));
        return out;
      });
    row('People', subjects(isPerson));
    row('Here', subjects((k) => !isPerson(k) && !st.carried(s, k)));
    row('Carrying', subjects((k) => st.carried(s, k)));
    row('Go', go.map((c) => btn(`→ ${c.label}`, 'go', () => this.do(c.id))), 'goes');
    if (scroll) {
      const story = $('story');
      story.scrollTop = story.scrollHeight;
    }
  }

  // ---------------------------------------------------------------- endings and cards

  private recordEnd(): void {
    const e = this.s.over!;
    const p = loadProfile();
    const n = nightProfile(p, this.story.night);
    n.plays++;
    n.best = Math.max(n.best, e.stars);
    if (!n.endings.includes(e.title)) n.endings.push(e.title);
    if (this.story.night !== 1) p[`n${this.story.night}`] = n;
    store.save('profile', p);
  }

  showEnd(): void {
    const e = this.s.over;
    if (!e) return;
    const n = nightProfile(loadProfile(), this.story.night);
    const other = this.story.night === 1 ? 2 : 1;
    const again = { label: 'Play the night again', primary: this.story.night !== 1, onClick: () => this.restart() };
    const next = { label: other === 2 ? 'Try Night 2: the fog' : 'Play Night 1: the storm', primary: other === 2, onClick: () => this.playNight(other) };
    showCard(
      `<h2>${e.title}</h2><div class="stars">${'★'.repeat(e.stars)}<span class="off">${'★'.repeat(3 - e.stars)}</span></div>
       ${e.text.map((t) => `<p>${t}</p>`).join('')}
       <p class="meta2">${this.story.stars} Best: ${'★'.repeat(n.best) || 'none yet'}.</p>`,
      [...(other === 2 ? [next, again] : [again, next]), { label: 'Read the story so far', onClick: closeOverlay }, { label: 'All games', onClick: () => (location.href = '../') }],
    );
  }

  restart(): void {
    closeOverlay();
    this.start([]);
  }

  showHelp(): void {
    store.save('seenHelp', true);
    showCard(
      `<h2>Last Light</h2>
       <p>Short stories you play by tapping. Each night on Corran Isle has its own trouble and its own clock.</p>
       <ul>
         <li>Tap a place under <b>Go</b> to move, and people or things to see what you can do with them.</li>
         <li>Most actions take three minutes, talking included (some take longer; looking and reading are free). ${this.story.deadline}</li>
         <li>The weather and the people remember what you do. There are several endings.</li>
       </ul>`,
      [{ label: 'Begin', primary: true, onClick: closeOverlay }],
    );
  }

  showMenu(): void {
    const p = loadProfile();
    const n = nightProfile(p, this.story.night);
    const nightBtn = (k: number) => {
      const st = storyFor(k);
      const np = nightProfile(p, k);
      const on = k === this.story.night;
      const started = np.plays > 0 || !!store.load<{ a?: string } | null>(st.saveKey, null)?.a;
      const badge = !started && k === 2 ? '<span class="new">New</span>' : np.plays ? `<span class="best">${'★'.repeat(np.best) || '·'}</span>` : '';
      return `<button class="night${on ? ' on' : ''}" data-night="${k}"><b>Night ${k}</b>${badge}<small>${st.name}</small></button>`;
    };
    showCard(
      `<h2>Last Light</h2>
       <div class="nights">${NIGHTS.map((st) => nightBtn(st.night)).join('')}</div>
       <p>Night ${this.story.night}, ${this.story.clock(this.s)} · ${n.plays ? `played ${n.plays} time${n.plays > 1 ? 's' : ''}, ${n.endings.length} ending${n.endings.length === 1 ? '' : 's'} found` : 'not finished yet'}</p>`,
      [
        { label: 'Resume', primary: true, onClick: closeOverlay },
        { label: 'How to play', onClick: () => this.showHelp() },
        {
          label: 'Start the night over',
          onClick: () =>
            showCard(`<h2>Start over?</h2><p>${this.story.restartLine}</p>`, [
              { label: 'Keep going', primary: true, onClick: closeOverlay },
              { label: 'Start over', onClick: () => this.restart() },
            ]),
        },
        { label: 'Copy bug report', onClick: () => this.copyReport() },
        { label: 'All games', onClick: () => (location.href = '../') },
      ],
    );
    document.querySelectorAll<HTMLButtonElement>('.card .nights button').forEach((b) => {
      b.onclick = () => {
        const k = Number(b.dataset.night);
        if (k === this.story.night) closeOverlay();
        else this.playNight(k);
      };
    });
  }

  private async copyReport(): Promise<void> {
    toast((await copyText(`${this.story.reportTag} v${this.story.RULES_VERSION} a=${this.ids.join(',')}`)) ? 'Bug report copied' : 'Copy failed');
  }

  // ---------------------------------------------------------------- sky

  private sizeSky(): void {
    const dpr = Math.min(3, devicePixelRatio || 1);
    this.sky.width = Math.round(this.sky.clientWidth * dpr);
    this.sky.height = Math.round(this.sky.clientHeight * dpr);
  }

  private frame(t: number): void {
    const dt = Math.min(0.1, (t - (this.last || t)) / 1000);
    this.last = t;
    this.time += dt;
    const g = this.sky.getContext('2d')!;
    const dpr = this.sky.width / Math.max(1, this.sky.clientWidth);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.story.night === 2) drawFog(g, this.sky.clientWidth, this.sky.clientHeight, this.s as N2State, this.time);
    else drawSky(g, this.sky.clientWidth, this.sky.clientHeight, this.s as N1State, this.time);
    requestAnimationFrame((tt) => this.frame(tt));
  }
}
