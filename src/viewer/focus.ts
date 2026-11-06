import { perFrame } from '../shared/dom';

const ACTIVE_CLASS = 'mdt-focus-block';

/** Hides the interface and dims everything except the block being read. */
export class FocusMode {
  private active = false;
  private current: Element | null = null;
  private readonly track = perFrame(() => this.highlightCenter());

  constructor(
    private readonly scroller: HTMLElement,
    private readonly article: HTMLElement,
  ) {
    scroller.addEventListener('scroll', this.track, { passive: true });
    document.addEventListener('fullscreenchange', () => {
      // Esc in full screen is handled by the browser and never reaches the page.
      if (!document.fullscreenElement && this.active) this.exit();
    });
  }

  get isActive(): boolean {
    return this.active;
  }

  toggle(): void {
    if (this.active) this.exit();
    else this.enter();
  }

  enter(): void {
    this.active = true;
    document.documentElement.classList.add('mdt-focus');
    this.highlightCenter();
    document.documentElement.requestFullscreen?.().catch(() => {
      // Full screen is a bonus. Dimming works without it.
    });
  }

  exit(): void {
    this.active = false;
    document.documentElement.classList.remove('mdt-focus');
    this.current?.classList.remove(ACTIVE_CLASS);
    this.current = null;
    if (document.fullscreenElement) void document.exitFullscreen();
  }

  /** Called after the document changes, since the highlighted block may be gone. */
  refresh(): void {
    if (this.active) this.highlightCenter();
  }

  private highlightCenter(): void {
    if (!this.active) return;
    const view = this.scroller.getBoundingClientRect();
    const center = view.top + view.height / 2;

    let closest: Element | null = null;
    let distance = Number.POSITIVE_INFINITY;
    for (const block of this.article.children) {
      const rect = block.getBoundingClientRect();
      const gap = rect.top <= center && rect.bottom >= center ? 0 : Math.min(Math.abs(rect.top - center), Math.abs(rect.bottom - center));
      if (gap < distance) {
        distance = gap;
        closest = block;
      }
      if (rect.top > center + distance) break;
    }

    if (closest === this.current) return;
    this.current?.classList.remove(ACTIVE_CLASS);
    closest?.classList.add(ACTIVE_CLASS);
    this.current = closest;
  }
}
