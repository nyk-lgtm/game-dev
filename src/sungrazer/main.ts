import { wantsDaily } from '../shared/daily';
import { installErrorOverlay } from '../shared/debug';
import { randomSeed } from '../shared/rng';
import { MODES, decodeInputs, isMode } from './core';
import { Game, loadProfile } from './game';

installErrorOverlay();

const game = new Game();
const profile = loadProfile();
game.mode = isMode(profile.mode) && profile.best >= MODES[profile.mode].unlock ? profile.mode : 'n';

// ?seed=123&m=n&a=...&t=... plays a recording back (bug reports).
const p = new URLSearchParams(location.search);
if (p.has('seed') && Number.isFinite(Number(p.get('seed')))) {
  const m = p.get('m');
  const t = Number(p.get('t'));
  game.watch(Number(p.get('seed')) >>> 0, isMode(m) ? m : 'n', decodeInputs(p.get('a') ?? ''), Number.isFinite(t) && t > 0 ? t : Infinity, 'Recording');
  history.replaceState(null, '', location.pathname);
} else if (wantsDaily()) game.playDaily();
else game.start(randomSeed());

if (!profile.tips.includes('help') && game.state === 'ready') game.showHelp(true);

(window as unknown as { __game: Game }).__game = game;
