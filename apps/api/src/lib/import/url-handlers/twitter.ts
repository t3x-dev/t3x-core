/**
 * Twitter/X URL Handler
 *
 * Parses Twitter/X tweets via the public oEmbed API.
 * Handles: twitter.com/{user}/status/{id}, x.com/{user}/status/{id}
 *
 * No authentication required for public tweets.
 */

import { sha256 } from '@t3x/core';
import { splitIntoParagraphs } from '../paragraph-splitter';
import type { ParseResult } from '../types';

const USER_AGENT = 'T3X-Importer/1.0';
const FETCH_TIMEOUT_MS = 30000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB

/** Match Twitter/X status URLs */
const TWITTER_PATTERN = /^https?:\/\/(?:(?:www\.)?twitter\.com|x\.com)\/(\w+)\/status\/(\d+)/;

/** oEmbed API endpoint (works without auth for public tweets) */
const OEMBED_API = 'https://publish.twitter.com/oembed';

interface OEmbedResponse {
  html: string;
  author_name: string;
  author_url: string;
  url: string;
}

export function matchesTwitter(url: string): boolean {
  return TWITTER_PATTERN.test(url);
}

/**
 * Strip HTML tags from oEmbed HTML to extract plain text.
 * Preserves line breaks from <br> and block elements.
 */
function stripHtmlTags(html: string): string {
  return (
    html
      // Replace <br> with newlines
      .replace(/<br\s*\/?>/gi, '\n')
      // Replace block-level closing tags with newlines
      .replace(/<\/(?:p|div|blockquote)>/gi, '\n')
      // Remove all remaining HTML tags
      .replace(/<[^>]*>/g, '')
      // Decode common HTML entities
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      // Collapse multiple newlines
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

export async function parseTwitterUrl(url: string): Promise<ParseResult> {
  const match = url.match(TWITTER_PATTERN);
  if (!match) throw new Error('Invalid Twitter/X URL');

  const [, username, tweetId] = match;

  // Normalize URL to twitter.com format for the oEmbed API
  const canonicalUrl = `https://twitter.com/${username}/status/${tweetId}`;

  // Fetch oEmbed data
  const oembedUrl = `${OEMBED_API}?url=${encodeURIComponent(canonicalUrl)}&omit_script=true`;

  const response = await fetch(oembedUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `Twitter oEmbed API returned ${response.status}: tweet may be private or deleted`
    );
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_BYTES) {
    throw new Error(`Twitter response too large (${contentLength} bytes)`);
  }

  const responseBuffer = await response.arrayBuffer();
  if (responseBuffer.byteLength > MAX_RESPONSE_BYTES) {
    throw new Error(`Twitter response too large (${responseBuffer.byteLength} bytes)`);
  }

  const data = JSON.parse(new TextDecoder().decode(responseBuffer)) as OEmbedResponse;

  // Extract text content from oEmbed HTML
  const tweetText = stripHtmlTags(data.html);

  // Build markdown content
  const lines: string[] = [];

  lines.push(`# Tweet by @${data.author_name}`);
  lines.push('');
  lines.push(`**@${data.author_name}** · [Original](${data.url})`);
  lines.push('');

  if (tweetText) {
    lines.push(tweetText);
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
      title: `Tweet by @${data.author_name}`,
      author: data.author_name,
      site_name: 'Twitter',
      content_hash: contentHash,
      content_length: markdown.length,
      imported_at: new Date().toISOString(),
    },
    raw_text: markdown,
  };
}
