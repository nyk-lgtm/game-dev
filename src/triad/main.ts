import { installErrorOverlay } from '../shared/debug';
import { wantsDaily } from '../shared/daily';
import { randomSeed } from '../shared/rng';
import { CLUE_MODES, LEVELS, RULES_VERSION, SIZES, type ClueMode, type Level, type Size } from './core';
import { Game, store } from './game';

installErrorOverlay();

const game = new Game();
game.level = store.load('level', 'normal');
game.mode = store.load('clues', 'numbers');
document.getElementById('menuBtn')!.onclick = () => game.showMenu();
document.getElementById('newBtn')!.onclick = () => game.showNew();

// ?seed=123&size=medium[&level=hard][&clues=links] opens that exact puzzle (for bug reports).
const p = new URLSearchParams(location.search);
if (Object.hasOwn(LEVELS, p.get('level') ?? '')) game.level = p.get('level') as Level;
if (Object.hasOwn(CLUE_MODES, p.get('clues') ?? '')) game.mode = p.get('clues') as ClueMode;
const saved = store.load<Parameters<Game['start']>[2]>('run', null);
const size = (p.get('size') ?? 'medium') as Size;
if (p.has('seed') && Number.isFinite(Number(p.get('seed'))) && size in SIZES) {
  game.start(Number(p.get('seed')), size);
  history.replaceState(null, '', location.pathname);
} else if (wantsDaily()) game.playDaily();
else if (saved && saved.v === RULES_VERSION) game.start(saved.seed, saved.size, saved);
else game.start(randomSeed(), 'small');

if (!store.load('seenHelp', false)) game.showHelp();

(window as unknown as { __game: Game }).__game = game;
