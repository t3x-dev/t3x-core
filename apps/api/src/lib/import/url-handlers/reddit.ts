/**
 * Reddit URL Handler
 *
 * Parses Reddit threads by appending .json to the URL (native Reddit JSON API).
 * Flattens comment trees into a paragraph list.
 */

import { sha256 } from '@t3x/core';
import { splitIntoParagraphs } from '../paragraph-splitter';
import type { ParseResult } from '../types';

const USER_AGENT = 'T3X-Importer/1.0';

/** Match Reddit thread URLs */
const REDDIT_PATTERN = /^https?:\/\/(www\.|old\.|new\.)?reddit\.com\/r\/([^/]+)\/comments\/([^/]+)/;

interface RedditListing {
  kind: string;
  data: {
    children: Array<{
      kind: string;
      data: {
        title?: string;
        selftext?: string;
        author?: string;
        created_utc?: number;
        body?: string;
        replies?: RedditListing | '';
        score?: number;
        depth?: number;
      };
    }>;
  };
}

export function matchesReddit(url: string): boolean {
  return REDDIT_PATTERN.test(url);
}

export async function parseRedditUrl(url: string): Promise<ParseResult> {
  // Normalize URL and append .json
  const cleanUrl = url.replace(/\?.*$/, '').replace(/\/$/, '');
  const jsonUrl = `${cleanUrl}.json`;

  const response = await fetch(jsonUrl, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`Reddit API returned ${response.status}`);
  }

  const data = (await response.json()) as RedditListing[];
  if (!Array.isArray(data) || data.length < 1) {
    throw new Error('Invalid Reddit response format');
  }

  // First listing is the post, second is comments
  const postData = data[0]?.data?.children?.[0]?.data;
  if (!postData) throw new Error('Could not extract Reddit post');

  const lines: string[] = [];

  // Post title and body
  lines.push(`# ${postData.title ?? 'Untitled'}`);
  lines.push('');
  lines.push(`**u/${postData.author ?? 'unknown'}** · r/${url.match(REDDIT_PATTERN)?.[2] ?? ''}`);
  lines.push('');

  if (postData.selftext?.trim()) {
    lines.push(postData.selftext.trim());
    lines.push('');
  }

  // Flatten comment tree
  if (data.length > 1) {
    const comments = data[1];
    flattenComments(comments, lines, 0);
  }

  const markdown = lines.join('\n');
  const paragraphs = splitIntoParagraphs(markdown);
  const contentHash = sha256(markdown);

  return {
    paragraphs,
    metadata: {
      source_type: 'url',
      source_url: url,
      title: postData.title ?? 'Reddit Thread',
      author: postData.author,
      content_hash: contentHash,
      content_length: markdown.length,
      imported_at: new Date().toISOString(),
    },
    raw_text: markdown,
  };
}

function flattenComments(listing: RedditListing, lines: string[], depth: number): void {
  if (!listing?.data?.children) return;

  for (const child of listing.data.children) {
    if (child.kind !== 't1' || !child.data.body?.trim()) continue;

    const prefix = '> '.repeat(Math.min(depth, 3));
    const author = child.data.author ?? 'unknown';

    lines.push('---');
    lines.push('');
    lines.push(`${prefix}**u/${author}**`);
    lines.push('');

    // Add blockquote prefix to each line for nested comments
    const bodyLines = child.data.body.trim().split('\n');
    for (const line of bodyLines) {
      lines.push(`${prefix}${line}`);
    }
    lines.push('');

    // Recurse into replies
    if (child.data.replies && typeof child.data.replies === 'object') {
      flattenComments(child.data.replies, lines, depth + 1);
    }
  }
}
