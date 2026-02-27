/**
 * GitHub URL Handler
 *
 * Parses GitHub issues and pull requests via the REST API.
 * No authentication needed for public repositories.
 */

import { sha256 } from '@t3x/core';
import { splitIntoParagraphs } from '../paragraph-splitter';
import type { ParseResult } from '../types';

const GITHUB_API = 'https://api.github.com';
const USER_AGENT = 'T3X-Importer/1.0';

/** Match GitHub issue/PR URLs */
const GITHUB_PATTERN = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)/;

interface GitHubIssue {
  title: string;
  body: string | null;
  user: { login: string };
  created_at: string;
  state: string;
  html_url: string;
}

interface GitHubComment {
  body: string;
  user: { login: string };
  created_at: string;
}

export function matchesGitHub(url: string): boolean {
  return GITHUB_PATTERN.test(url);
}

export async function parseGitHubUrl(url: string): Promise<ParseResult> {
  const match = url.match(GITHUB_PATTERN);
  if (!match) throw new Error('Invalid GitHub URL');

  const [, owner, repo, type, number] = match;
  const isPR = type === 'pull';

  // Fetch issue/PR data
  const issueUrl = `${GITHUB_API}/repos/${owner}/${repo}/issues/${number}`;
  const [issueRes, commentsRes] = await Promise.all([
    fetch(issueUrl, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } }),
    fetch(`${issueUrl}/comments?per_page=100`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    }),
  ]);

  if (!issueRes.ok) {
    throw new Error(`GitHub API returned ${issueRes.status}: ${await issueRes.text()}`);
  }

  const issue = (await issueRes.json()) as GitHubIssue;
  const comments: GitHubComment[] = commentsRes.ok
    ? ((await commentsRes.json()) as GitHubComment[])
    : [];

  // Build markdown content
  const lines: string[] = [];
  const label = isPR ? 'Pull Request' : 'Issue';

  lines.push(`# ${issue.title}`);
  lines.push('');
  lines.push(
    `**${label} #${number}** by @${issue.user.login} · ${issue.state} · ${issue.created_at}`
  );
  lines.push('');

  if (issue.body?.trim()) {
    lines.push(issue.body.trim());
    lines.push('');
  }

  for (const comment of comments) {
    if (!comment.body?.trim()) continue;
    lines.push(`---`);
    lines.push('');
    lines.push(`**@${comment.user.login}** · ${comment.created_at}`);
    lines.push('');
    lines.push(comment.body.trim());
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
      title: `${issue.title} · ${label} #${number} · ${owner}/${repo}`,
      author: issue.user.login,
      content_hash: contentHash,
      content_length: markdown.length,
      imported_at: new Date().toISOString(),
    },
    raw_text: markdown,
  };
}
