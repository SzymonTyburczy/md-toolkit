/**
 * Line-based editing of the Markdown source. A rendered block knows which
 * source lines it came from, so editing it in place means swapping exactly
 * those lines and leaving the rest of the file byte for byte as it was.
 */

/** Source lines as [start, end): `end` is the first line after the block. */
export interface LineRange {
  start: number;
  end: number;
}

/** The line ending the file already uses, so an edit never mixes styles. */
export function lineEnding(text: string): string {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function lines(text: string): string[] {
  return text.split(/\r?\n/);
}

export function blockRange(element: Element): LineRange | null {
  const start = Number(element.getAttribute('data-line'));
  const end = Number(element.getAttribute('data-line-end'));
  if (!element.hasAttribute('data-line') || !element.hasAttribute('data-line-end')) return null;
  if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return null;
  return { start, end };
}

export function sliceLines(text: string, range: LineRange): string {
  return lines(text).slice(range.start, range.end).join('\n');
}

export function replaceLines(text: string, range: LineRange, replacement: string): string {
  const all = lines(text);
  all.splice(range.start, range.end - range.start, ...lines(replacement));
  return all.join(lineEnding(text));
}

/**
 * Where a new block typed at the end of the document goes. It starts after a
 * blank line, so it can never merge into the paragraph above it.
 */
export function appendRange(text: string): { text: string; range: LineRange } {
  const all = lines(text);
  while (all.length > 0 && all[all.length - 1]!.trim() === '') all.pop();
  const start = all.length === 0 ? 0 : all.length + 1;
  const padded = all.length === 0 ? [''] : [...all, '', ''];
  return { text: padded.join(lineEnding(text)) + lineEnding(text), range: { start, end: start + 1 } };
}

const TASK = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/;

/**
 * Ticks or unticks the n-th task in a block. The rendered checkboxes appear in
 * the same order as the task markers in the source, which is how they match.
 */
export function toggleTask(text: string, range: LineRange, index: number): string | null {
  const all = lines(text);
  let seen = 0;
  for (let line = range.start; line < Math.min(range.end, all.length); line += 1) {
    const match = TASK.exec(all[line]!);
    if (!match) continue;
    if (seen === index) {
      const ticked = match[2] === ' ' ? 'x' : ' ';
      all[line] = all[line]!.replace(TASK, `$1${ticked}$3`);
      return all.join(lineEnding(text));
    }
    seen += 1;
  }
  return null;
}
