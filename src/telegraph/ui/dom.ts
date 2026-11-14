// DOM UI: HUD, bottom info panel, and modal cards.

import { ENEMIES, type EnemyKind, type GameState } from '../core';
import { closeOverlay, showCard } from '../../shared/cards';

export { closeOverlay, showCard };

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
<p>You are the <span class="c-player">spear</span>. Reach the <span class="c-heal">stairs</span> (somewhere new each floor) and go as deep as you can.</p>
<ul class="help">
  <li><b>Tap a hex</b> to preview, <b>tap again</b> to go. The preview is exact: a white ✕ is your kill, a grey ✕ an enemy hit by its own side.</li>
  <li><b>Moving is attacking.</b> Stab: step between two hexes beside an enemy (1). Lunge: step straight at an enemy 2 away (2).</li>
  <li><b>Bash</b> an adjacent enemy: shove it 1 hex and daze it. Lava kills it; a wall or enemy hurts both. Every 3 turns.</li>
  <li><span class="c-threat">Red</span> fires on the coming enemy turn. Aimed lines: dashes = arrow, chevrons = charge, chain = hook, zigzag = zap. Red hexes = melee reach (bright beside you), dashed hexes = bomb blast. Tap any hex to see who threatens it.</li>
  <li>Amber <b>!</b> = safe now, aimed at next. Red <b>!!</b> = bomb trap. Moves that hurt need the red button.</li>
  <li>Clear the floor before the stairs to <span class="c-heal">heal 1 ♥</span>.</li>
</ul>
<details><summary>Enemies ▸</summary><ul>${(Object.keys(ENEMIES) as EnemyKind[]).map(enemyLine).join('')}</ul></details>
`;
