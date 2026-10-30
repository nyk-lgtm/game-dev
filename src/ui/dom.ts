// DOM UI: HUD, bottom info panel, and modal cards.

import { ENEMIES, type EnemyKind, type GameState } from '../core';
import { BUILD } from '../debug/debug';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function renderHud(s: GameState): void {
  $('depth').textContent = String(s.depth);
  $('kills').textContent = String(s.kills);
  const bash = $('bash');
  bash.textContent = s.player.bashCd === 0 ? '✓' : String(s.player.bashCd);
  bash.className = s.player.bashCd === 0 ? 'value ready' : 'value cooling';
  const hearts = $('hearts');
  hearts.innerHTML = '';
  for (let i = 0; i < s.player.maxHp; i++) {
    const h = document.createElement('span');
    h.className = i < s.player.hp ? 'h' : 'h empty';
    h.textContent = '♥';
    hearts.appendChild(h);
  }
}

export interface PanelAction {
  label: string;
  danger?: boolean;
  onClick: () => void;
}

export function renderPanel(html: string, action: PanelAction | null): void {
  $('info').innerHTML = html;
  const btn = $<HTMLButtonElement>('actBtn');
  if (action) {
    btn.hidden = false;
    btn.textContent = action.label;
    btn.className = action.danger ? 'primary danger' : 'primary';
    btn.onclick = action.onClick;
  } else {
    btn.hidden = true;
    btn.onclick = null;
  }
}

export function closeOverlay(): void {
  const o = $('overlay');
  o.hidden = true;
  o.innerHTML = '';
}

interface CardButton {
  label: string;
  primary?: boolean;
  onClick: () => void;
}

export function showCard(html: string, buttons: CardButton[], dismissable = true): void {
  const o = $('overlay');
  o.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = html;
  for (const b of buttons) {
    const el = document.createElement('button');
    el.className = b.primary ? 'primary' : 'secondary';
    el.textContent = b.label;
    el.onclick = b.onClick;
    card.appendChild(el);
  }
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `build ${BUILD}`;
  card.appendChild(meta);
  o.appendChild(card);
  o.hidden = false;
  o.onclick = dismissable ? (e) => e.target === o && closeOverlay() : null;
}

function enemyLine(k: EnemyKind): string {
  const d = ENEMIES[k];
  const from = d.minDepth > 1 ? ` <i>(floor ${d.minDepth}+)</i>` : '';
  return `<li><span class="c-${k}">${d.name}</span> (${d.maxHp} HP)${from}: ${d.blurb}</li>`;
}

export function enemyIntroHtml(kinds: EnemyKind[]): string {
  return `<h2>New enem${kinds.length > 1 ? 'ies' : 'y'}</h2><ul>${kinds.map(enemyLine).join('')}</ul>`;
}

export const HELP_HTML = `
<h2>How to play</h2>
<p>You are the <span class="c-player">spear</span>. Reach the stairs at the top of each floor. Go as deep as you can.</p>
<ul>
  <li><b>Tap a hex</b> to preview. <b>Tap it again</b> (or press the button) to do it. The preview is exact: ✕ marks who dies, and it shows damage you will take.</li>
  <li><b>Moving is attacking.</b> <b>Stab</b>: step from one hex next to an enemy to another hex next to it (1 damage). <b>Lunge</b>: step straight toward an enemy 2 hexes away (2 damage).</li>
  <li><b>Bash</b>: tap an adjacent enemy to shove it 1 hex. It is <b>dazed</b> (skips its next action, loses its aim). Into lava it dies; into a wall or another enemy, both take 1 damage. Recharges in 3 turns.</li>
  <li><span class="c-threat">Red</span> = danger for the coming enemy turn. Walls block arrows; lava blocks walking, not arrows.</li>
  <li>Kill every enemy before taking the stairs to <span class="c-heal">heal 1 ♥</span>.</li>
</ul>
<h2>Enemies</h2>
<ul>${(Object.keys(ENEMIES) as EnemyKind[]).map(enemyLine).join('')}</ul>
`;
