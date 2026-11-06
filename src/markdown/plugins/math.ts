import type { MarkdownIt, StateBlock, StateInline } from 'markdown-it';
import { escapeHtml } from '../highlight';

const SPACE = 0x20;
const TAB = 0x09;
const DIGIT_0 = 0x30;
const DIGIT_9 = 0x39;

/**
 * A `$` only opens math when followed by non-space, and only closes it when
 * preceded by non-space and not followed by a digit. That keeps ordinary prose
 * such as "from $5 to $10" as plain text.
 */
function delimiterAt(state: StateInline, position: number): { canOpen: boolean; canClose: boolean } {
  const previous = position > 0 ? state.src.charCodeAt(position - 1) : -1;
  const next = position + 1 <= state.posMax ? state.src.charCodeAt(position + 1) : -1;
  return {
    canOpen: next !== SPACE && next !== TAB,
    canClose: previous !== SPACE && previous !== TAB && !(next >= DIGIT_0 && next <= DIGIT_9),
  };
}

function findClosingDollar(source: string, from: number): number {
  let match = from;
  while ((match = source.indexOf('$', match)) !== -1) {
    let backslash = match - 1;
    while (source[backslash] === '\\') backslash -= 1;
    if ((match - backslash) % 2 === 1) return match;
    match += 1;
  }
  return -1;
}

function mathInline(state: StateInline, silent: boolean): boolean {
  if (state.src[state.pos] !== '$') return false;

  const literal = (text: string, advanceTo: number): boolean => {
    if (!silent) state.pending += text;
    state.pos = advanceTo;
    return true;
  };

  const start = state.pos + 1;
  if (!delimiterAt(state, state.pos).canOpen) return literal('$', start);

  const end = findClosingDollar(state.src, start);
  if (end === -1) return literal('$', start);
  if (end === start) return literal('$$', start + 1);
  if (!delimiterAt(state, end).canClose) return literal('$', start);

  if (!silent) {
    const token = state.push('math_inline', 'span', 0);
    token.markup = '$';
    token.content = state.src.slice(start, end);
  }
  state.pos = end + 1;
  return true;
}

function mathBlock(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const lineStart = state.bMarks[startLine]! + state.tShift[startLine]!;
  const lineEnd = state.eMarks[startLine]!;
  if (lineStart + 2 > lineEnd || state.src.slice(lineStart, lineStart + 2) !== '$$') return false;
  if (silent) return true;

  let firstLine = state.src.slice(lineStart + 2, lineEnd);
  let lastLine = '';
  let found = false;

  if (firstLine.trim().endsWith('$$')) {
    firstLine = firstLine.trim().slice(0, -2);
    found = true;
  }

  let next = startLine;
  while (!found) {
    next += 1;
    if (next >= endLine) break;
    const start = state.bMarks[next]! + state.tShift[next]!;
    const end = state.eMarks[next]!;
    if (start < end && state.tShift[next]! < state.blkIndent) break;
    if (state.src.slice(start, end).trim().endsWith('$$')) {
      lastLine = state.src.slice(start, state.src.slice(0, end).lastIndexOf('$$'));
      found = true;
    }
  }

  // Without a closing $$ this is plain text. Treating it as math would swallow
  // the rest of the document, which happens constantly while typing in the editor.
  if (!found) return false;

  state.line = next + 1;
  const token = state.push('math_block', 'div', 0);
  token.block = true;
  token.markup = '$$';
  token.map = [startLine, state.line];
  token.content = [
    firstLine.trim() ? firstLine : null,
    next > startLine + 1 ? state.getLines(startLine + 1, next, state.tShift[startLine]!, false) : null,
    lastLine.trim() ? lastLine : null,
  ].filter((part) => part !== null).join('\n').trim();
  return true;
}

export function mathPlugin(md: MarkdownIt): void {
  md.inline.ruler.after('escape', 'math_inline', mathInline);
  md.block.ruler.after('blockquote', 'math_block', mathBlock, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });

  md.renderer.rules.math_inline = (tokens, index) => {
    return `<span class="mdt-math">${escapeHtml(tokens[index]!.content)}</span>`;
  };

  md.renderer.rules.math_block = (tokens, index) => {
    const token = tokens[index]!;
    const line = token.attrGet('data-line');
    const lineAttribute = line === null ? '' : ` data-line="${line}"`;
    return `<div class="mdt-math" data-display="true"${lineAttribute}>${escapeHtml(token.content)}</div>\n`;
  };
}
