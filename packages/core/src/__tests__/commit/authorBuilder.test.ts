/**
 * Author Builder Tests
 */

import { describe, expect, it, vi } from 'vitest';
import { getDockerAuthor, getLocalAuthor, getWebAuthor } from '../../commit/authorBuilder';

describe('getLocalAuthor', () => {
  it('uses T3X_AUTHOR_NAME env var when set', () => {
    const orig = process.env.T3X_AUTHOR_NAME;
    process.env.T3X_AUTHOR_NAME = 'TestUser';
    try {
      const author = getLocalAuthor();
      expect(author.name).toBe('TestUser');
      expect(author.identity).toBe('local:TestUser');
      expect(author.verification).toBe('none');
    } finally {
      if (orig !== undefined) process.env.T3X_AUTHOR_NAME = orig;
      else delete process.env.T3X_AUTHOR_NAME;
    }
  });

  it('falls back to OS username when env not set', () => {
    const orig = process.env.T3X_AUTHOR_NAME;
    delete process.env.T3X_AUTHOR_NAME;
    try {
      const author = getLocalAuthor();
      expect(author.name).toBeTruthy();
      expect(author.identity).toMatch(/^local:/);
      expect(author.verification).toBe('none');
    } finally {
      if (orig !== undefined) process.env.T3X_AUTHOR_NAME = orig;
    }
  });
});

describe('getDockerAuthor', () => {
  it('uses first 8 chars of container ID', () => {
    const author = getDockerAuthor('abc123defgh456');
    expect(author.name).toBe('container-abc123de');
    expect(author.identity).toBe('device:abc123defgh456');
    expect(author.verification).toBe('device');
  });

  it('handles short container ID', () => {
    const author = getDockerAuthor('abc');
    expect(author.name).toBe('container-abc');
  });
});

describe('getWebAuthor', () => {
  it('uses session name and email', () => {
    const author = getWebAuthor({ name: 'Alice', email: 'alice@example.com' });
    expect(author.name).toBe('Alice');
    expect(author.identity).toBe('email:alice@example.com');
    expect(author.verification).toBe('verified');
  });
});
