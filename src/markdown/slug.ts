/** Heading slugs follow GitHub's rules so links copied from a repository keep working. */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '')
    .replace(/ /g, '-');
}

export class SlugRegistry {
  private readonly seen = new Map<string, number>();

  unique(text: string): string {
    const base = slugify(text) || 'section';
    let slug = base;
    let count = this.seen.get(base) ?? 0;
    while (count > 0 && this.seen.has(slug)) {
      slug = `${base}-${count}`;
      count += 1;
    }
    this.seen.set(base, Math.max(count, 1));
    this.seen.set(slug, this.seen.get(slug) ?? 1);
    return slug;
  }
}
