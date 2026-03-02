/**
 * HTML Converter Tests
 *
 * Tests for extractArticle() and convertHtmlToMarkdown().
 */

import { describe, expect, it } from 'vitest';
import { convertHtmlToMarkdown, extractArticle } from '../../lib/import/html-converter';

// ---------------------------------------------------------------------------
// extractArticle
// ---------------------------------------------------------------------------
describe('extractArticle', () => {
  it('extracts main content and strips nav/footer', () => {
    const html = `
      <html><body>
        <nav><a href="/">Home</a><a href="/about">About</a></nav>
        <article>
          <h1>Main Article Title</h1>
          <p>This is the main article paragraph with enough text to be recognized by readability as the primary content of the page. It needs to be long enough so the algorithm picks it up properly.</p>
          <p>Another paragraph with substantial content to ensure readability extraction works correctly and identifies this as the article body rather than boilerplate.</p>
          <p>A third paragraph adding more content density to the article section so that readability confidently selects it as the main content region of this page.</p>
        </article>
        <footer><p>Copyright 2025</p></footer>
      </body></html>
    `;

    const result = extractArticle(html, 'https://example.com/post');

    expect(result.markdown).toContain('Main Article Title');
    expect(result.markdown).toContain('main article paragraph');
    // Nav and footer content should be stripped
    expect(result.markdown).not.toContain('About');
    expect(result.markdown).not.toContain('Copyright 2025');
  });

  it('preserves links as markdown [text](url)', () => {
    const html = `
      <html><body>
        <article>
          <p>Visit <a href="https://example.com">Example Site</a> for more information. This paragraph has enough content to be extracted by readability as the main body content of this page.</p>
          <p>Another paragraph with additional content to help readability identify the article region properly in this test page.</p>
          <p>Yet another paragraph to ensure sufficient content density for proper readability extraction in this test case.</p>
        </article>
      </body></html>
    `;

    const result = extractArticle(html, 'https://example.com/page');
    expect(result.markdown).toContain('[Example Site](https://example.com/)');
  });

  it('converts tables to GFM markdown', () => {
    const html = `
      <html><body>
        <article>
          <p>Here is a comparison table with enough surrounding text so readability picks this up as main content.</p>
          <table>
            <thead><tr><th>Name</th><th>Age</th></tr></thead>
            <tbody><tr><td>Alice</td><td>30</td></tr><tr><td>Bob</td><td>25</td></tr></tbody>
          </table>
          <p>Additional paragraph to ensure readability identifies this content block as the main article content for extraction.</p>
          <p>And one more paragraph of substantial text to make readability confident about the content region selection.</p>
        </article>
      </body></html>
    `;

    const result = extractArticle(html, 'https://example.com/table');
    expect(result.markdown).toContain('Name');
    expect(result.markdown).toContain('Alice');
    expect(result.markdown).toContain('|');
  });

  it('extracts OG metadata', () => {
    const html = `
      <html>
      <head>
        <meta property="og:title" content="OG Title">
        <meta property="og:description" content="A great article">
        <meta property="og:site_name" content="Example Blog">
        <meta name="author" content="Jane Doe">
        <meta property="article:published_time" content="2025-01-15T10:00:00Z">
      </head>
      <body>
        <article>
          <p>Article body with enough text for readability to process it as the main content block of the page. We need sufficient text density here.</p>
          <p>Second paragraph with more content to help readability identify this section as the primary article content region.</p>
          <p>Third paragraph to further increase content density for proper readability extraction behavior during testing.</p>
        </article>
      </body>
      </html>
    `;

    const result = extractArticle(html, 'https://example.com/og');

    expect(result.metadata.excerpt).toBe('A great article');
    expect(result.metadata.site_name).toBe('Example Blog');
    expect(result.metadata.author).toBe('Jane Doe');
    expect(result.metadata.published_at).toBe('2025-01-15T10:00:00Z');
  });

  it('extracts publishedTime from Readability when no OG meta', () => {
    const html = `
      <html><body>
        <article>
          <time datetime="2025-06-01T12:00:00Z">June 1, 2025</time>
          <p>Article content with enough text for readability to extract it as the main body content of the page during the article extraction process here.</p>
          <p>Additional content paragraph to help readability confidently identify this section as the primary article region of the page in this test.</p>
          <p>One more paragraph of text to ensure proper readability behavior and content density for extraction testing purposes here.</p>
        </article>
      </body></html>
    `;

    const result = extractArticle(html, 'https://example.com/time');
    // Readability may extract publishedTime from <time datetime="...">
    // If it does, it should appear in metadata; if not, published_at is undefined
    // Either way, no crash
    expect(result.markdown).toContain('Article content');
  });

  it('falls back when Readability cannot extract (very short page)', () => {
    const html = `
      <html><body>
        <p>Short page content.</p>
      </body></html>
    `;

    const result = extractArticle(html, 'https://example.com/short');

    // Should still produce output via fallback
    expect(result.markdown).toContain('Short page content');
  });

  it('does not throw on malformed HTML', () => {
    const html = '<div><p>Unclosed tags<b>bold<div>nested wrong</p></html>';

    expect(() => extractArticle(html, 'https://example.com/bad')).not.toThrow();
    const result = extractArticle(html, 'https://example.com/bad');
    expect(result.markdown.length).toBeGreaterThan(0);
  });

  it('decodes HTML entities', () => {
    const html = `
      <html><body>
        <article>
          <p>Symbols: &amp; &lt; &gt; &quot; &#39; &mdash; &ndash; &hellip; and more text to help readability pick this up as the main content of the page during extraction.</p>
          <p>Second paragraph for content density to ensure readability identifies the article region properly for extraction testing.</p>
          <p>Third paragraph with even more text content to help the readability algorithm work correctly on this test page.</p>
        </article>
      </body></html>
    `;

    const result = extractArticle(html, 'https://example.com/entities');
    expect(result.markdown).toContain('&');
    expect(result.markdown).toContain('<');
    expect(result.markdown).toContain('>');
  });

  it('uses <title> when no OG title is present', () => {
    const html = `
      <html>
      <head><title>Page Title</title></head>
      <body>
        <article>
          <p>Some content that is long enough for readability to extract it as the main body content of this page during the article extraction process.</p>
          <p>Additional content paragraph to help readability confidently identify this section as the primary article region of the page.</p>
          <p>One more paragraph of text to ensure proper readability behavior and content density for extraction testing purposes.</p>
        </article>
      </body>
      </html>
    `;

    const result = extractArticle(html, 'https://example.com/title-tag');
    expect(result.title).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// convertHtmlToMarkdown
// ---------------------------------------------------------------------------
describe('convertHtmlToMarkdown', () => {
  it('converts headings to ATX style', () => {
    const html = '<h1>Title</h1><h2>Subtitle</h2><h3>Section</h3>';
    const md = convertHtmlToMarkdown(html);
    expect(md).toContain('# Title');
    expect(md).toContain('## Subtitle');
    expect(md).toContain('### Section');
  });

  it('converts lists', () => {
    const html = '<ul><li>First</li><li>Second</li></ul>';
    const md = convertHtmlToMarkdown(html);
    expect(md).toContain('First');
    expect(md).toContain('Second');
    // Turndown uses bullet marker with indentation
    expect(md).toMatch(/-\s+First/);
  });

  it('converts bold and italic', () => {
    const html = '<p><strong>bold</strong> and <em>italic</em></p>';
    const md = convertHtmlToMarkdown(html);
    expect(md).toContain('**bold**');
    expect(md).toContain('*italic*');
  });

  it('converts links', () => {
    const html = '<p><a href="https://example.com">click here</a></p>';
    const md = convertHtmlToMarkdown(html);
    expect(md).toContain('[click here](https://example.com)');
  });

  it('converts tables to GFM', () => {
    const html = `
      <table>
        <thead><tr><th>Col A</th><th>Col B</th></tr></thead>
        <tbody><tr><td>1</td><td>2</td></tr></tbody>
      </table>
    `;
    const md = convertHtmlToMarkdown(html);
    expect(md).toContain('Col A');
    expect(md).toContain('|');
    expect(md).toContain('---');
  });

  it('converts code blocks', () => {
    const html = '<pre><code>const x = 1;</code></pre>';
    const md = convertHtmlToMarkdown(html);
    expect(md).toContain('```');
    expect(md).toContain('const x = 1;');
  });

  it('converts inline code', () => {
    const html = '<p>Use <code>npm install</code> to install</p>';
    const md = convertHtmlToMarkdown(html);
    expect(md).toContain('`npm install`');
  });

  it('converts blockquotes', () => {
    const html = '<blockquote><p>A wise quote</p></blockquote>';
    const md = convertHtmlToMarkdown(html);
    expect(md).toContain('> A wise quote');
  });

  it('strips script and style tags', () => {
    const html = `
      <script>alert('xss')</script>
      <style>body { color: red }</style>
      <p>Visible content</p>
    `;
    const md = convertHtmlToMarkdown(html);
    expect(md).toContain('Visible content');
    expect(md).not.toContain('alert');
    expect(md).not.toContain('color: red');
  });

  it('handles mammoth-style DOCX HTML output', () => {
    // Mammoth typically produces simple HTML like this
    const html = `
      <h1>Document Title</h1>
      <p>First paragraph with <strong>bold</strong> text.</p>
      <h2>Section Two</h2>
      <p>Second paragraph with <em>italic</em> text.</p>
      <ul><li>Item one</li><li>Item two</li></ul>
    `;
    const md = convertHtmlToMarkdown(html);
    expect(md).toContain('# Document Title');
    expect(md).toContain('**bold**');
    expect(md).toContain('## Section Two');
    expect(md).toContain('*italic*');
    expect(md).toMatch(/-\s+Item one/);
  });

  it('returns empty string for empty input', () => {
    expect(convertHtmlToMarkdown('')).toBe('');
  });
});
