import DOMPurify from 'dompurify';

/** DOMPurify's default allow-list plus `file:`, used only for documents that are local themselves. */
const URI_WITH_FILE = /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix|file):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

const FORBID_TAGS = ['style', 'form', 'iframe', 'object', 'embed', 'base', 'meta', 'link', 'title', 'noscript', 'template'];
const FORBID_ATTR = ['style', 'srcdoc'];

/**
 * DOMPurify drops ids that match DOM properties to stop DOM clobbering, which
 * would also remove the anchor from headings such as "Target", "Name" or
 * "Links". Headings cannot clobber document properties, so their ids are safe.
 */
DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
  if (data.attrName === 'id' && /^H[1-6]$/.test(node.nodeName)) data.forceKeepAttr = true;
});

/**
 * Sanitizes rendered Markdown into an inert fragment. Nothing loads until the
 * fragment is attached, so URLs can still be rewritten safely afterwards.
 *
 * `file:` URLs are only accepted when the document itself is a local file:
 * a document from the web must never be able to reference the user's disk.
 */
export function sanitizeToFragment(html: string, baseUrl: string | null): DocumentFragment {
  const isLocalDocument = baseUrl?.startsWith('file:') ?? false;
  return DOMPurify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    FORBID_TAGS,
    FORBID_ATTR,
    ...(isLocalDocument ? { ALLOWED_URI_REGEXP: URI_WITH_FILE } : {}),
  });
}

function absolute(value: string, baseUrl: string): string {
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return value;
  }
}

function absoluteSrcset(value: string, baseUrl: string): string {
  return value
    .split(',')
    .map((candidate) => {
      const [url, ...descriptor] = candidate.trim().split(/\s+/);
      return url ? [absolute(url, baseUrl), ...descriptor].join(' ') : '';
    })
    .filter(Boolean)
    .join(', ');
}

/**
 * The viewer lives at a chrome-extension:// URL, so relative links in a document
 * have to be resolved against the document's own location by hand.
 */
export function resolveRelativeUrls(root: ParentNode, baseUrl: string): void {
  for (const element of root.querySelectorAll<HTMLElement>('[src], [href], [srcset], [poster]')) {
    for (const name of ['src', 'href', 'poster']) {
      const value = element.getAttribute(name);
      if (value && !value.startsWith('#') && !value.startsWith('data:')) {
        const resolved = absolute(value, baseUrl);
        // Sanitizing ran before resolving, so re-check that a relative path did
        // not turn into something the document was not allowed to reference.
        if (resolved.startsWith('file:') && !baseUrl.startsWith('file:')) element.removeAttribute(name);
        else element.setAttribute(name, resolved);
      }
    }
    const srcset = element.getAttribute('srcset');
    if (srcset) element.setAttribute('srcset', absoluteSrcset(srcset, baseUrl));
  }
}
