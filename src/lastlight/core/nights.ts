// The nights you can play, as Story objects the UI drives. Night 1's module
// (story.ts) keeps its rules and ids; this wraps it (hints live in hints.ts).

import * as n1 from './story';
import * as n2 from './night2';
import { hint1, hint2 } from './hints';
import type { Story } from './types';

const cap = (x: string) => x[0].toUpperCase() + x.slice(1);

export const NIGHT1: Story<n1.State> = {
  night: 1,
  name: 'The storm',
  RULES_VERSION: n1.RULES_VERSION,
  saveKey: 'run',
  reportTag: 'LASTLIGHT',
  intro: [
    'Corran Isle, the night of the big storm.',
    'At dusk the wick in the great lamp burned through and the light went out. Ada, the old keeper, went down the road to the village and said she’d be back by ten. She isn’t.',
  ],
  deadline: 'The ship reaches the rocks at <b>midnight</b>.',
  stars: 'One star each for the light, for Ada, and for Tomas.',
  restartLine: 'Back to ten o’clock in the cottage.',
  people: ['tomas', 'ada'],
  newGame: n1.newGame,
  choices: n1.choices,
  act: n1.act,
  describe: n1.describe,
  clock: n1.clock,
  roomName: (s) => n1.ROOM_NAMES[s.room],
  subjectName(s, k) {
    if (k === 'matches' && s.wet) return 'Damp matches';
    if (k === 'tide') return 'The tide';
    if (k in n1.NPC_NAMES) return n1.NPC_NAMES[k as n1.Npc];
    if (k in n1.ITEM_NAMES) return cap(n1.ITEM_NAMES[k as n1.Item]);
    return cap(k);
  },
  carried: (s, k) => k in n1.ITEM_NAMES && n1.has(s, k as n1.Item),
  company: (s) => (s.tomas.follows ? ['Tomas'] : []),
  late: (s) => !s.f.wound && s.t >= 30,
  hint: hint1,
};

const N2_THINGS: Record<string, string> = {
  door: 'Signal-house door',
  engine: 'The engine',
  stove: 'The stove',
  merrow: 'The Merrow',
  bramble: 'Bramble',
};

export const NIGHT2: Story<n2.State> = {
  night: 2,
  name: 'The fog',
  RULES_VERSION: n2.RULES_VERSION,
  saveKey: 'run2',
  reportTag: 'LASTLIGHT2',
  intro: [
    'Corran Isle, a month after the storm. Ada is on the mainland having her leg seen to, and a relief keeper called Bassett has the lighthouse.',
    'At dusk the fog came in, thick as wool. The Merrow is due round the Point at one, with the doctor and Ada aboard. Then, at half past ten, the doctor’s dog came scratching at your door alone, her lead snapped. Nell, the doctor’s girl, walks her every evening.',
  ],
  deadline: 'The Merrow reaches the Teeth at <b>one o’clock</b>, and the fog gets thicker as the night goes on.',
  stars: 'One star each for the horn, for Nell, and for Bassett.',
  restartLine: 'Back to eleven o’clock in the cottage.',
  people: ['bassett', 'nell', 'bramble'],
  newGame: n2.newGame,
  choices: n2.choices,
  act: n2.act,
  describe: n2.describe,
  clock: n2.clock,
  roomName: (s) => n2.ROOM_NAMES[s.room],
  subjectName(_s, k) {
    if (k in n2.NPC_NAMES) return n2.NPC_NAMES[k as n2.Npc];
    if (k in n2.ITEM_NAMES) return cap(n2.ITEM_NAMES[k as n2.Item]);
    return N2_THINGS[k] ?? cap(k);
  },
  carried: (s, k) => k in n2.ITEM_NAMES && n2.has(s, k as n2.Item),
  company: (s) =>
    [
      s.nell.follows && 'Nell',
      s.bramble.room === s.room && (s.bramble.follows || (s.bramble.withNell && s.nell.follows)) && 'Bramble',
      s.bassett.follows && 'Bassett',
    ].filter((x): x is string => !!x),
  late: (s) => !s.f.horn && s.t >= 30,
  hint: hint2,
};

export const NIGHTS: Story[] = [NIGHT1 as unknown as Story, NIGHT2 as unknown as Story];
