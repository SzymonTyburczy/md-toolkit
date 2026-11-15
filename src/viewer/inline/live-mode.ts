import { h } from '../../shared/dom';
import type { BlockEditor } from '../editor';
import { appendRange, blockRange, replaceLines, sliceLines, toggleTask, type LineRange } from './source-range';

export interface LiveModeHost {
  article: HTMLElement;
  getText(): string;
  /** Updates the document text and its unsaved state, without rendering. */
  setText(text: string): void;
  render(): void;
  placeholder(): string;
  loadEditor(): Promise<typeof import('../editor')>;
}

interface OpenBlock {
  holder: HTMLElement;
  /** The rendered block the editor replaced, or null for a block typed at the end. */
  original: Element | null;
  editor: BlockEditor;
  /** The whole document as it was when the block opened. */
  base: string;
  range: LineRange;
  /** The document before a new block was added, to restore if it stays empty. */
  before: string;
}

type Focus = 'start' | 'end' | { ratio: number };

/**
 * Editing in place: clicking a block swaps just that block for a small editor
 * holding its Markdown. Everything else stays rendered exactly as in reading
 * mode, and leaving the block renders it again.
 */
export class LiveMode {
  private open: OpenBlock | null = null;
  private busy = false;

  constructor(private readonly host: LiveModeHost) {}

  get editing(): boolean {
    return this.open !== null;
  }

  /** Puts the rendered block back and drops the editor, without rendering. */
  close(): void {
    const open = this.open;
    if (!open) return;
    this.open = null;
    if (!open.original && !open.editor.text.trim()) this.host.setText(open.before);
    open.editor.destroy();
    if (open.original) open.holder.replaceWith(open.original);
    else open.holder.remove();
  }

  /** Closes the editor and shows the edited block rendered. */
  commit(): void {
    if (!this.open) return;
    this.close();
    this.host.render();
  }

  /** Task boxes become clickable while editing, and read-only again afterwards. */
  enableTaskBoxes(enabled: boolean): void {
    for (const box of this.host.article.querySelectorAll<HTMLInputElement>('input.mdt-task')) box.disabled = !enabled;
  }

  /** Returns true when the click was used for editing and should go no further. */
  handleClick(event: MouseEvent): boolean {
    const target = event.target as Element;
    if (target.closest('.mdt-block-editor')) return true;
    // Ctrl or Cmd + click still follows links, as in most editors.
    if (event.ctrlKey || event.metaKey) return false;

    const block = this.topBlock(target);
    if (!block) {
      if (this.isBelowContent(event)) {
        event.preventDefault();
        void this.append();
        return true;
      }
      return false;
    }

    const box = target.closest<HTMLInputElement>('input.mdt-task');
    if (box) {
      event.preventDefault();
      this.toggleTask(block, box);
      return true;
    }

    const range = blockRange(block);
    if (!range) {
      if (block.classList.contains('mdt-scratch-hint')) {
        event.preventDefault();
        void this.append();
        return true;
      }
      return false;
    }

    event.preventDefault();
    const bounds = block.getBoundingClientRect();
    const ratio = Math.min(Math.max((event.clientY - bounds.top) / Math.max(bounds.height, 1), 0), 0.999);
    void this.openBlock(block, { ratio });
    return true;
  }

  /** Clicks on the page around the document, below its last block, start a new block. */
  handleBackgroundClick(event: MouseEvent): void {
    if (this.isBelowContent(event)) void this.append();
  }

  private isBelowContent(event: MouseEvent): boolean {
    const last = [...this.host.article.children].at(-1);
    return !last || event.clientY > last.getBoundingClientRect().bottom;
  }

  private topBlock(node: Element): Element | null {
    let current: Element | null = node;
    while (current && current.parentElement !== this.host.article) current = current.parentElement;
    return current;
  }

  private toggleTask(block: Element, box: HTMLInputElement): void {
    const range = blockRange(block);
    if (!range) return;
    const index = [...block.querySelectorAll('input.mdt-task')].indexOf(box);
    const next = toggleTask(this.host.getText(), range, index);
    if (next === null) return;
    this.close();
    this.host.setText(next);
    this.host.render();
  }

  private async openBlock(block: Element, focus: Focus): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      // Committing re-renders, which can shift the source lines of the block that was clicked.
      if (this.open) this.commit();
      if (!block.isConnected) return;
      const range = blockRange(block);
      if (!range) return;

      const { createBlockEditor } = await this.host.loadEditor();
      const base = this.host.getText();
      const source = sliceLines(base, range);
      const holder = h('div', { class: 'mdt-block-editor' });
      block.replaceWith(holder);

      const editor = createBlockEditor(holder, source, {
        placeholder: this.host.placeholder(),
        onChange: (value) => this.host.setText(replaceLines(base, range, value)),
        onLeave: (direction) => this.leave(direction),
      });
      this.open = { holder, original: block, editor, base, range, before: base };

      const lineCount = source.split('\n').length;
      editor.focus(typeof focus === 'object' ? Math.floor(focus.ratio * lineCount) : focus);
    } finally {
      this.busy = false;
    }
  }

  private async append(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      if (this.open) this.commit();
      const before = this.host.getText();
      const { text: base, range } = appendRange(before);
      this.host.setText(base);

      const { createBlockEditor } = await this.host.loadEditor();
      this.host.article.querySelector(':scope > .mdt-scratch-hint')?.remove();
      const holder = h('div', { class: 'mdt-block-editor' });
      this.host.article.append(holder);

      const editor = createBlockEditor(holder, '', {
        placeholder: this.host.placeholder(),
        onChange: (value) => this.host.setText(replaceLines(base, range, value)),
        onLeave: (direction) => this.leave(direction),
      });
      this.open = { holder, original: null, editor, base, range, before };
      editor.focus('start');
      holder.scrollIntoView({ block: 'nearest' });
    } finally {
      this.busy = false;
    }
  }

  /** Arrow keys at the edge of a block carry on into the block above or below. */
  private leave(direction: 'up' | 'down' | null): void {
    const open = this.open;
    if (!open) return;
    const start = open.range.start;
    const end = start + open.editor.text.split('\n').length;
    this.commit();
    if (!direction) return;

    const blocks = [...this.host.article.children].filter((element) => blockRange(element));
    const next = direction === 'up'
      ? blocks.filter((element) => blockRange(element)!.end <= start).at(-1)
      : blocks.find((element) => blockRange(element)!.start >= end);
    if (next) void this.openBlock(next, direction === 'up' ? 'end' : 'start');
  }
}
