export interface LineAnchor {
  line: number;
  top: number;
}

/** Interpolates between anchors, so sync stays smooth inside long blocks. */
export function interpolate(anchors: LineAnchor[], value: number, from: keyof LineAnchor, to: keyof LineAnchor): number {
  const first = anchors[0];
  if (!first) return 0;
  if (value <= first[from]) return first[to];

  for (let index = 1; index < anchors.length; index += 1) {
    const previous = anchors[index - 1]!;
    const next = anchors[index]!;
    if (value <= next[from]) {
      const span = next[from] - previous[from];
      const ratio = span === 0 ? 0 : (value - previous[from]) / span;
      return previous[to] + ratio * (next[to] - previous[to]);
    }
  }
  return anchors[anchors.length - 1]![to];
}

interface ScrollableEditor {
  topLine(): number;
  scrollToLine(line: number): void;
}

/** Keeps the editor and the preview on the same part of the document. */
export class ScrollSync {
  /** The pane currently being moved by code, whose scroll events must not echo back. */
  private ignore: 'editor' | 'preview' | null = null;
  private release = 0;

  constructor(
    private readonly editor: ScrollableEditor,
    private readonly scroller: HTMLElement,
    private readonly article: HTMLElement,
  ) {}

  private anchors(): LineAnchor[] {
    const origin = this.scroller.getBoundingClientRect().top - this.scroller.scrollTop;
    const anchors: LineAnchor[] = [];
    for (const element of this.article.children) {
      const line = element.getAttribute('data-line');
      if (line !== null) anchors.push({ line: Number(line), top: element.getBoundingClientRect().top - origin });
    }
    return anchors;
  }

  private hold(pane: 'editor' | 'preview'): void {
    this.ignore = pane;
    clearTimeout(this.release);
    this.release = window.setTimeout(() => { this.ignore = null; }, 80);
  }

  fromEditor(): void {
    if (this.ignore === 'editor') return;
    this.hold('preview');
    this.scroller.scrollTop = interpolate(this.anchors(), this.editor.topLine(), 'line', 'top');
  }

  fromPreview(): void {
    if (this.ignore === 'preview') return;
    this.hold('editor');
    this.editor.scrollToLine(interpolate(this.anchors(), this.scroller.scrollTop, 'top', 'line'));
  }
}
