import { installErrorOverlay } from '../shared/debug';
import { todayKey, wantsDaily } from '../shared/daily';
import { randomSeed } from '../shared/rng';
import { RULES_VERSION, SIZES, type Size } from './core';
import { Game, store, validSave, type SavedRun } from './game';
import { archiveDays } from './streak';

installErrorOverlay();

const game = new Game();
document.getElementById('menuBtn')!.onclick = () => game.showMenu();
document.getElementById('newBtn')!.onclick = () => game.showNew();
document.getElementById('helpBtn')!.onclick = () => game.showHelp();

// ?seed=123&size=medium[&v=3][&a=…] opens that exact puzzle and moves (for bug reports).
// ?daily plays today's daily, ?daily=YYYY-MM-DD one of the last week's.
const q = new URLSearchParams(location.search);
const size = (q.get('size') ?? 'medium') as Size;
const saved = store.load<SavedRun | null>('run', null);
const dailyRun = store.load<SavedRun | null>('dailyRun', null);
const week = archiveDays();
const askedDay = q.get('daily') ?? '';
if (q.has('seed') && Number.isFinite(Number(q.get('seed'))) && Object.hasOwn(SIZES, size)) {
  const v = Math.min(RULES_VERSION, Math.max(2, Number(q.get('v')) || RULES_VERSION));
  game.start(Number(q.get('seed')) >>> 0, size, { v, seed: 0, size, a: q.get('a') ?? '', ms: 0, hints: 0, done: false });
  history.replaceState(null, '', location.pathname);
} else if (wantsDaily()) game.playDaily(week.includes(askedDay) ? askedDay : todayKey());
// A reload or a restored tab goes back to the daily (or the archive day) that was open.
else if (store.load<string>('mode', 'own') === 'daily' && dailyRun?.day && week.includes(dailyRun.day)) game.playDaily(dailyRun.day);
else if (validSave(saved)) game.start(saved.seed, saved.size, saved);
else game.start(randomSeed(), store.load<Size>('size', 'small'));

if (!store.load('seenHelp', false)) game.showHelp();

(window as unknown as { __game: Game }).__game = game;
