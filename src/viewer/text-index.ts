/** A flat view of a document's text that can map offsets back to DOM positions. */
export interface TextIndex {
  text: string;
  nodes: { node: Text; start: number }[];
}

/** Interface elements and KaTeX's hidden MathML copy are not part of the reading text. */
const SKIPPED = '.mdt-copy, .mdt-anchor, .katex-mathml, svg, script, style';

export function buildTextIndex(root: Element): TextIndex {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.parentElement?.closest(SKIPPED) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });

  const nodes: TextIndex['nodes'] = [];
  let text = '';
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push({ node: node as Text, start: text.length });
    text += node.nodeValue ?? '';
  }
  return { text, nodes };
}

export function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu)?.length ?? 0;
}

function locate(index: TextIndex, offset: number, preferEnd: boolean): { node: Text; offset: number } | null {
  let low = 0;
  let high = index.nodes.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (index.nodes[middle]!.start <= offset - (preferEnd ? 1 : 0)) low = middle;
    else high = middle - 1;
  }
  const entry = index.nodes[low];
  return entry ? { node: entry.node, offset: offset - entry.start } : null;
}

export function rangeFor(index: TextIndex, start: number, end: number): Range | null {
  const from = locate(index, start, false);
  const to = locate(index, end, true);
  if (!from || !to) return null;
  const range = new Range();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  return range;
}

const MAX_MATCHES = 5000;

export function findMatches(text: string, query: string, matchCase: boolean): [number, number][] {
  if (!query) return [];
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase ? 'gu' : 'giu');
  const matches: [number, number][] = [];
  for (const match of text.matchAll(pattern)) {
    matches.push([match.index, match.index + match[0].length]);
    if (matches.length >= MAX_MATCHES) break;
  }
  return matches;
}
