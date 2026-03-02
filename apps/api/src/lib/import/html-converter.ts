/**
 * HTML Converter
 *
 * Shared module for high-fidelity HTML → Markdown conversion.
 * - extractArticle(): URL import — Readability extracts main content, Turndown converts
 * - convertHtmlToMarkdown(): Document import — direct Turndown (content already clean)
 */

import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

/** OG/meta metadata extracted from HTML pages */
export interface ArticleMetadata {
  title?: string;
  author?: string;
  excerpt?: string;
  site_name?: string;
  published_at?: string;
}

/** Result of extractArticle() */
export interface ArticleResult {
  markdown: string;
  title?: string;
  metadata: ArticleMetadata;
}

// Module-level singleton — TurndownService is stateless after configuration
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
});
turndown.use(gfm);
// Remove script, style, and noscript elements entirely
turndown.remove(['script', 'style', 'noscript']);

/**
 * Extract OG and meta tags from a JSDOM document.
 */
function extractOgMetadata(doc: Document): ArticleMetadata {
  const meta: ArticleMetadata = {};

  const getContent = (selectors: string[]): string | undefined => {
    for (const sel of selectors) {
      const el = doc.querySelector(sel);
      const content = el?.getAttribute('content');
      if (content?.trim()) return content.trim();
    }
    return undefined;
  };

  meta.title = getContent(['meta[property="og:title"]', 'meta[name="twitter:title"]']);
  meta.author = getContent(['meta[name="author"]', 'meta[property="article:author"]']);
  meta.excerpt = getContent([
    'meta[property="og:description"]',
    'meta[name="description"]',
    'meta[name="twitter:description"]',
  ]);
  meta.site_name = getContent(['meta[property="og:site_name"]']);
  meta.published_at = getContent([
    'meta[property="article:published_time"]',
    'meta[name="date"]',
    'meta[name="publish_date"]',
  ]);

  return meta;
}

/**
 * Extract article content from an HTML page (URL import).
 *
 * Uses Mozilla Readability to strip navigation, ads, sidebars, and footers,
 * then converts the clean HTML to Markdown via Turndown.
 *
 * Falls back to stripping boilerplate tags and converting directly if
 * Readability cannot extract content (e.g. very short pages).
 */
export function extractArticle(html: string, url: string): ArticleResult {
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;

  // Extract OG metadata before Readability mutates the DOM
  const ogMeta = extractOgMetadata(doc);

  // Try Readability extraction
  const reader = new Readability(doc);
  const article = reader.parse();

  if (article?.content) {
    const markdown = turndown.turndown(article.content).trim();
    const title = article.title || ogMeta.title;
    return {
      markdown,
      title,
      metadata: {
        ...ogMeta,
        title,
        author: article.byline || ogMeta.author,
        excerpt: article.excerpt || ogMeta.excerpt,
        site_name: article.siteName || ogMeta.site_name,
        published_at: article.publishedTime || ogMeta.published_at,
      },
    };
  }

  // Fallback: strip nav/header/footer/aside, then convert remaining body
  const fallbackDom = new JSDOM(html, { url });
  const fallbackDoc = fallbackDom.window.document;

  for (const tag of ['nav', 'header', 'footer', 'aside', 'script', 'style', 'noscript']) {
    for (const el of fallbackDoc.querySelectorAll(tag)) {
      el.remove();
    }
  }

  const bodyHtml = fallbackDoc.body?.innerHTML ?? '';
  const markdown = turndown.turndown(bodyHtml).trim();

  // Fall back to <title> if no OG title
  const titleEl = fallbackDoc.querySelector('title');
  const title = ogMeta.title || titleEl?.textContent?.trim();

  return {
    markdown,
    title,
    metadata: { ...ogMeta, title },
  };
}

/**
 * Convert clean HTML to Markdown (document import).
 *
 * For already-clean HTML content (e.g. HTML file uploads, mammoth DOCX output)
 * where Readability extraction is unnecessary.
 */
export function convertHtmlToMarkdown(html: string): string {
  return turndown.turndown(html).trim();
}
