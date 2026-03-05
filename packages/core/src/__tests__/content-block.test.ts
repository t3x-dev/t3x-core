import { describe, expect, it } from 'vitest';
import {
  type ContentBlock,
  isTextOnly,
  textFromBlocks,
  textToBlocks,
} from '../multimodal/contentBlock';

describe('textFromBlocks', () => {
  it('extracts text from text blocks', () => {
    const blocks: ContentBlock[] = [{ type: 'text', text: 'Hello world' }];
    expect(textFromBlocks(blocks)).toBe('Hello world');
  });

  it('extracts OCR text from image blocks with alt', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'image',
        url: 'https://example.com/photo.png',
        alt: 'A chart',
        ocr_text: 'Revenue grew 20% in Q3',
      },
    ];
    expect(textFromBlocks(blocks)).toBe('[Image: A chart] Revenue grew 20% in Q3');
  });

  it('uses alt text fallback for images without OCR', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'image',
        url: 'https://example.com/photo.png',
        alt: 'Company logo',
      },
    ];
    expect(textFromBlocks(blocks)).toBe('[Image: Company logo]');
  });

  it("uses 'image' as default when no alt or OCR", () => {
    const blocks: ContentBlock[] = [
      {
        type: 'image',
        url: 'https://example.com/photo.png',
      },
    ];
    expect(textFromBlocks(blocks)).toBe('[Image: image]');
  });

  it('extracts transcript from audio blocks', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'audio',
        url: 'https://example.com/recording.mp3',
        transcript: 'Welcome to the meeting',
        duration_ms: 5000,
      },
    ];
    expect(textFromBlocks(blocks)).toBe('[Audio] Welcome to the meeting');
  });

  it('uses duration fallback for audio without transcript', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'audio',
        url: 'https://example.com/recording.mp3',
        duration_ms: 12500,
      },
    ];
    expect(textFromBlocks(blocks)).toBe('[Audio: 12500ms]');
  });

  it('uses 0ms when audio has neither transcript nor duration', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'audio',
        url: 'https://example.com/recording.mp3',
      },
    ];
    expect(textFromBlocks(blocks)).toBe('[Audio: 0ms]');
  });

  it('extracts filename from file blocks', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'file',
        url: 'https://example.com/report.pdf',
        filename: 'report.pdf',
        mime_type: 'application/pdf',
      },
    ];
    expect(textFromBlocks(blocks)).toBe('[File: report.pdf]');
  });

  it('joins multiple blocks with newlines', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', text: 'First line' },
      { type: 'text', text: 'Second line' },
    ];
    expect(textFromBlocks(blocks)).toBe('First line\nSecond line');
  });

  it('returns empty string for empty array', () => {
    expect(textFromBlocks([])).toBe('');
  });

  it('handles mixed block types (text + image + audio + file)', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', text: 'Check this out' },
      {
        type: 'image',
        url: 'https://example.com/chart.png',
        alt: 'Sales chart',
        ocr_text: 'Q4 sales up 15%',
      },
      {
        type: 'audio',
        url: 'https://example.com/note.mp3',
        transcript: 'Remember to follow up',
      },
      {
        type: 'file',
        url: 'https://example.com/data.csv',
        filename: 'data.csv',
        mime_type: 'text/csv',
      },
    ];
    const result = textFromBlocks(blocks);
    const lines = result.split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('Check this out');
    expect(lines[1]).toBe('[Image: Sales chart] Q4 sales up 15%');
    expect(lines[2]).toBe('[Audio] Remember to follow up');
    expect(lines[3]).toBe('[File: data.csv]');
  });
});

describe('textToBlocks', () => {
  it('wraps text in single TextBlock array', () => {
    const result = textToBlocks('Hello world');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ type: 'text', text: 'Hello world' });
  });

  it('preserves the text content exactly', () => {
    const input = '  leading spaces\ttabs\nnewlines  ';
    const result = textToBlocks(input);
    expect(result[0].text).toBe(input);
  });
});

describe('isTextOnly', () => {
  it('returns true for single text block', () => {
    const blocks: ContentBlock[] = [{ type: 'text', text: 'Hello' }];
    expect(isTextOnly(blocks)).toBe(true);
  });

  it('returns false for single image block', () => {
    const blocks: ContentBlock[] = [{ type: 'image', url: 'https://example.com/img.png' }];
    expect(isTextOnly(blocks)).toBe(false);
  });

  it('returns false for multiple blocks (even if all text)', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', text: 'First' },
      { type: 'text', text: 'Second' },
    ];
    expect(isTextOnly(blocks)).toBe(false);
  });

  it('returns false for empty array', () => {
    expect(isTextOnly([])).toBe(false);
  });
});
