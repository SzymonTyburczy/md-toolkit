/**
 * Updates the preview by replacing only the top-level blocks that changed.
 * A full re-render would make diagrams and images flicker on every keystroke
 * and reset anything the reader had open, such as a <details> block.
 */

const LINE_ATTRIBUTE = 'data-line';

/** Pristine HTML of each block, because enhancements mutate the live DOM afterwards. */
const blockKeys = new WeakMap<Element, string>();

/** Source lines shift with every edit above a block, so they are not part of its identity. */
function keyOf(element: Element): string {
  const line = element.getAttribute(LINE_ATTRIBUTE);
  if (line === null) return element.outerHTML;
  element.removeAttribute(LINE_ATTRIBUTE);
  const key = element.outerHTML;
  element.setAttribute(LINE_ATTRIBUTE, line);
  return key;
}

function copyLine(from: Element, to: Element): void {
  const line = from.getAttribute(LINE_ATTRIBUTE);
  if (line !== null) to.setAttribute(LINE_ATTRIBUTE, line);
}

/** Returns the top-level blocks of a fragment, wrapping loose text so nothing is lost. */
export function blocksOf(fragment: DocumentFragment): Element[] {
  const blocks: Element[] = [];
  for (const node of [...fragment.childNodes]) {
    if (node instanceof Element) {
      blocks.push(node);
    } else if (node.textContent?.trim()) {
      const paragraph = node.ownerDocument!.createElement('p');
      paragraph.textContent = node.textContent;
      blocks.push(paragraph);
    }
  }
  return blocks;
}

/**
 * Keeps the unchanged run of blocks at each end and swaps the middle. An edit
 * usually touches one place, so this is nearly always a single block.
 * Returns the blocks that were inserted and still need enhancing.
 */
export function patchChildren(container: Element, next: Element[]): Element[] {
  const current = [...container.children];
  const nextKeys = next.map(keyOf);

  let head = 0;
  while (head < current.length && head < next.length && blockKeys.get(current[head]!) === nextKeys[head]) {
    copyLine(next[head]!, current[head]!);
    head += 1;
  }

  let currentTail = current.length - 1;
  let nextTail = next.length - 1;
  while (currentTail >= head && nextTail >= head && blockKeys.get(current[currentTail]!) === nextKeys[nextTail]) {
    copyLine(next[nextTail]!, current[currentTail]!);
    currentTail -= 1;
    nextTail -= 1;
  }

  const anchor = current[currentTail + 1] ?? null;
  for (let index = head; index <= currentTail; index += 1) current[index]!.remove();

  const inserted: Element[] = [];
  for (let index = head; index <= nextTail; index += 1) {
    const element = next[index]!;
    blockKeys.set(element, nextKeys[index]!);
    container.insertBefore(element, anchor);
    inserted.push(element);
  }
  return inserted;
}
