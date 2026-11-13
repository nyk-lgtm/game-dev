import { wantsDaily } from '../shared/daily';
import { installErrorOverlay } from '../shared/debug';
import { randomSeed } from '../shared/rng';
import { decodeEvents, isLevel } from './core';
import { Game, loadProfile, seedOfCode } from './game';

installErrorOverlay();

const game = new Game();
const profile = loadProfile();
const level = isLevel(profile.level) ? profile.level : 0;

// ?seed=123&lv=1&a=... shows a recorded play, rescored (bug reports); ?song=CODE opens a shared song.
const p = new URLSearchParams(location.search);
const lv = Number(p.get('lv'));
if (p.has('seed') && p.has('a') && Number.isFinite(Number(p.get('seed')))) {
  game.showRecord(Number(p.get('seed')) >>> 0, isLevel(lv) ? lv : level, decodeEvents(p.get('a') ?? ''));
  history.replaceState(null, '', location.pathname);
} else {
  const code = p.get('song');
  const shared = code ? seedOfCode(code) : null;
  if (shared !== null) {
    game.load(shared, level, null);
    history.replaceState(null, '', location.pathname);
  } else if (wantsDaily()) {
    game.level = level;
    game.playDaily();
  } else game.load(randomSeed(), level, null);
  game.welcome();
}

(window as unknown as { __game: Game }).__game = game;
