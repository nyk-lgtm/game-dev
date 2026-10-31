import { installErrorOverlay } from '../shared/debug';
import { RULES_VERSION, randomSeed } from './core';
import { Game } from './game';
import { load } from './storage';

installErrorOverlay();

const game = new Game(document.getElementById('board') as HTMLCanvasElement);
document.getElementById('menuBtn')!.onclick = () => game.showMenu();

// ?seed=123&a=abc~d replays a bug report exactly.
const p = new URLSearchParams(location.search);
const saved = load<{ seed: number; actions: string; v?: number } | null>('game', null);
if (p.has('seed') && Number.isFinite(Number(p.get('seed')))) {
  const a = p.get('a') ?? '';
  game.start(Number(p.get('seed')), a === '-' ? '' : a);
  history.replaceState(null, '', location.pathname);
} else if (saved && saved.v === RULES_VERSION) game.start(saved.seed, saved.actions);
else game.start(randomSeed());

if (!load('seenHelp', false)) game.showHelp();

// Handle for automated browser tests.
(window as unknown as { __game: Game }).__game = game;
