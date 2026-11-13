import { wantsDaily } from '../shared/daily';
import { installErrorOverlay, toast } from '../shared/debug';
import { randomSeed } from '../shared/rng';
import { DARK, LEVELS, LIGHT, RULES_VERSION, dailyPuzzle, lessonPuzzles, type Level } from './core';
import { Game, store, validGame, type SavedGame } from './game';

installErrorOverlay();

const game = new Game();
document.getElementById('menuBtn')!.onclick = () => game.showMenu();
document.getElementById('newBtn')!.onclick = () => game.showNew();

// ?seed=123&level=hard&first=ai&a=... replays a game; ?puzzle=<id>&a=... a puzzle (bug reports).
const p = new URLSearchParams(location.search);
const saved = store.load<SavedGame | null>('game', null);
const savedPuzzle = store.load<{ v: number; id: string; a: string; tries: number } | null>('puzzle', null);
const moves = (p.get('a') ?? '').split(',').filter(Boolean);
if (p.has('seed') && Number.isFinite(Number(p.get('seed')))) {
  const level = (p.get('level') ?? 'normal') as Level;
  game.start(Number(p.get('seed')), level in LEVELS ? level : 'normal', p.get('first') === 'ai' ? DARK : LIGHT, moves);
  history.replaceState(null, '', location.pathname);
} else if (p.has('puzzle')) {
  const id = p.get('puzzle')!;
  const day = id.startsWith('daily-') ? id.slice(6) : null;
  const pz = day ? dailyPuzzle(day) : lessonPuzzles().find((l) => l.id === id);
  if (pz) game.startPuzzle(pz, day, moves);
  else game.start(randomSeed(), game.level, LIGHT);
  history.replaceState(null, '', location.pathname);
} else if (wantsDaily()) game.playDaily();
else if (savedPuzzle && savedPuzzle.v === RULES_VERSION) {
  const day = savedPuzzle.id.startsWith('daily-') ? savedPuzzle.id.slice(6) : null;
  const pz = day ? dailyPuzzle(day) : lessonPuzzles().find((l) => l.id === savedPuzzle.id);
  if (pz) game.startPuzzle(pz, day, savedPuzzle.a ? savedPuzzle.a.split(',') : [], savedPuzzle.tries);
  else game.resumeGame();
} else if (validGame(saved)) game.start(saved.seed, saved.level, saved.first, saved.a ? saved.a.split(',') : [], saved);
else {
  game.start(randomSeed(), game.level, LIGHT);
  if ((saved as SavedGame | null)?.a) setTimeout(() => toast('Brink was updated, so a fresh game started'), 600);
}

if (!store.load('seenHelp', false)) game.showHelp();

(window as unknown as { __game: Game }).__game = game;
