import { wantsDaily } from '../shared/daily';
import { installErrorOverlay } from '../shared/debug';
import * as core from './core';
import { Game } from './game';

installErrorOverlay();
const game = new Game(document.getElementById('view') as HTMLCanvasElement);
if (wantsDaily()) game.dailyCard();
else game.title();

// Handle for automated browser tests.
(window as unknown as { __game: Game }).__game = game;
// The race core too, so a test can set up a seeded race and step it.
(window as unknown as { __core: typeof core }).__core = core;
