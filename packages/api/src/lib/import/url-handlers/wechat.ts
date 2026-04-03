/**
 * WeChat Official Account Article Handler
 *
 * Parses WeChat articles from mp.weixin.qq.com.
 * Handles: mp.weixin.qq.com/s/*
 *
 * WeChat articles are server-rendered in the HTML, so we can
 * fetch with a mobile User-Agent and extract from known DOM selectors.
 */

import { sha256 } from '@t3x-dev/core';
import { splitIntoParagraphs } from '../paragraph-splitter';
import type { ParseResult } from '../types';

const FETCH_TIMEOUT_MS = 30000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB

// Mobile UA helps get server-rendered content
const MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/** Match WeChat article URLs */
const WECHAT_PATTERN = /^https?:\/\/mp\.weixin\.qq\.com\/s\//;

export function matchesWeChat(url: string): boolean {
  return WECHAT_PATTERN.test(url);
}

/**
 * Strip HTML tags and normalize whitespace, preserving paragraph breaks.
 */
function stripHtml(html: string): string {
  return (
    html
      // Replace <br> with newlines
      .replace(/<br\s*\/?>/gi, '\n')
      // Replace block-level closing tags with double newlines
      .replace(/<\/(?:p|div|section|h[1-6])>/gi, '\n\n')
      // Remove all remaining HTML tags
      .replace(/<[^>]*>/g, '')
      // Decode common HTML entities
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      // Collapse whitespace within lines
      .replace(/[ \t]+/g, ' ')
      // Collapse multiple newlines
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/**
 * Extract content between a regex start pattern and end pattern.
 */
function _extractBetween(html: string, startPattern: RegExp, endPattern: RegExp): string | null {
  const startMatch = startPattern.exec(html);
  if (!startMatch) return null;

  const startIdx = startMatch.index + startMatch[0].length;
  const remaining = html.slice(startIdx);
  const endMatch = endPattern.exec(remaining);
  if (!endMatch) return remaining;

  return remaining.slice(0, endMatch.index);
}

export async function parseWeChatUrl(url: string): Promise<ParseResult> {
  if (!WECHAT_PATTERN.test(url)) {
    throw new Error('Invalid WeChat article URL');
  }

  const response = await fetch(url, {
    headers: {
      'User-Agent': MOBILE_USER_AGENT,
      Accept: 'text/html',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`WeChat returned HTTP ${response.status}`);
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_BYTES) {
    throw new Error(`WeChat response too large (${contentLength} bytes)`);
  }

  const responseBuffer = await response.arrayBuffer();
  if (responseBuffer.byteLength > MAX_RESPONSE_BYTES) {
    throw new Error(`WeChat response too large (${responseBuffer.byteLength} bytes)`);
  }

  const html = new TextDecoder().decode(responseBuffer);

  // Extract title: try og:title meta tag first, then <h1 class="rich_media_title">
  let title: string | undefined;

  const ogTitleMatch =
    html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/) ??
    html.match(/<meta\s+content="([^"]*)"\s+property="og:title"/);
  if (ogTitleMatch?.[1]) {
    title = stripHtml(ogTitleMatch[1]);
  }

  if (!title) {
    const titleMatch = html.match(
      /<h1[^>]*class="[^"]*rich_media_title[^"]*"[^>]*>([\s\S]*?)<\/h1>/
    );
    if (titleMatch?.[1]) {
      title = stripHtml(titleMatch[1]);
    }
  }

  // Extract author from <span class="rich_media_meta_text"> or og:author
  let author: string | undefined;

  const authorMetaMatch = html.match(
    /<meta\s+(?:name="author"\s+content="([^"]*)"|content="([^"]*)"\s+name="author")/
  );
  if (authorMetaMatch) {
    author = (authorMetaMatch[1] ?? authorMetaMatch[2])?.trim();
  }

  if (!author) {
    // The author is often in a specific span or the "profile_nickname" element
    const authorSpanMatch = html.match(
      /<span[^>]*class="[^"]*rich_media_meta_text[^"]*"[^>]*>([\s\S]*?)<\/span>/
    );
    if (authorSpanMatch?.[1]) {
      const cleaned = stripHtml(authorSpanMatch[1]);
      if (cleaned && cleaned.length < 100) {
        author = cleaned;
      }
    }
  }

  if (!author) {
    const nicknameMatch = html.match(
      /<strong[^>]*class="[^"]*profile_nickname[^"]*"[^>]*>([\s\S]*?)<\/strong>/
    );
    if (nicknameMatch?.[1]) {
      author = stripHtml(nicknameMatch[1]);
    }
  }

  // Extract body content from <div id="js_content"> ... </div>
  // This is the main article content container in WeChat articles.
  // Uses depth tracking to handle nested divs correctly.
  let bodyText = '';

  const jsContentMatch = /<div[^>]*id="js_content"[^>]*>/.exec(html);
  if (jsContentMatch) {
    const startIdx = jsContentMatch.index + jsContentMatch[0].length;
    let depth = 1;
    let pos = startIdx;
    while (pos < html.length && depth > 0) {
      const openTag = html.indexOf('<div', pos);
      const closeTag = html.indexOf('</div>', pos);
      if (closeTag === -1) break;
      if (openTag !== -1 && openTag < closeTag) {
        depth++;
        pos = openTag + 4;
      } else {
        depth--;
        if (depth === 0) {
          bodyText = stripHtml(html.slice(startIdx, closeTag));
        }
        pos = closeTag + 6;
      }
    }
  }

  // Fallback: try og:description
  if (!bodyText) {
    const ogDescMatch =
      html.match(/<meta\s+property="og:description"\s+content="([^"]*)"/) ??
      html.match(/<meta\s+content="([^"]*)"\s+property="og:description"/);
    if (ogDescMatch?.[1]) {
      bodyText = stripHtml(ogDescMatch[1]);
    }
  }

  if (!bodyText && !title) {
    throw new Error('Could not extract content from WeChat article');
  }

  // Build markdown content
  const lines: string[] = [];

  if (title) {
    lines.push(`# ${title}`);
    lines.push('');
  }

  if (author) {
    lines.push(`**Author:** ${author}`);
    lines.push('');
  }

  if (bodyText) {
    lines.push(bodyText);
    lines.push('');
  }

  const markdown = lines.join('\n');
  const paragraphs = splitIntoParagraphs(markdown);
  const contentHash = sha256(markdown);

  return {
    paragraphs,
    metadata: {
      source_type: 'url',
      source_url: url,
      title,
      author,
      site_name: 'WeChat',
      content_hash: contentHash,
      content_length: markdown.length,
      imported_at: new Date().toISOString(),
    },
    raw_text: markdown,
  };
}
