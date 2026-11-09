import {
  ArrowUp, BookOpen, Check, ChevronDown, ChevronRight, ChevronsUpDown, ChevronUp, ClipboardCopy, Code, Copy,
  createElement, Download, ExternalLink, FileCode, FilePlus, FileText, Focus, Folder, FolderOpen, Keyboard,
  Link, ListTree, PanelLeft, Printer, RefreshCw, RotateCcw, Save, Search, Settings, SlidersHorizontal,
  SquarePen, X,
  type IconNode,
} from 'lucide';

const ICONS: Record<string, IconNode> = {
  'arrow-up': ArrowUp,
  folder: Folder,
  'folder-open': FolderOpen,
  refresh: RefreshCw,
  'book-open': BookOpen,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  'chevron-up': ChevronUp,
  'chevrons-up-down': ChevronsUpDown,
  'clipboard-copy': ClipboardCopy,
  code: Code,
  copy: Copy,
  download: Download,
  'external-link': ExternalLink,
  'file-code': FileCode,
  'file-plus': FilePlus,
  'file-text': FileText,
  focus: Focus,
  keyboard: Keyboard,
  link: Link,
  'list-tree': ListTree,
  'panel-left': PanelLeft,
  printer: Printer,
  'rotate-ccw': RotateCcw,
  save: Save,
  search: Search,
  settings: Settings,
  sliders: SlidersHorizontal,
  'square-pen': SquarePen,
  x: X,
};

export function icon(name: string): SVGElement {
  const node = ICONS[name];
  if (!node) throw new Error(`Unknown icon: ${name}`);
  return createElement(node, { width: 16, height: 16, 'aria-hidden': 'true' });
}

/** Replaces each `data-icon` placeholder's content with the matching SVG. */
export function hydrateIcons(root: ParentNode = document): void {
  for (const element of root.querySelectorAll<HTMLElement>('[data-icon]')) {
    element.prepend(icon(element.dataset.icon!));
  }
}

type Props = Record<string, string | number | boolean | undefined | ((event: Event) => void)>;

/** Small element factory, so the interface can stay free of a UI framework. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    if (value === undefined || value === false) continue;
    if (typeof value === 'function') {
      element.addEventListener(name.replace(/^on/, '').toLowerCase(), value);
    } else if (name === 'class') {
      element.className = String(value);
    } else if (value === true) {
      element.setAttribute(name, '');
    } else {
      element.setAttribute(name, String(value));
    }
  }
  element.append(...children.filter((child) => child !== null && child !== undefined));
  return element;
}

export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

export function debounce<A extends unknown[]>(run: (...args: A) => void, wait: number): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => run(...args), wait);
  };
}

/** Coalesces bursts such as scroll events into one call per frame. */
export function perFrame(run: () => void): () => void {
  let scheduled = false;
  return () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      run();
    });
  };
}

export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
