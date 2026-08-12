import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CREDENTIAL_ENCRYPTION_KEY_ENV,
  CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_ENV,
  decryptCredential,
  encryptCredential,
  isEncryptedCredential,
} from '../lib/credential-encryption';

const key = (fill: number): string => Buffer.alloc(32, fill).toString('base64');

describe('credential envelope encryption', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses randomized authenticated envelopes without exposing plaintext', () => {
    vi.stubEnv(CREDENTIAL_ENCRYPTION_KEY_ENV, key(1));
    const first = encryptCredential('secret-value', 'provider:openai:api-key');
    const second = encryptCredential('secret-value', 'provider:openai:api-key');

    expect(isEncryptedCredential(first)).toBe(true);
    expect(first).not.toContain('secret-value');
    expect(second).not.toBe(first);
    expect(decryptCredential(first, 'provider:openai:api-key')).toEqual({
      plaintext: 'secret-value',
      needsRotation: false,
    });
  });

  it('binds an envelope to its record context', () => {
    vi.stubEnv(CREDENTIAL_ENCRYPTION_KEY_ENV, key(2));
    const encrypted = encryptCredential('secret-value', 'provider:openai:api-key');

    expect(() => decryptCredential(encrypted, 'provider:anthropic:api-key')).toThrow(
      'authentication failed'
    );
  });

  it('rejects ciphertext tampering', () => {
    vi.stubEnv(CREDENTIAL_ENCRYPTION_KEY_ENV, key(3));
    const parts = encryptCredential('secret-value', 'deploy-agent:a1:auth').split(':');
    const ciphertext = parts.at(-1)!;
    parts[parts.length - 1] = `${ciphertext[0] === 'A' ? 'B' : 'A'}${ciphertext.slice(1)}`;

    expect(() => decryptCredential(parts.join(':'), 'deploy-agent:a1:auth')).toThrow(
      'authentication failed'
    );
  });

  it('does not reinterpret malformed envelopes as legacy plaintext', () => {
    vi.stubEnv(CREDENTIAL_ENCRYPTION_KEY_ENV, key(3));

    expect(() =>
      decryptCredential('t3xenc:v2:not-a-valid-envelope', 'provider:openai:api-key')
    ).toThrow('unsupported or malformed');
  });

  it('supports previous keys and marks their envelopes for rotation', () => {
    const previousKey = key(4);
    vi.stubEnv(CREDENTIAL_ENCRYPTION_KEY_ENV, previousKey);
    const encrypted = encryptCredential('secret-value', 'provider:google:api-key');

    vi.stubEnv(CREDENTIAL_ENCRYPTION_KEY_ENV, key(5));
    vi.stubEnv(CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_ENV, previousKey);
    expect(decryptCredential(encrypted, 'provider:google:api-key')).toEqual({
      plaintext: 'secret-value',
      needsRotation: true,
    });
  });

  it('requires a valid current key for new and legacy credentials', () => {
    vi.stubEnv(CREDENTIAL_ENCRYPTION_KEY_ENV, '');

    expect(() => encryptCredential('secret-value', 'provider:openai:api-key')).toThrow(
      CREDENTIAL_ENCRYPTION_KEY_ENV
    );
    expect(() => decryptCredential('legacy-plaintext', 'provider:openai:api-key')).toThrow(
      CREDENTIAL_ENCRYPTION_KEY_ENV
    );
  });
});
