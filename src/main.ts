import { installErrorOverlay, replayFromUrl } from './debug/debug';
import { Game } from './game';
import { randomSeed } from './core';
import { load } from './storage';

installErrorOverlay();

const game = new Game(document.getElementById('board') as HTMLCanvasElement);
document.getElementById('menuBtn')!.onclick = () => game.showMenu();

const fromUrl = replayFromUrl();
const saved = load<{ seed: number; actions: string } | null>('run', null);
if (fromUrl) {
  game.start(fromUrl.seed, fromUrl.actions);
  // Drop the params so a reload resumes the saved run instead of replaying again.
  history.replaceState(null, '', location.pathname);
}
else if (saved) game.start(saved.seed, saved.actions);
else game.start(randomSeed());

if (!load('seenHelp', false)) game.showHelp();

// Handle for automated browser tests.
(window as unknown as { __game: Game }).__game = game;
