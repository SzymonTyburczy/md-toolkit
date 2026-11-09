import { byId, debounce } from '../shared/dom';
import { t } from '../shared/i18n';
import { buildTextIndex, findMatches, rangeFor } from './text-index';

const ALL_MATCHES = 'mdt-search';
const CURRENT_MATCH = 'mdt-search-current';

/**
 * In-document search. Matches are painted with the CSS Custom Highlight API,
 * which leaves the document's DOM untouched, so it cannot disturb the block
 * diffing or the text a reader selects and copies.
 */
export class DocumentSearch {
  private readonly box = byId('mdt-search');
  private readonly input = byId<HTMLInputElement>('mdt-search-input');
  private readonly counter = byId('mdt-search-count');
  private readonly caseToggle = byId<HTMLButtonElement>('mdt-search-case');
  private ranges: Range[] = [];
  private current = -1;
  private matchCase = false;

  constructor(
    private readonly article: HTMLElement,
    private readonly scroller: HTMLElement,
  ) {
    const run = debounce(() => this.run(true), 120);
    this.input.addEventListener('input', run);
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.step(event.shiftKey ? -1 : 1);
      } else if (event.key === 'Escape') {
        event.stopPropagation();
        this.close();
      }
    });
    byId('mdt-search-prev').addEventListener('click', () => this.step(-1));
    byId('mdt-search-next').addEventListener('click', () => this.step(1));
    byId('mdt-search-close').addEventListener('click', () => this.close());
    this.caseToggle.addEventListener('click', () => {
      this.matchCase = !this.matchCase;
      this.caseToggle.setAttribute('aria-pressed', String(this.matchCase));
      this.run(true);
    });
  }

  get isOpen(): boolean {
    return !this.box.hidden;
  }

  /** `query` comes from a folder search result that opened this document. */
  open(query?: string): void {
    this.box.hidden = false;
    const selected = window.getSelection()?.toString().trim();
    if (selected && !selected.includes('\n')) this.input.value = selected;
    if (query) this.input.value = query;
    this.input.focus();
    this.input.select();
    this.run(true);
  }

  close(): void {
    // Without this the hidden input keeps focus for a moment and swallows shortcuts.
    this.input.blur();
    this.box.hidden = true;
    CSS.highlights.delete(ALL_MATCHES);
    CSS.highlights.delete(CURRENT_MATCH);
    this.ranges = [];
    this.current = -1;
  }

  /** Called after the document changes, so ranges never point at removed nodes. */
  refresh(): void {
    if (this.isOpen) this.run(false);
  }

  private run(jump: boolean): void {
    const index = buildTextIndex(this.article);
    this.ranges = findMatches(index.text, this.input.value, this.matchCase)
      .map(([start, end]) => rangeFor(index, start, end))
      .filter((range) => range !== null);

    CSS.highlights.set(ALL_MATCHES, new Highlight(...this.ranges));
    this.current = this.ranges.length === 0 ? -1 : Math.min(Math.max(this.current, 0), this.ranges.length - 1);
    if (jump && this.ranges.length > 0) this.current = this.firstVisible();
    this.showCurrent(jump);
  }

  /** Starts from what the reader is looking at rather than the top of the document. */
  private firstVisible(): number {
    const top = this.scroller.getBoundingClientRect().top;
    const index = this.ranges.findIndex((range) => range.getBoundingClientRect().top >= top);
    return Math.max(index, 0);
  }

  private step(direction: number): void {
    if (this.ranges.length === 0) return;
    this.current = (this.current + direction + this.ranges.length) % this.ranges.length;
    this.showCurrent(true);
  }

  private showCurrent(scroll: boolean): void {
    const range = this.ranges[this.current];
    this.counter.textContent = this.input.value
      ? range ? `${this.current + 1}/${this.ranges.length}` : t('search.none')
      : '';

    if (!range) {
      CSS.highlights.delete(CURRENT_MATCH);
      return;
    }
    CSS.highlights.set(CURRENT_MATCH, new Highlight(range));
    if (!scroll) return;

    for (let node: Node | null = range.startContainer; node; node = node.parentNode) {
      if (node instanceof HTMLDetailsElement) node.open = true;
    }
    const rect = range.getBoundingClientRect();
    const view = this.scroller.getBoundingClientRect();
    if (rect.top < view.top + 40 || rect.bottom > view.bottom - 40) {
      this.scroller.scrollTop += rect.top - view.top - view.height / 3;
    }
  }
}
