// Search Quarry's dictionary: `npx vite-node scripts/quarry/grep.ts '<regex>'`
// prints matching words (common ones plain, ordinary ones marked with *).

import { Dict } from '../../src/quarry/core/dict';
import { PACKED } from '../../src/quarry/core/words';

const d = new Dict(PACKED);
const re = new RegExp(process.argv[2] ?? '.');
const hits = [...d.words].filter((w) => re.test(w));
console.log(`${hits.length} of ${d.words.size}: ${hits.map((w) => (d.common.has(w) ? w : `${w}*`)).join(' ')}`);
