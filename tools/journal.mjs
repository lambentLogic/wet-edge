// The painting journal (notes/journal.md): dated entries appended at the end.
import { appendFile, readFile } from 'node:fs/promises';

export const JOURNAL = new URL('../notes/journal.md', import.meta.url);

export async function appendNote(text, painting = null) {
  const now = new Date(), pad = n => String(n).padStart(2, '0');
  const when = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  let prev = '';
  try { prev = await readFile(JOURNAL, 'utf8'); } catch {}
  const sep = prev && !prev.endsWith('\n\n') ? (prev.endsWith('\n') ? '\n' : '\n\n') : '';
  await appendFile(JOURNAL, `${sep}### ${when}${painting ? ` · ${painting}` : ''}\n\n${text.trim()}\n`);
}
