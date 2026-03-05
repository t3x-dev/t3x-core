/**
 * Weibo URL Handler
 *
 * Parses Weibo posts using the mobile page (m.weibo.cn) which
 * embeds post data in the page's script tags as JSON.
 * Handles: weibo.com/*, m.weibo.cn/*
 *
 * No authentication required for public posts.
 */

import { sha256 } from '@t3x/core';
import { splitIntoParagraphs } from '../paragraph-splitter';
import type { ParseResult } from '../types';

const FETCH_TIMEOUT_MS = 30000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB

// Mobile UA for m.weibo.cn
const MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/** Match Weibo URLs — desktop and mobile */
const WEIBO_PATTERN = /^https?:\/\/(?:(?:www\.)?weibo\.com|m\.weibo\.cn)\//;

/** Extract post ID from desktop weibo.com URLs: weibo.com/{uid}/{id} or weibo.com/{uid}/status/{id} */
const DESKTOP_ID_PATTERN = /weibo\.com\/\w+\/(?:status\/)?(\w+)/;

/** Extract post ID from mobile m.weibo.cn URLs: m.weibo.cn/detail/{id} or m.weibo.cn/status/{id} */
const MOBILE_ID_PATTERN = /m\.weibo\.cn\/(?:detail|status)\/(\w+)/;

/** Mobile API for fetching post details */
const MOBILE_API = 'https://m.weibo.cn/statuses/show';

interface WeiboPost {
  text: string;
  user?: {
    screen_name: string;
  };
  created_at?: string;
  reposts_count?: number;
  comments_count?: number;
  attitudes_count?: number;
  pics?: Array<{ url: string }>;
}

export function matchesWeibo(url: string): boolean {
  return WEIBO_PATTERN.test(url);
}

/**
 * Extract post ID from various Weibo URL formats.
 */
function extractPostId(url: string): string | null {
  const mobileMatch = url.match(MOBILE_ID_PATTERN);
  if (mobileMatch?.[1]) return mobileMatch[1];

  const desktopMatch = url.match(DESKTOP_ID_PATTERN);
  if (desktopMatch?.[1]) return desktopMatch[1];

  return null;
}

/**
 * Strip HTML tags from Weibo post text.
 * Weibo text often contains <br>, emoji images, and link tags.
 */
function stripWeiboHtml(html: string): string {
  return (
    html
      // Replace <br> and <br/> with newlines
      .replace(/<br\s*\/?>/gi, '\n')
      // Replace emoji img tags with their alt text (Weibo uses img for emojis)
      .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, '$1')
      // Remove remaining img tags but note them as [Image]
      .replace(/<img[^>]*>/gi, '[Image]')
      // Extract link text from anchor tags
      .replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1')
      // Remove all other HTML tags
      .replace(/<[^>]*>/g, '')
      // Decode HTML entities
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      // Collapse multiple spaces
      .replace(/[ \t]+/g, ' ')
      // Collapse multiple newlines
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

export async function parseWeiboUrl(url: string): Promise<ParseResult> {
  if (!WEIBO_PATTERN.test(url)) {
    throw new Error('Invalid Weibo URL');
  }

  const postId = extractPostId(url);
  if (!postId) {
    throw new Error('Could not extract post ID from Weibo URL');
  }

  // Use the mobile API endpoint to get post data as JSON
  const apiUrl = `${MOBILE_API}?id=${postId}`;

  const response = await fetch(apiUrl, {
    headers: {
      'User-Agent': MOBILE_USER_AGENT,
      Accept: 'application/json',
      Referer: 'https://m.weibo.cn/',
      'X-Requested-With': 'XMLHttpRequest',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Weibo API returned HTTP ${response.status}: post may be private or deleted`);
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_BYTES) {
    throw new Error(`Weibo response too large (${contentLength} bytes)`);
  }

  const responseBuffer = await response.arrayBuffer();
  if (responseBuffer.byteLength > MAX_RESPONSE_BYTES) {
    throw new Error(`Weibo response too large (${responseBuffer.byteLength} bytes)`);
  }

  const responseText = new TextDecoder().decode(responseBuffer);
  let apiData: { ok: number; data: WeiboPost };

  try {
    apiData = JSON.parse(responseText);
  } catch {
    // Fallback: try to extract JSON from HTML page (some URLs return HTML)
    return parseWeiboFromHtml(responseText, url, postId);
  }

  if (!apiData.ok || !apiData.data) {
    // API returned error — try HTML fallback
    return parseWeiboFromHtml(responseText, url, postId);
  }

  const post = apiData.data;
  return buildWeiboResult(post, url);
}

/**
 * Fallback: parse Weibo post from HTML page.
 * Looks for embedded JSON data in script tags.
 */
function parseWeiboFromHtml(html: string, url: string, postId: string): ParseResult {
  // Weibo embeds render data in window.$render_data or similar patterns
  const renderDataMatch =
    html.match(/var\s+\$render_data\s*=\s*(\[[\s\S]*?\])\s*\[0\]/) ??
    html.match(/"status"\s*:\s*(\{[\s\S]*?\})\s*[,}]/);

  if (renderDataMatch?.[1]) {
    try {
      const parsed = JSON.parse(renderDataMatch[1]);
      const status = Array.isArray(parsed) ? parsed[0]?.status : parsed;
      if (status?.text) {
        return buildWeiboResult(status as WeiboPost, url);
      }
    } catch {
      // JSON parse failed, continue to text extraction
    }
  }

  // Last resort: extract any visible text from the page
  const ogDescMatch =
    html.match(
      /<meta\s+(?:property="og:description"\s+content="([^"]*)"|content="([^"]*)"\s+property="og:description")/
    ) ??
    html.match(
      /<meta\s+(?:name="description"\s+content="([^"]*)"|content="([^"]*)"\s+name="description")/
    );

  const ogTitleMatch = html.match(
    /<meta\s+(?:property="og:title"\s+content="([^"]*)"|content="([^"]*)"\s+property="og:title")/
  );

  const description = ogDescMatch?.[1] ?? ogDescMatch?.[2] ?? '';
  const title = ogTitleMatch?.[1] ?? ogTitleMatch?.[2] ?? '';

  if (!description && !title) {
    throw new Error(`Could not extract content from Weibo post ${postId}`);
  }

  const lines: string[] = [];
  if (title) {
    lines.push(`# ${title}`);
    lines.push('');
  }
  if (description) {
    lines.push(description);
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
      title: title || 'Weibo Post',
      site_name: 'Weibo',
      content_hash: contentHash,
      content_length: markdown.length,
      extraction_quality: 'partial',
      imported_at: new Date().toISOString(),
    },
    raw_text: markdown,
  };
}

/**
 * Build a ParseResult from parsed Weibo post data.
 */
function buildWeiboResult(post: WeiboPost, url: string): ParseResult {
  const author = post.user?.screen_name ?? 'unknown';
  const postText = stripWeiboHtml(post.text);

  const lines: string[] = [];

  lines.push(`# Weibo by @${author}`);
  lines.push('');
  lines.push(`**@${author}**`);
  lines.push('');

  if (postText) {
    lines.push(postText);
    lines.push('');
  }

  // Note image count if present
  if (post.pics && post.pics.length > 0) {
    lines.push(`[${post.pics.length} image(s) attached]`);
    lines.push('');
  }

  // Add engagement stats if available
  const stats: string[] = [];
  if (post.reposts_count != null) stats.push(`${post.reposts_count} reposts`);
  if (post.comments_count != null) stats.push(`${post.comments_count} comments`);
  if (post.attitudes_count != null) stats.push(`${post.attitudes_count} likes`);
  if (stats.length > 0) {
    lines.push(`*${stats.join(' · ')}*`);
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
      title: `Weibo by @${author}`,
      author,
      site_name: 'Weibo',
      content_hash: contentHash,
      content_length: markdown.length,
      imported_at: new Date().toISOString(),
    },
    raw_text: markdown,
  };
}
