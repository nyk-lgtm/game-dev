import { wantsDaily } from '../shared/daily';
import { installErrorOverlay } from '../shared/debug';
import { Game } from './game';

installErrorOverlay();
const game = new Game(document.getElementById('view') as HTMLCanvasElement);
if (wantsDaily()) game.dailyCard();
else game.title();

// Handle for automated browser tests.
(window as unknown as { __game: Game }).__game = game;
