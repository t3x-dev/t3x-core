import { describe, expect, it } from 'vitest';
import { buildIntroDemoUrl, INTRO_DEMO_WEBUI_ENTRY_PATH } from '../urls.js';

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

  it('leaves all demo flow stage routing inside the WebUI', () => {
    const url = new URL(buildIntroDemoUrl('http://localhost:3000'));

    expect(url.pathname).toBe(INTRO_DEMO_WEBUI_ENTRY_PATH);
    expect([...url.searchParams.entries()]).toEqual([['introDemo', '1']]);
    expect(url.searchParams.has('introDemoStage')).toBe(false);
    expect(url.pathname).not.toContain('/project/');
    expect(url.pathname).not.toContain('/leaf/');
  });
});
