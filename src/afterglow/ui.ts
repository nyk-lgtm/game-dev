// DOM screens: title, characters, shop, level-up, chest, pause, results, help.

import {
  CHARACTERS,
  NIGHTS,
  MAX_PASSIVES,
  MAX_WEAPONS,
  META,
  PASSIVES,
  UNIONS,
  WEAPONS,
  type Choice,
  type PassiveId,
  type Profile,
  type WeaponId,
  type World,
} from './core';
import { drawIcon, type Shape } from './render/sprites';

const ui = () => document.getElementById('ui')!;

/** The union a base weapon belongs to, if any. */
function unionOf(id: WeaponId): WeaponId | undefined {
  return UNIONS.find((u) => WEAPONS[u].union!.includes(id));
}
const partnerIn = (union: WeaponId, id: WeaponId): WeaponId => WEAPONS[union].union!.find((x) => x !== id)!;

export const WEAPON_ICON: Record<WeaponId, Shape> = {
  pulse: 'dot',
  storm: 'dot',
  orbit: 'diamond',
  corona: 'diamond',
  nova: 'ring',
  supernova: 'ring',
  arc: 'star',
  tempest: 'star',
  lance: 'kite',
  railgun: 'kite',
  mines: 'circle',
  minefield: 'circle',
  ricochet: 'disc',
  pinball: 'disc',
  halo: 'ring',
  sanctum: 'ring',
  siphon: 'cross',
  wellspring: 'cross',
  well: 'hex',
  horizon: 'hex',
  pulsar: 'ring',
  gyre: 'diamond',
  stormlance: 'kite',
  maelstrom: 'hex',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function screen(cls = ''): HTMLDivElement {
  const root = ui();
  root.className = cls;
  root.innerHTML = '';
  const p = el('div', 'panel');
  root.appendChild(p);
  return p;
}

export function hideUi(): void {
  ui().innerHTML = '';
  ui().className = '';
}

function button(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', cls);
  b.textContent = label;
  b.onclick = onClick;
  return b;
}

function pips(level: number, max: number): string {
  if (max <= 1) return '';
  let s = '<div class="pips">';
  for (let i = 1; i <= max; i++) s += `<i class="${i <= level ? 'on' : ''}"></i>`;
  return s + '</div>';
}

/** Icon + name + description card for a weapon or passive choice. */
function choiceCard(w: World, c: Choice, onClick: () => void): HTMLButtonElement {
  const card = el('button', 'card');
  const icon = el('canvas');
  let name = 'Glimmer';
  let desc = '+30 health and 5 shards';
  let tag = '';
  let hint = '';
  if (c.kind === 'weapon') {
    const d = WEAPONS[c.id as WeaponId];
    drawIcon(icon, WEAPON_ICON[d.id], d.hue, 52, !!d.from || !!d.union);
    name = d.name;
    desc = d.levels[c.level - 1] ?? d.desc;
    tag = c.merges ? 'union' : c.evolves ? 'evolved' : c.level === 1 ? 'new' : `lv ${c.level}`;
    if (d.evolvesWith) hint = `Max level + ${PASSIVES[d.evolvesWith].name} → ${WEAPONS[d.evolvesInto!].name}`;
    const un = unionOf(d.id);
    if (un && !c.evolves) hint += `${hint ? '<br>' : ''}Max level + max ${WEAPONS[partnerIn(un, d.id)].name} → ${WEAPONS[un].name}`;
    if (c.level === 1) card.classList.add('new');
  } else if (c.kind === 'passive') {
    const d = PASSIVES[c.id as PassiveId];
    drawIcon(icon, 'hex', d.hue, 52);
    name = d.name;
    desc = d.desc;
    tag = c.level === 1 ? 'new' : `lv ${c.level}`;
    const evo = Object.values(WEAPONS).find((x) => x.evolvesWith === c.id);
    if (evo) hint = `Evolves ${evo.name} → ${WEAPONS[evo.evolvesInto!].name}${w.weapons.some((ws) => ws.id === evo.id) ? ' (you have it)' : ''}`;
    if (c.level === 1) card.classList.add('new');
  } else drawIcon(icon, 'diamond', 185, 52);
  const max = c.kind === 'weapon' ? WEAPONS[c.id as WeaponId].maxLevel : c.kind === 'passive' ? PASSIVES[c.id as PassiveId].maxLevel : 0;
  const body = el(
    'div',
    'body',
    `<div class="name">${name}${tag ? `<span class="tag">${tag}</span>` : ''}</div><div class="desc">${desc}</div>${hint ? `<div class="hint">${hint}</div>` : ''}${pips(c.level, max)}`,
  );
  card.append(icon, body);
  card.onclick = onClick;
  return card;
}

export interface LevelUpHandlers {
  choose(i: number): void;
  reroll(): void;
  skip(): void;
  banish(i: number): void;
}

export function showLevelUp(w: World, h: LevelUpHandlers): void {
  const p = screen();
  let banishing = false;
  p.append(el('h2', '', 'Level up!'));
  p.append(el('p', 'sub', `Level ${w.player.level - w.pendingLevels + 1}${w.pendingLevels > 1 ? ` · ${w.pendingLevels} to pick` : ''}`));
  p.append(slotsLine(w));
  const cards = w.choices.map((c, i) =>
    choiceCard(w, c, () => {
      if (banishing) h.banish(i);
      else h.choose(i);
    }),
  );
  p.append(...cards);
  const row = el('div', 'row');
  const banishBtn = button(`Banish (${w.banishes})`, 'alt', () => {
    banishing = !banishing;
    banishBtn.textContent = banishing ? 'Tap one to banish' : `Banish (${w.banishes})`;
    cards.forEach((c) => c.classList.toggle('banish', banishing));
  });
  banishBtn.disabled = w.banishes <= 0;
  const rerollBtn = button(`Reroll (${w.rerolls})`, 'alt', h.reroll);
  rerollBtn.disabled = w.rerolls <= 0;
  row.append(rerollBtn, banishBtn, button('Skip', 'alt', h.skip));
  p.append(row);
}

export function showChest(w: World, got: Choice[], done: () => void): void {
  const p = screen();
  const evolved = got.some((c) => c.evolves);
  const union = got.some((c) => c.merges);
  p.append(el('h2', '', union ? 'Union!' : evolved ? 'Evolution!' : got.length > 1 ? `Treasure ×${got.length}` : 'Treasure'));
  for (const c of got) {
    const card = choiceCard(w, c, () => {});
    if (c.evolves) card.classList.add('evo');
    p.append(card);
  }
  p.append(button('Continue', 'big', done));
}

function slotsLine(w: World): HTMLElement {
  return el('p', 'slots', `Weapons <b>${w.weapons.length}/${MAX_WEAPONS}</b> · Passives <b>${Object.keys(w.passives).length}/${MAX_PASSIVES}</b>`);
}

/** Compact build overview: every weapon and passive, with evolution recipes. */
export function buildList(w: World): HTMLElement {
  const box = el('div', 'build');
  const item = (shape: Shape, hue: number, evolved: boolean, name: string, level: number, max: number, evo: string) => {
    const row = el('div', 'item' + (evolved ? ' evolved' : ''));
    const icon = el('canvas');
    drawIcon(icon, shape, hue, 34, evolved);
    row.append(icon, el('div', 'body', `<div class="name">${name}${pips(level, max)}</div>${evo ? `<div class="evo">${evo}</div>` : ''}`));
    return row;
  };
  box.append(el('h3', '', `<span>Weapons</span><span>${w.weapons.length}/${MAX_WEAPONS}</span>`));
  for (const ws of w.weapons) {
    const d = WEAPONS[ws.id];
    let evo = '';
    const mark = (ok: boolean, t: string) => `<span class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '·'} ${t}</span>`;
    const lvOk = ws.level >= d.maxLevel;
    if (d.union) evo = `Union of ${WEAPONS[d.union[0]].name} and ${WEAPONS[d.union[1]].name}`;
    else if (d.from) evo = 'Evolved';
    else if (d.evolvesWith) {
      const psOk = (w.passives[d.evolvesWith] ?? 0) > 0;
      evo = `→ ${WEAPONS[d.evolvesInto!].name}: ${mark(lvOk, `lv ${ws.level}/${d.maxLevel}`)} ${mark(psOk, PASSIVES[d.evolvesWith].name)}${lvOk && psOk ? ' · open a chest' : ''}`;
    }
    // Union recipe for this weapon's family (evolved forms still qualify).
    const un = unionOf(d.from ?? d.id);
    if (un && !d.union) {
      const partner = partnerIn(un, d.from ?? d.id);
      const pw = w.weapons.find((x) => (WEAPONS[x.id].from ?? x.id) === partner);
      const pOk = !!pw && pw.level >= WEAPONS[pw.id].maxLevel;
      evo += `${evo ? '<br>' : ''}⊕ ${WEAPONS[un].name}: ${mark(lvOk, 'max')} ${mark(pOk, `max ${WEAPONS[partner].name}`)}${lvOk && pOk ? ' · open a chest' : ''}`;
    }
    box.append(item(WEAPON_ICON[ws.id], d.hue, !!d.from || !!d.union, d.name, ws.level, d.maxLevel, evo));
  }
  if (w.weapons.length < MAX_WEAPONS) box.append(el('div', 'empty', `${MAX_WEAPONS - w.weapons.length} free slot${MAX_WEAPONS - w.weapons.length > 1 ? 's' : ''}`));
  const passives = Object.entries(w.passives) as [PassiveId, number][];
  box.append(el('h3', '', `<span>Passives</span><span>${passives.length}/${MAX_PASSIVES}</span>`));
  for (const [id, lvl] of passives) {
    const d = PASSIVES[id];
    const evoW = Object.values(WEAPONS).find((x) => x.evolvesWith === id);
    const evo = `${d.desc}${evoW ? ` · evolves ${evoW.name}` : ''}`;
    box.append(item('hex', d.hue, false, d.name, lvl, d.maxLevel, evo));
  }
  if (passives.length < MAX_PASSIVES) box.append(el('div', 'empty', `${MAX_PASSIVES - passives.length} free slot${MAX_PASSIVES - passives.length > 1 ? 's' : ''}`));
  return box;
}

export function showPause(w: World, h: { resume(): void; quit(): void; muted: boolean; toggleMute(): void; report(): void }): void {
  const p = screen();
  p.append(el('h2', '', 'Paused'));
  p.append(button('Resume', 'big', h.resume));
  p.append(buildList(w));
  const row = el('div', 'row');
  row.append(
    button(h.muted ? 'Sound: off' : 'Sound: on', 'alt', h.toggleMute),
    button('Give up', 'alt', h.quit),
  );
  p.append(row, button('Copy bug report', 'alt', h.report), button('Resume', 'big', h.resume));
}

export interface RunSummary {
  won: boolean;
  time: number;
  level: number;
  kills: number;
  shards: number;
  night: number;
  dealt: [WeaponId, number][];
  /** Damage taken by source, largest first. */
  taken: [string, number][];
  killedBy: string;
  unlocked: string[];
}

/** One line of advice for whatever hurt you most. */
const TIPS: Record<string, string> = {
  'spitter shot': 'Spitters stop and aim before they fire: keep moving across their line, not along it.',
  'bloater blast': 'Bloaters swell before they burst. Back off when one turns pink, or let it blow up its friends.',
  bloater: 'Bloaters are slow. Kite them and let them pop away from you.',
  brute: 'Brutes shrug off knockback. Circle them instead of backing up in a straight line.',
  dart: 'Darts aim a dashed line first. Step sideways off the line, not backwards.',
  warden: 'Wardens shield everything nearby. Kill them first.',
  splitter: 'Splitters burst into mites. Area weapons (Nova, Halo, Mines) clean those up.',
  drone: 'Drones swarm. Area damage and moving in wide circles keep them off you.',
  mite: 'Mites are fast but frail. An aura or orbit weapon shreds them.',
  orbiter: 'Orbiters circle in. Break out of the ring early instead of waiting.',
  'prism shards': 'The Prism fires in rings with gaps. Slip through a gap rather than outrunning the ring.',
  prism: 'The Prism lunges along its telegraphed line. Step aside when the line appears.',
  'eclipse slam': 'The Eclipse marks the slam on you. Leave the pink circle as soon as it appears.',
  'eclipse embers': 'Embers fly out from the slam circle. Stay well clear of where it lands.',
  'eclipse spiral': 'The spiral has lanes. Move with the rotation, not against it.',
};

const sourceName = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function showResults(r: RunSummary, h: { again(): void; menu(): void }): void {
  const p = screen('title');
  p.append(el('h1', 'logo', r.won ? 'DAWN' : 'FADED'));
  p.append(el('p', 'sub', `${NIGHTS[r.night].name} · ${r.won ? 'You outlasted the Eclipse.' : 'The night took you.'}`));
  p.append(
    el(
      'table',
      'stats',
      `<tr><td>Survived</td><td>${fmtTime(r.time)}</td></tr><tr><td>Level</td><td>${r.level}</td></tr><tr><td>Kills</td><td>${r.kills}</td></tr><tr><td>Shards earned</td><td>◆ ${r.shards}</td></tr>`,
    ),
  );
  const top = r.dealt[0]?.[1] || 1;
  for (const [id, n] of r.dealt) {
    p.append(el('div', 'dmg', `<span style="width:76px">${WEAPONS[id].name}</span><div class="bar"><i style="width:${(100 * n) / top}%"></i></div><span>${Math.round(n).toLocaleString()}</span>`));
  }
  if (r.taken.length) {
    const total = r.taken.reduce((s, [, n]) => s + n, 0) || 1;
    p.append(el('h3', 'recap', r.won ? 'What hurt you' : `Killed by ${r.killedBy ? sourceName(r.killedBy).toLowerCase() : 'the swarm'}`));
    for (const [src, n] of r.taken.slice(0, 4)) {
      const pct = Math.round((100 * n) / total);
      p.append(el('div', 'dmg hurt', `<span style="width:112px">${sourceName(src)}</span><div class="bar"><i style="width:${pct}%"></i></div><span>${pct}%</span>`));
    }
    const tip = TIPS[r.killedBy] ?? TIPS[r.taken[0][0].replace(/^elite /, '')];
    if (tip && !r.won) p.append(el('p', 'tip', tip));
  }
  for (const u of r.unlocked) p.append(el('p', 'shards', `Unlocked: ${u}!`));
  p.append(button('Again', 'big', h.again), button('Menu', 'alt', h.menu));
}

export interface TitleHandlers {
  start(character: string, night: number): void;
  shop(): void;
  help(): void;
  hub(): void;
}

export function showTitle(profile: Profile, selected: string, night: number, h: TitleHandlers): void {
  const p = screen('title');
  p.append(el('h1', 'logo', 'AFTERGLOW'));
  p.append(el('p', 'sub', 'Survive the night. Ten minutes until the Eclipse.'));
  p.append(el('div', 'shards', `${Math.floor(profile.shards)} shards`));
  const grid = el('div', 'chars');
  let pick = selected;
  const cards: HTMLButtonElement[] = [];
  for (const ch of CHARACTERS) {
    const open = !ch.unlock || ch.unlock.check(profile);
    const card = el('button', `card${open ? '' : ' locked'}${ch.id === pick ? ' picked' : ''}`);
    const icon = el('canvas');
    drawIcon(icon, WEAPON_ICON[ch.weapon], ch.hue, 52);
    card.append(icon, el('div', 'body', `<div class="name">${ch.name}</div><div class="desc">${open ? ch.blurb : `🔒 ${ch.unlock!.text}`}</div>`));
    card.onclick = () => {
      if (!open) return;
      pick = ch.id;
      cards.forEach((c, i) => c.classList.toggle('picked', CHARACTERS[i].id === pick));
    };
    cards.push(card);
    grid.append(card);
  }
  p.append(grid);
  // Night picker: unlocked by winning the night before.
  const open = Math.min(NIGHTS.length, (profile.nightsWon ?? 0) + 1);
  let n = Math.min(night, open - 1);
  if (open > 1) {
    const box = el('div', 'nights');
    const prev = button('◀', 'alt', () => setNight(n - 1));
    const next = button('▶', 'alt', () => setNight(n + 1));
    const label = el('div', 'night');
    const setNight = (k: number) => {
      n = Math.max(0, Math.min(open - 1, k));
      label.innerHTML = `<b>${NIGHTS[n].name}</b><span>${NIGHTS[n].text}</span>`;
      prev.disabled = n === 0;
      next.disabled = n === open - 1;
    };
    setNight(n);
    box.append(prev, label, next);
    p.append(box);
  } else if ((profile.wins ?? 0) === 0) p.append(el('p', 'sub', 'Beat the Eclipse to unlock harder nights.'));
  p.append(button('Start', 'big', () => h.start(pick, n)));
  const row = el('div', 'row');
  row.append(button('Upgrades', 'alt', h.shop), button('How to play', 'alt', h.help));
  p.append(row, button('All games', 'alt', h.hub));
  if (profile.runs > 0)
    p.append(el('p', 'sub', `Best: ${fmtTime(profile.bestTime)} · level ${profile.bestLevel} · ${profile.wins} win${profile.wins === 1 ? '' : 's'}`));
}

export function showShop(profile: Profile, h: { buy(id: string): void; back(): void }): void {
  const p = screen('title');
  p.append(el('h2', '', 'Upgrades'));
  p.append(el('div', 'shards', `${Math.floor(profile.shards)} shards`));
  for (const m of META) {
    const rank = profile.ranks[m.id] ?? 0;
    const maxed = rank >= m.max;
    const cost = m.cost(rank);
    const card = el('button', 'card');
    const icon = el('canvas');
    drawIcon(icon, 'hex', (META.indexOf(m) * 37) % 360, 52);
    card.append(icon, el('div', 'body', `<div class="name">${m.name}</div><div class="desc">${m.desc}</div>${pips(rank, m.max)}`), el('div', 'cost', maxed ? 'MAX' : `◆ ${cost}`));
    card.disabled = maxed || profile.shards < cost;
    card.onclick = () => h.buy(m.id);
    p.append(card);
  }
  p.append(button('Back', 'big', h.back));
}

export function showHelp(back: () => void): void {
  const p = screen('title');
  p.append(el('h2', '', 'How to play'));
  p.append(
    el(
      'ul',
      'help',
      `<li><b>Drag anywhere</b> to move. That's the only control: your weapons fire on their own.</li>
       <li><b>Collect gems</b> to level up. Each level, pick one of three upgrades: new weapons, weapon levels, or passives.</li>
       <li><b>Evolve</b>: a weapon at max level plus its matching passive turns into something much stronger when you open a <b>chest</b>. Elites (gold rings) and bosses drop chests.</li>
       <li><b>Unions</b>: some pairs of weapons, both at max level, merge into one in a chest (Halo + Nova, Orbit + Ricochet, Lance + Arc, Gravity Well + Mines). Evolved forms count, and it frees a slot.</li>
       <li><b>Pink means danger</b>: dashed lines are about to be charged down, pink circles are about to explode, pink orbs are enemy shots.</li>
       <li>Wardens (blue hexes) shield nearby enemies. Kill them first.</li>
       <li>At 5:00 the Prism arrives. At 10:00, the Eclipse. Beat it to see the dawn.</li>
       <li>Shards you collect buy permanent upgrades between runs.</li>`,
    ),
  );
  p.append(button('Got it', 'big', back));
}
