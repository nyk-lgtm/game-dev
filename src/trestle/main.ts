import { installErrorOverlay } from '../shared/debug';
import { todayKey, wantsDaily } from '../shared/daily';
import { Game, store } from './game';

installErrorOverlay();

const game = new Game();
document.getElementById('menuBtn')!.onclick = () => game.showMenu();
document.getElementById('levelsBtn')!.onclick = () => game.showLevels();
document.getElementById('helpBtn')!.onclick = () => game.showHelp();

// ?lv=7&a=… opens a trail level with a build; ?seed=…&d=…&a=… a generated level (bug reports).
const q = new URLSearchParams(location.search);
const num = (k: string) => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : null);
const lv = num('lv');
const seed = num('seed');
if (lv !== null && lv >= 1) {
  game.openTrail(Math.floor(lv), q.get('a') ?? '', true);
  history.replaceState(null, '', location.pathname);
} else if (seed !== null) {
  game.openSeed(seed >>> 0, Math.max(0, Math.min(1, num('d') ?? 0.5)), q.get('a') ?? '');
  history.replaceState(null, '', location.pathname);
} else if (wantsDaily() || (store.load<string>('mode', 'trail') === 'daily' && store.load<{ day?: string } | null>('dailyRun', null)?.day === todayKey())) game.playDaily();
else game.resumeTrail();

if (!store.load('seenHelp', false)) game.showHelp();

(window as unknown as { __game: Game }).__game = game;
