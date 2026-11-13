import { installErrorOverlay } from '../shared/debug';
import { closeOverlay, showCard } from '../shared/cards';
import { randomSeed } from '../shared/rng';
import { decode, newGarden } from './core';
import { Game, store } from './game';

installErrorOverlay();

const game = new Game();
document.getElementById('menuBtn')!.onclick = () => game.showMenu();
document.getElementById('helpBtn')!.onclick = () => game.showHelp();
document.getElementById('wishBtn')!.onclick = () => game.showWishes();

// ?g=CODE opens a shared garden as a visit; ?seed=N opens a fresh garden with that seed (tests).
const q = new URLSearchParams(location.search);
const shared = q.get('g');
const visit = shared ? decode(shared) : null;
if (visit) {
  // The link stays in the address until Keep or Back to my garden, so a reload keeps the visit.
  game.open(visit, true);
  const own = game.hasOwn();
  const n = visit.plants.length;
  showCard(
    `<h2>A shared garden</h2><p>Someone sent you their garden: ${n} plant${n === 1 ? '' : 's'}. Listen, strum and play with it. ${
      own ? 'Your own garden stays as it is.' : 'Menu → <b>Keep this garden</b> makes it yours, or start one of your own.'
    }</p>`,
    [
      { label: 'Visit', primary: true, onClick: closeOverlay },
      own ? { label: 'Back to my garden', onClick: () => game.resumeOwn() } : { label: 'Start my own garden', onClick: () => game.newGarden() },
    ],
  );
} else if (q.has('seed') && Number.isFinite(Number(q.get('seed')))) {
  game.open(newGarden(Number(q.get('seed')) >>> 0), true);
  game.save(true);
} else {
  if (store.load('garden', null)) game.resumeOwn();
  else game.open(newGarden(randomSeed()));
  if (shared)
    showCard('<h2>That link didn’t work</h2><p>The garden code was cut short or is from another version. Here is your own garden.</p>', [
      { label: 'OK', primary: true, onClick: closeOverlay },
    ]);
  else if (!store.load('seenHelp', false)) game.showHelp();
}

(window as unknown as { __game: Game }).__game = game;
