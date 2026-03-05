/**
 * URL Handlers Tests
 *
 * Tests for Twitter/X, WeChat, and Weibo URL parsers.
 * Covers: URL pattern matching, HTML parsing, error handling.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { matchesTwitter, parseTwitterUrl } from '../../lib/import/url-handlers/twitter';
import { matchesWeChat, parseWeChatUrl } from '../../lib/import/url-handlers/wechat';
import { matchesWeibo, parseWeiboUrl } from '../../lib/import/url-handlers/weibo';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

afterEach(() => {
  vi.restoreAllMocks();
  mockFetch.mockReset();
});

// ---------------------------------------------------------------------------
// Helper: create a mock Response
// ---------------------------------------------------------------------------
function mockResponse(
  body: string | object,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const buffer = new TextEncoder().encode(text).buffer;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    text: () => Promise.resolve(text),
    arrayBuffer: () => Promise.resolve(buffer),
    json: () => Promise.resolve(typeof body === 'object' ? body : JSON.parse(body)),
  } as unknown as Response;
}

// ===========================================================================
// Twitter/X Parser
// ===========================================================================
describe('Twitter/X parser', () => {
  describe('matchesTwitter', () => {
    it('matches twitter.com status URLs', () => {
      expect(matchesTwitter('https://twitter.com/elonmusk/status/1234567890')).toBe(true);
      expect(matchesTwitter('https://www.twitter.com/jack/status/9876543210')).toBe(true);
      expect(matchesTwitter('http://twitter.com/user/status/111')).toBe(true);
    });

    it('matches x.com status URLs', () => {
      expect(matchesTwitter('https://x.com/elonmusk/status/1234567890')).toBe(true);
      expect(matchesTwitter('http://x.com/user/status/999')).toBe(true);
    });

    it('does not match non-status Twitter URLs', () => {
      expect(matchesTwitter('https://twitter.com/elonmusk')).toBe(false);
      expect(matchesTwitter('https://twitter.com/home')).toBe(false);
      expect(matchesTwitter('https://twitter.com/search?q=test')).toBe(false);
    });

    it('does not match unrelated URLs', () => {
      expect(matchesTwitter('https://example.com')).toBe(false);
      expect(matchesTwitter('https://reddit.com/r/test')).toBe(false);
      expect(matchesTwitter('https://nottwitter.com/user/status/123')).toBe(false);
    });
  });

  describe('parseTwitterUrl', () => {
    it('parses a tweet from oEmbed response', async () => {
      const oembedResponse = {
        html: '<blockquote><p>Hello world! This is a test tweet.</p>&mdash; Test User (@testuser) <a href="https://twitter.com/testuser/status/123">January 1, 2025</a></blockquote>',
        author_name: 'testuser',
        author_url: 'https://twitter.com/testuser',
        url: 'https://twitter.com/testuser/status/123',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(oembedResponse));

      const result = await parseTwitterUrl('https://twitter.com/testuser/status/123');

      expect(result.metadata.title).toBe('Tweet by @testuser');
      expect(result.metadata.author).toBe('testuser');
      expect(result.metadata.site_name).toBe('Twitter');
      expect(result.metadata.source_url).toBe('https://twitter.com/testuser/status/123');
      expect(result.raw_text).toContain('Hello world! This is a test tweet.');
      expect(result.paragraphs.length).toBeGreaterThan(0);
    });

    it('handles x.com URLs by normalizing to twitter.com for oEmbed', async () => {
      const oembedResponse = {
        html: '<blockquote><p>Post from X</p></blockquote>',
        author_name: 'xuser',
        author_url: 'https://twitter.com/xuser',
        url: 'https://twitter.com/xuser/status/456',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(oembedResponse));

      const result = await parseTwitterUrl('https://x.com/xuser/status/456');

      // Verify the oEmbed API was called with twitter.com URL
      const fetchUrl = mockFetch.mock.calls[0][0] as string;
      expect(fetchUrl).toContain('twitter.com');
      expect(result.metadata.author).toBe('xuser');
      expect(result.metadata.source_url).toBe('https://x.com/xuser/status/456');
    });

    it('throws on non-200 response', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Not Found', 404));

      await expect(parseTwitterUrl('https://twitter.com/user/status/999')).rejects.toThrow(
        /Twitter oEmbed API returned 404/
      );
    });

    it('throws on invalid URL', async () => {
      await expect(parseTwitterUrl('https://example.com')).rejects.toThrow('Invalid Twitter/X URL');
    });

    it('strips HTML tags from tweet text', async () => {
      const oembedResponse = {
        html: '<blockquote><p>Check out <a href="https://t.co/abc">this link</a> and <b>bold text</b></p></blockquote>',
        author_name: 'htmluser',
        author_url: 'https://twitter.com/htmluser',
        url: 'https://twitter.com/htmluser/status/789',
      };

      mockFetch.mockResolvedValueOnce(mockResponse(oembedResponse));

      const result = await parseTwitterUrl('https://twitter.com/htmluser/status/789');

      // Should not contain HTML tags
      expect(result.raw_text).not.toContain('<a');
      expect(result.raw_text).not.toContain('<b>');
      expect(result.raw_text).not.toContain('</');
    });
  });
});

// ===========================================================================
// WeChat Parser
// ===========================================================================
describe('WeChat parser', () => {
  describe('matchesWeChat', () => {
    it('matches WeChat article URLs', () => {
      expect(matchesWeChat('https://mp.weixin.qq.com/s/AbCdEf123456')).toBe(true);
      expect(matchesWeChat('http://mp.weixin.qq.com/s/xyz789')).toBe(true);
      expect(matchesWeChat('https://mp.weixin.qq.com/s/AbC_dEf-123')).toBe(true);
    });

    it('matches WeChat article URLs with query params', () => {
      expect(matchesWeChat('https://mp.weixin.qq.com/s/abc?from=timeline')).toBe(true);
    });

    it('does not match non-article WeChat URLs', () => {
      expect(matchesWeChat('https://mp.weixin.qq.com/')).toBe(false);
      expect(matchesWeChat('https://weixin.qq.com/s/abc')).toBe(false);
    });

    it('does not match unrelated URLs', () => {
      expect(matchesWeChat('https://example.com')).toBe(false);
      expect(matchesWeChat('https://twitter.com/user/status/123')).toBe(false);
    });
  });

  describe('parseWeChatUrl', () => {
    const sampleWeChatHtml = `
      <html>
      <head>
        <meta property="og:title" content="Test WeChat Article Title" />
        <meta property="og:description" content="A brief description of the article" />
        <meta name="author" content="TestAuthor" />
      </head>
      <body>
        <h1 class="rich_media_title">Test WeChat Article Title</h1>
        <span class="rich_media_meta_text">TestAuthor</span>
        <div id="js_content">
          <p>First paragraph of the article content.</p>
          <p>Second paragraph with more details about the topic.</p>
          <p>Third paragraph concluding the article.</p>
        </div>
      </body>
      </html>
    `;

    it('extracts title, author, and body from WeChat article', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(sampleWeChatHtml));

      const result = await parseWeChatUrl('https://mp.weixin.qq.com/s/test123');

      expect(result.metadata.title).toBe('Test WeChat Article Title');
      expect(result.metadata.author).toBe('TestAuthor');
      expect(result.metadata.site_name).toBe('WeChat');
      expect(result.raw_text).toContain('First paragraph');
      expect(result.raw_text).toContain('Second paragraph');
      expect(result.raw_text).toContain('Third paragraph');
      expect(result.paragraphs.length).toBeGreaterThan(0);
    });

    it('extracts title from h1 when og:title is missing', async () => {
      const html = `
        <html>
        <body>
          <h1 class="rich_media_title">Fallback Title</h1>
          <div id="js_content">
            <p>Some content here.</p>
          </div>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce(mockResponse(html));

      const result = await parseWeChatUrl('https://mp.weixin.qq.com/s/test456');

      expect(result.metadata.title).toBe('Fallback Title');
    });

    it('extracts author from profile_nickname span', async () => {
      const html = `
        <html>
        <head><meta property="og:title" content="Title" /></head>
        <body>
          <strong class="profile_nickname">NicknameAuthor</strong>
          <div id="js_content">
            <p>Body content.</p>
          </div>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce(mockResponse(html));

      const result = await parseWeChatUrl('https://mp.weixin.qq.com/s/test789');

      expect(result.metadata.author).toBe('NicknameAuthor');
    });

    it('falls back to og:description when js_content is empty', async () => {
      const html = `
        <html>
        <head>
          <meta property="og:title" content="Title Only" />
          <meta property="og:description" content="Description as fallback content" />
        </head>
        <body>
          <div id="js_content"></div>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce(mockResponse(html));

      const result = await parseWeChatUrl('https://mp.weixin.qq.com/s/fallback1');

      expect(result.raw_text).toContain('Description as fallback content');
    });

    it('throws when no content can be extracted', async () => {
      const html = '<html><body><div>Nothing useful</div></body></html>';

      mockFetch.mockResolvedValueOnce(mockResponse(html));

      await expect(parseWeChatUrl('https://mp.weixin.qq.com/s/empty1')).rejects.toThrow(
        'Could not extract content from WeChat article'
      );
    });

    it('throws on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Forbidden', 403));

      await expect(parseWeChatUrl('https://mp.weixin.qq.com/s/blocked1')).rejects.toThrow(
        /WeChat returned HTTP 403/
      );
    });

    it('strips HTML tags from extracted content', async () => {
      const html = `
        <html>
        <head><meta property="og:title" content="Clean Title" /></head>
        <body>
          <div id="js_content">
            <p>Text with <strong>bold</strong> and <a href="http://example.com">a link</a></p>
          </div>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce(mockResponse(html));

      const result = await parseWeChatUrl('https://mp.weixin.qq.com/s/htmltest');

      expect(result.raw_text).not.toContain('<strong>');
      expect(result.raw_text).not.toContain('<a href');
      expect(result.raw_text).toContain('bold');
      expect(result.raw_text).toContain('a link');
    });

    it('uses mobile User-Agent in fetch request', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(sampleWeChatHtml));

      await parseWeChatUrl('https://mp.weixin.qq.com/s/uatest');

      const fetchOptions = mockFetch.mock.calls[0][1] as RequestInit;
      const headers = fetchOptions.headers as Record<string, string>;
      expect(headers['User-Agent']).toContain('Mobile');
    });
  });
});

// ===========================================================================
// Weibo Parser
// ===========================================================================
describe('Weibo parser', () => {
  describe('matchesWeibo', () => {
    it('matches desktop weibo.com URLs', () => {
      expect(matchesWeibo('https://weibo.com/1234567890/abc123')).toBe(true);
      expect(matchesWeibo('https://www.weibo.com/user/status/def456')).toBe(true);
      expect(matchesWeibo('http://weibo.com/u/1234567890')).toBe(true);
    });

    it('matches mobile m.weibo.cn URLs', () => {
      expect(matchesWeibo('https://m.weibo.cn/detail/123456')).toBe(true);
      expect(matchesWeibo('https://m.weibo.cn/status/789012')).toBe(true);
    });

    it('does not match unrelated URLs', () => {
      expect(matchesWeibo('https://example.com')).toBe(false);
      expect(matchesWeibo('https://twitter.com/user/status/123')).toBe(false);
      expect(matchesWeibo('https://notweibo.com/post/123')).toBe(false);
    });
  });

  describe('parseWeiboUrl', () => {
    it('parses a Weibo post from API JSON response', async () => {
      const apiResponse = {
        ok: 1,
        data: {
          text: 'Hello from Weibo! This is a test post.',
          user: { screen_name: 'TestUser' },
          created_at: 'Mon Jan 01 12:00:00 +0800 2025',
          reposts_count: 10,
          comments_count: 5,
          attitudes_count: 100,
        },
      };

      mockFetch.mockResolvedValueOnce(mockResponse(apiResponse));

      const result = await parseWeiboUrl('https://m.weibo.cn/detail/123456');

      expect(result.metadata.title).toBe('Weibo by @TestUser');
      expect(result.metadata.author).toBe('TestUser');
      expect(result.metadata.site_name).toBe('Weibo');
      expect(result.raw_text).toContain('Hello from Weibo! This is a test post.');
      expect(result.raw_text).toContain('10 reposts');
      expect(result.raw_text).toContain('5 comments');
      expect(result.raw_text).toContain('100 likes');
      expect(result.paragraphs.length).toBeGreaterThan(0);
    });

    it('handles posts with images', async () => {
      const apiResponse = {
        ok: 1,
        data: {
          text: 'Post with images',
          user: { screen_name: 'PhotoUser' },
          pics: [{ url: 'https://img.weibo.cn/1.jpg' }, { url: 'https://img.weibo.cn/2.jpg' }],
        },
      };

      mockFetch.mockResolvedValueOnce(mockResponse(apiResponse));

      const result = await parseWeiboUrl('https://m.weibo.cn/detail/789');

      expect(result.raw_text).toContain('[2 image(s) attached]');
    });

    it('strips HTML from Weibo post text', async () => {
      const apiResponse = {
        ok: 1,
        data: {
          text: 'Text with <a href="/n/someone">@someone</a> and <br/>line break and <img alt="[smile]" src="..."/>',
          user: { screen_name: 'HtmlUser' },
        },
      };

      mockFetch.mockResolvedValueOnce(mockResponse(apiResponse));

      const result = await parseWeiboUrl('https://m.weibo.cn/detail/456');

      expect(result.raw_text).not.toContain('<a href');
      expect(result.raw_text).not.toContain('<br');
      expect(result.raw_text).not.toContain('<img');
      expect(result.raw_text).toContain('@someone');
      expect(result.raw_text).toContain('[smile]');
    });

    it('falls back to HTML parsing when API returns non-JSON', async () => {
      const htmlPage = `
        <html>
        <head>
          <meta property="og:title" content="Weibo Post Title" />
          <meta property="og:description" content="This is the post content from og:description" />
        </head>
        <body>Not JSON</body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce(mockResponse(htmlPage));

      const result = await parseWeiboUrl('https://weibo.com/user123/status/abc456');

      expect(result.raw_text).toContain('This is the post content from og:description');
      expect(result.metadata.extraction_quality).toBe('partial');
    });

    it('extracts post ID from desktop URL format', async () => {
      const apiResponse = {
        ok: 1,
        data: {
          text: 'Desktop URL post',
          user: { screen_name: 'DesktopUser' },
        },
      };

      mockFetch.mockResolvedValueOnce(mockResponse(apiResponse));

      const result = await parseWeiboUrl('https://weibo.com/user123/abc456');

      // The API should be called with the extracted ID
      const fetchUrl = mockFetch.mock.calls[0][0] as string;
      expect(fetchUrl).toContain('id=abc456');
      expect(result.metadata.author).toBe('DesktopUser');
    });

    it('throws on HTTP error from API', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Server Error', 500));

      await expect(parseWeiboUrl('https://m.weibo.cn/detail/999')).rejects.toThrow(
        /Weibo API returned HTTP 500/
      );
    });

    it('throws when post ID cannot be extracted', async () => {
      await expect(parseWeiboUrl('https://weibo.com/')).rejects.toThrow(
        'Could not extract post ID from Weibo URL'
      );
    });

    it('handles API response with ok=0 by falling back to HTML', async () => {
      const apiResponse = { ok: 0, data: null };

      mockFetch.mockResolvedValueOnce(mockResponse(JSON.stringify(apiResponse)));

      // The fallback HTML parser will try to extract from the JSON string
      // which has no og tags, so it should throw
      await expect(parseWeiboUrl('https://m.weibo.cn/detail/nope')).rejects.toThrow(
        /Could not extract content/
      );
    });
  });
});

// ===========================================================================
// Integration: trySpecialUrlParse
// ===========================================================================
describe('trySpecialUrlParse integration', () => {
  it('returns null for unknown URLs', async () => {
    const { trySpecialUrlParse } = await import('../../lib/import/url-handlers/index');

    const result = await trySpecialUrlParse('https://example.com/page');
    expect(result).toBeNull();
  });
});
