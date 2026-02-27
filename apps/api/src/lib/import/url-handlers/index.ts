/**
 * Special URL Handlers
 *
 * Routes URLs to specialized parsers for known platforms (GitHub, Reddit).
 * Returns null if no handler matches, allowing fallback to generic URL parsing.
 */

import type { ParseResult } from '../types';
import { matchesGitHub, parseGitHubUrl } from './github';
import { matchesReddit, parseRedditUrl } from './reddit';

/**
 * Try to parse a URL using a specialized handler.
 * Returns null if no handler matches the URL pattern.
 */
export async function trySpecialUrlParse(url: string): Promise<ParseResult | null> {
  if (matchesGitHub(url)) {
    return parseGitHubUrl(url);
  }
  if (matchesReddit(url)) {
    return parseRedditUrl(url);
  }
  return null;
}
