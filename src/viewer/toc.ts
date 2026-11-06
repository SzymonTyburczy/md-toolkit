import type { Heading } from '../markdown/render';
import { h, icon, perFrame } from '../shared/dom';
import { t } from '../shared/i18n';

interface TocNode {
  heading: Heading;
  number: string;
  children: TocNode[];
}

/** Builds the nesting from heading levels, tolerating skipped levels such as h2 to h4. */
export function buildTree(headings: Heading[], numberFrom: number | null): TocNode[] {
  const roots: TocNode[] = [];
  const stack: TocNode[] = [];
  const counters = [0, 0, 0, 0, 0, 0, 0];

  for (const heading of headings) {
    let number = '';
    if (numberFrom !== null && heading.level >= numberFrom && heading.level <= numberFrom + 3) {
      counters[heading.level] = counters[heading.level]! + 1;
      counters.fill(0, heading.level + 1);
      number = counters.slice(numberFrom, heading.level + 1).join('.');
    }

    const node: TocNode = { heading, number, children: [] };
    while (stack.length > 0 && stack[stack.length - 1]!.heading.level >= heading.level) stack.pop();
    (stack[stack.length - 1]?.children ?? roots).push(node);
    stack.push(node);
  }
  return roots;
}

export class TableOfContents {
  private readonly collapsed = new Set<string>();
  private headings: Heading[] = [];
  private links = new Map<string, HTMLAnchorElement>();
  private signature = '';
  private activeId: string | null = null;

  constructor(
    private readonly list: HTMLElement,
    private readonly scroller: HTMLElement,
    private readonly article: HTMLElement,
  ) {
    scroller.addEventListener('scroll', perFrame(() => this.syncActive()), { passive: true });
  }

  update(headings: Heading[], depth: number, numberFrom: number | null): void {
    const visible = headings.filter((heading) => heading.level <= depth);
    const signature = JSON.stringify([visible, numberFrom]);
    this.headings = visible;
    if (signature !== this.signature) {
      this.signature = signature;
      this.render(numberFrom);
    }
    this.syncActive();
  }

  toggleAll(): void {
    const parents = [...this.list.querySelectorAll<HTMLElement>('li[data-parent]')].map((item) => item.dataset.id!);
    const collapse = parents.some((id) => !this.collapsed.has(id));
    this.collapsed.clear();
    if (collapse) parents.forEach((id) => this.collapsed.add(id));
    for (const item of this.list.querySelectorAll<HTMLElement>('li[data-parent]')) {
      item.classList.toggle('mdt-collapsed', collapse);
    }
  }

  private render(numberFrom: number | null): void {
    this.links.clear();
    this.activeId = null;
    const tree = buildTree(this.headings, numberFrom);
    if (tree.length === 0) {
      this.list.replaceChildren(h('p', { class: 'mdt-toc-empty' }, t('toc.empty')));
      return;
    }
    this.list.replaceChildren(this.renderLevel(tree));
  }

  private renderLevel(nodes: TocNode[]): HTMLElement {
    const list = h('ul');
    for (const { heading, number, children } of nodes) {
      const link = h('a', { href: `#${heading.id}`, title: heading.text },
        number ? h('span', { class: 'mdt-toc-number' }, number) : null,
        heading.text,
      );
      this.links.set(heading.id, link);

      const hasChildren = children.length > 0;
      const row = h('div', { class: 'mdt-toc-row' });
      if (hasChildren) {
        const item = () => row.parentElement!;
        row.append(h('button', {
          class: 'mdt-toc-toggle',
          type: 'button',
          title: t('toc.toggleSection'),
          'aria-label': t('toc.toggleSection'),
          onClick: () => {
            const collapsed = item().classList.toggle('mdt-collapsed');
            if (collapsed) this.collapsed.add(heading.id);
            else this.collapsed.delete(heading.id);
          },
        }, icon('chevron-right')));
      } else {
        row.append(h('span', { class: 'mdt-toc-spacer' }));
      }
      row.append(link);

      const item = h('li', { 'data-id': heading.id, 'data-parent': hasChildren ? 'true' : undefined }, row);
      item.classList.toggle('mdt-collapsed', this.collapsed.has(heading.id));
      if (hasChildren) item.append(this.renderLevel(children));
      list.append(item);
    }
    return list;
  }

  private syncActive(): void {
    const line = this.scroller.getBoundingClientRect().top + 90;
    let active: string | null = this.headings[0]?.id ?? null;

    for (const heading of this.headings) {
      const element = this.article.querySelector(`[id="${CSS.escape(heading.id)}"]`);
      if (!element) continue;
      if (element.getBoundingClientRect().top > line) break;
      active = heading.id;
    }

    if (active === this.activeId) return;
    if (this.activeId) this.links.get(this.activeId)?.classList.remove('mdt-active');
    this.activeId = active;
    const link = active ? this.links.get(active) : undefined;
    link?.classList.add('mdt-active');
    link?.scrollIntoView({ block: 'nearest' });
  }
}
