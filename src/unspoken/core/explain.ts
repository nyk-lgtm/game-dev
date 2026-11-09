// Plain-language notes on a grammar, revealed at the end of a run.

import type { Language } from './lang';

export function grammarNotes(lang: Language): string[] {
  const g = lang.grammar;
  const order: Record<string, string> = {
    SVO: 'who acts, then the action, then what it is done to',
    SOV: 'who acts, then what it is done to, and the action last',
    VSO: 'the action first, then who acts, then what it is done to',
    VOS: 'the action first, then what it is done to, and who acts last',
  };
  const notes = [`A sentence goes: ${order[g.order]} (${g.order}).`];
  notes.push(g.adj === 'before' ? 'Describing words (big, old, dark…) come before the thing they describe.' : 'Describing words (big, old, dark…) come after the thing they describe.');
  if (g.plural === 'mark') notes.push('"Many" is a small mark written under a word.');
  else if (g.plural === 'double') notes.push('"Many" is shown by writing the word twice.');
  else notes.push(`"Many" is its own little word, written ${g.pluralSide} the thing there is more of.`);
  notes.push(g.neg === 'preverb' ? '"Not" comes right before the action.' : g.neg === 'postverb' ? '"Not" comes right after the action.' : '"Not" closes the sentence.');
  notes.push(g.tense === 'mark' ? 'Past and future are small marks above the action.' : 'Past and future are words that open the sentence.');
  notes.push(g.adpos === 'pre' ? '"To" comes before the place or person it points at.' : '"To" comes after the place or person it points at.');
  notes.push('A question replaces the unknown thing with its question word, right where the answer would go.');
  return notes;
}
