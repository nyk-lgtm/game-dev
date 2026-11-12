import { describe, expect, it } from 'vitest';
import type { SeasonReport } from '../../src/rewild/core';
import { reportHtml, summaryLines } from '../../src/rewild/story';

const report = (over: Partial<SeasonReport>): SeasonReport => ({
  season: 5,
  points: 40,
  settled: 0,
  settledBonus: 0,
  lostSettled: [],
  species: 6,
  delta: -4,
  lost: [],
  spread: [],
  born: [],
  died: [],
  shrank: [],
  moved: [],
  land: { soil: 0, marsh: 0, ponds: 0, richer: 0, burnt: 0 },
  goals: [],
  ...over,
});

describe('season summary', () => {
  it('names every species that died out, and never calls them hungry too', () => {
    const r = report({
      lost: [
        { id: 'deer', n: 1, why: 'hunted', by: 'wolf' },
        { id: 'wolf', n: 1, why: 'starved' },
        { id: 'rabbit', n: 2, why: 'burnt' },
        { id: 'fox', n: 1, why: 'starved' },
      ],
      died: [{ id: 'deer', n: 1, why: 'hunted', by: 'wolf' }],
      shrank: [{ id: 'deer', n: 1, why: 'hungry' }, { id: 'bees', n: 1, why: 'hungry' }],
    });
    const lines = summaryLines(r, null, 3).join('\n');
    for (const name of ['deer', 'wolves', 'rabbits', 'foxes']) expect(lines).toContain(name);
    expect(lines).toContain('4 died out');
    expect(lines).not.toMatch(/deer hungry/);
    expect(lines).toMatch(/bees hungry/);
  });

  it('the report says what the coming season counts', () => {
    const risk = report({ lost: [{ id: 'rabbit', n: 1, why: 'burnt' }] });
    const none = reportHtml(report({}), risk, 0);
    const some = reportHtml(report({}), risk, 1);
    expect(none).toContain('If you play nothing');
    expect(some).toContain('Counts the 1 card');
    expect(some).toContain('burn in the wildfire');
    expect(some).not.toContain('Next season, if you play nothing');
  });
});
