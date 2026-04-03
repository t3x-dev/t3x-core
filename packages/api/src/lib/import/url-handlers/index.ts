/**
 * Special URL Handlers
 *
 * Routes URLs to specialized parsers for known platforms
 * (GitHub, Reddit, Twitter/X, WeChat, Weibo).
 * Returns null if no handler matches, allowing fallback to generic URL parsing.
 */

import type { ParseResult } from '../types';
import { matchesGitHub, parseGitHubUrl } from './github';
import { matchesReddit, parseRedditUrl } from './reddit';
import { matchesTwitter, parseTwitterUrl } from './twitter';
import { matchesWeChat, parseWeChatUrl } from './wechat';
import { matchesWeibo, parseWeiboUrl } from './weibo';

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
  if (matchesTwitter(url)) {
    return parseTwitterUrl(url);
  }
  if (matchesWeChat(url)) {
    return parseWeChatUrl(url);
  }
  if (matchesWeibo(url)) {
    return parseWeiboUrl(url);
  }
  return null;
}
