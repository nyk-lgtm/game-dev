// Plain-language notes on a grammar, revealed at the end of a run.

import type { Language } from './lang';

export function grammarNotes(lang: Language): string[] {
  if (lang.grammar.cased) return grammarRules(lang).map((r) => r.text);
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

export interface Rule {
  /** Short heading for the notebook. */
  title: string;
  /** The rule in plain words (may hold <b>). */
  text: string;
  /** Glyphs that, once proven, reveal this rule in the notebook. */
  needs: string[];
}

/** The second village's grammar as notebook entries, each revealed once its glyphs are proven. */
export function grammarRules(lang: Language): Rule[] {
  const g = lang.grammar;
  const c = g.cased;
  if (!c) return [];
  const side = c.side === 'after' ? 'right after' : 'right before';
  const where = c.verb === 'first' ? 'opens the sentence' : c.verb === 'last' ? 'closes the sentence' : 'stands between the doer and the done-to';
  const out: Rule[] = [
    {
      title: 'Who does what to whom',
      text: `Whoever acts has the <b>doer</b> word ${side} it; whatever the action is done to has the <b>done-to</b> word. Those little words, not the order, say who did it, so the two may come in either order.`,
      needs: ['SUBJ', 'OBJ'],
    },
    { title: 'Where the action goes', text: `The action always ${where}, whichever order the others come in.`, needs: ['SUBJ', 'OBJ'] },
    {
      title: 'Many doers',
      text: 'When many act, the action itself wears a mark underneath, as well as the “many” on the doers. When only the done-to are many, the action stays bare.',
      needs: ['PLV'],
    },
  ];
  if (g.plural === 'mark') out.push({ title: 'Many', text: '“Many” is a small mark written under a thing.', needs: ['PL'] });
  else if (g.plural === 'double') out.push({ title: 'Many', text: '“Many” is shown by writing the thing twice.', needs: ['PLV'] });
  else out.push({ title: 'Many', text: `“Many” is its own little word, written ${g.pluralSide} the thing there is more of.`, needs: ['PL'] });
  out.push({
    title: 'Describing words',
    text: `Describing words (big, old, new, dark…) come ${g.adj} the thing they describe, inside its doer or done-to word.`,
    needs: ['new'],
  });
  out.push({ title: 'Not', text: g.neg === 'preverb' ? '“Not” comes right before the action.' : g.neg === 'postverb' ? '“Not” comes right after the action.' : '“Not” closes the sentence.', needs: ['NEG'] });
  out.push({ title: 'Before and later', text: g.tense === 'mark' ? 'Past and future are small marks above the action.' : 'Past and future are words that open the sentence.', needs: ['PAST'] });
  out.push({ title: 'To', text: `“To” comes ${g.adpos === 'pre' ? 'before' : 'after'} the place or person it points at, which then needs no doer or done-to word.`, needs: ['TO'] });
  out.push({
    title: 'Questions',
    text: 'A question puts its question word in place of the unknown one, with the doer or done-to word that one would have: so it can ask who did it, or what it was done to.',
    needs: ['Q', 'SUBJ'],
  });
  return out;
}
