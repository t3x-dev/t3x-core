import { describe, expect, it } from 'vitest';
import { buildIntroDemoUrl } from '../urls.js';

describe('buildIntroDemoUrl', () => {
  it('points users at the guided intro demo route for the local web app', () => {
    expect(buildIntroDemoUrl('http://localhost:3000')).toBe(
      'http://localhost:3000/chat?introDemo=1'
    );
  });

  it('preserves custom local web ports', () => {
    expect(buildIntroDemoUrl('http://localhost:3100')).toBe(
      'http://localhost:3100/chat?introDemo=1'
    );
  });
});
