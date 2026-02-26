/**
 * URL Parser
 *
 * Fetches URLs, extracts main content using Mozilla Readability,
 * converts to Markdown, and splits into paragraphs.
 */

import { sha256 } from '@t3x/core';
import { splitIntoParagraphs } from './paragraph-splitter';
import type { ImportMetadata, ParseResult } from './types';

// Security guardrails
const FETCH_TIMEOUT_MS = 30000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_REDIRECTS = 3;
const MAX_CACHE_ENTRIES = 100;

// Blocked URL schemes (SSRF prevention)
const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

// Private/reserved IP ranges (SSRF prevention)
const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /^fd/i,
];

/**
 * Validate URL is safe to fetch (SSRF prevention).
 */
function validateUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid URL format');
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    throw new Error(`Unsupported URL scheme: ${parsed.protocol} (only http/https allowed)`);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname === '[::1]') {
    throw new Error('Localhost URLs are not allowed');
  }

  // Check for private IP ranges
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new Error('Private/reserved IP addresses are not allowed');
    }
  }
}

// Simple URL cache (5 min TTL, max entries capped)
const urlCache = new Map<string, { result: ParseResult; expires: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached(url: string): ParseResult | null {
  const entry = urlCache.get(url);
  if (entry && entry.expires > Date.now()) return entry.result;
  if (entry) urlCache.delete(url);
  return null;
}

function setCache(url: string, result: ParseResult): void {
  // Evict expired entries and enforce max size
  if (urlCache.size >= MAX_CACHE_ENTRIES) {
    const now = Date.now();
    for (const [key, entry] of urlCache.entries()) {
      if (entry.expires <= now) urlCache.delete(key);
    }
    // If still at capacity, delete oldest entry
    if (urlCache.size >= MAX_CACHE_ENTRIES) {
      const firstKey = urlCache.keys().next().value;
      if (firstKey) urlCache.delete(firstKey);
    }
  }
  urlCache.set(url, { result, expires: Date.now() + CACHE_TTL_MS });
}

/**
 * Fetch a URL and parse its content into paragraphs.
 */
export async function parseUrl(url: string): Promise<ParseResult> {
  // Check cache
  const cached = getCached(url);
  if (cached) return cached;

  // Validate URL (SSRF prevention)
  validateUrl(url);

  // Fetch with timeout, size limit, and manual redirect following
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    let currentUrl = url;
    let redirectCount = 0;

    while (true) {
      response = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          'User-Agent': 'T3X-Importer/1.0',
          Accept: 'text/html,application/xhtml+xml,text/plain,text/markdown',
        },
      });

      // Handle redirects manually to enforce limit and validate targets
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) break;

        redirectCount++;
        if (redirectCount > MAX_REDIRECTS) {
          throw new Error(`Too many redirects (max: ${MAX_REDIRECTS})`);
        }

        // Resolve relative redirects
        currentUrl = new URL(location, currentUrl).href;
        // Validate redirect target (SSRF prevention)
        validateUrl(currentUrl);
        continue;
      }
      break;
    }
  } catch (err) {
    throw new Error(`Failed to fetch URL: ${err instanceof Error ? err.message : 'Network error'}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`URL returned HTTP ${response.status}`);
  }

  // Check content length
  const contentLength = response.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_BYTES) {
    throw new Error(`Content too large: ${contentLength} bytes (max: ${MAX_RESPONSE_BYTES})`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  const rawText = await response.text();

  // Truncate if needed
  const truncated = rawText.length > MAX_RESPONSE_BYTES;
  const text = truncated ? rawText.slice(0, MAX_RESPONSE_BYTES) : rawText;

  let markdown: string;
  let title: string | undefined;

  if (contentType.includes('text/plain') || contentType.includes('text/markdown')) {
    // Plain text or markdown — use directly
    markdown = text;
  } else {
    // HTML — extract with Readability + convert to markdown
    const extracted = extractFromHtml(text, url);
    markdown = extracted.markdown;
    title = extracted.title;
  }

  const paragraphs = splitIntoParagraphs(markdown);
  const contentHash = sha256(text);

  const metadata: ImportMetadata = {
    source_type: 'url',
    source_url: url,
    title,
    content_hash: contentHash,
    content_length: text.length,
    content_truncated: truncated,
    imported_at: new Date().toISOString(),
  };

  const result: ParseResult = {
    paragraphs,
    metadata,
    raw_text: markdown,
  };

  setCache(url, result);
  return result;
}

/**
 * Extract main content from HTML using simple heuristics.
 * Falls back to basic tag stripping if Readability is not available.
 */
function extractFromHtml(html: string, _url: string): { markdown: string; title?: string } {
  // Extract title from <title> tag
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch?.[1]?.trim();

  // Simple HTML-to-markdown conversion (no external dependency needed for v1)
  let text = html;

  // Remove script and style tags
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');

  // Convert headings
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
  text = text.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');
  text = text.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n');
  text = text.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n');

  // Convert list items
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');

  // Convert paragraphs
  text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n');

  // Convert line breaks
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Convert bold/italic
  text = text.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**');
  text = text.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*');

  // Convert code
  text = text.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
  text = text.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n```\n$1\n```\n');

  // Convert blockquotes
  text = text.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, content) =>
    content
      .split('\n')
      .map((line: string) => `> ${line}`)
      .join('\n')
  );

  // Remove remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  // Clean up whitespace
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return { markdown: text, title };
}
