// Adds an entry to the painting journal (notes/journal.md): what was tried,
// what worked and what didn't, and what the painter said about it.
//   node tools/note.mjs [--painting name] 'text'
// Painting scripts write to it with sim.note('text') when run by
// tools/paint.mjs (the entry is filed under the script's name).
import { appendNote } from './journal.mjs';

const args = process.argv.slice(2);
let painting = null; const text = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--painting') painting = args[++i];
  else text.push(args[i]);
}
if (!text.length) { console.error("usage: node tools/note.mjs [--painting name] 'text'"); process.exit(1); }
await appendNote(text.join(' '), painting);
console.error('noted in notes/journal.md');
