import { installErrorOverlay } from '../shared/debug';
import { Game } from './game';

installErrorOverlay();
const game = new Game(document.getElementById('view') as HTMLCanvasElement);
game.title();

// Handle for automated browser tests.
(window as unknown as { __game: Game }).__game = game;
