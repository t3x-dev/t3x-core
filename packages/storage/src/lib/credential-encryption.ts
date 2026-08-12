import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const CREDENTIAL_ENCRYPTION_KEY_ENV = 'T3X_CREDENTIAL_ENCRYPTION_KEY';
export const CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_ENV = 'T3X_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS';

const ENVELOPE_PREFIX = 't3xenc:v1:';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

interface SealedValue {
  iv: Buffer;
  tag: Buffer;
  ciphertext: Buffer;
}

interface MasterKey {
  id: string;
  value: Buffer;
}

export interface DecryptedCredential {
  plaintext: string;
  /** True for legacy plaintext or an envelope encrypted by a previous key. */
  needsRotation: boolean;
}

export class CredentialEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CredentialEncryptionError';
  }
}

function decodeMasterKey(encoded: string, envName: string): MasterKey {
  const normalized = encoded.trim();
  const value = Buffer.from(normalized, 'base64');
  if (
    !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized) ||
    normalized.length % 4 !== 0 ||
    value.length !== KEY_BYTES ||
    value.toString('base64') !== normalized
  ) {
    throw new CredentialEncryptionError(
      `${envName} must be a base64-encoded ${KEY_BYTES}-byte key`
    );
  }
  return {
    id: createHash('sha256').update(value).digest('hex').slice(0, 16),
    value,
  };
}

function currentMasterKey(): MasterKey {
  const encoded = process.env[CREDENTIAL_ENCRYPTION_KEY_ENV];
  if (!encoded) {
    throw new CredentialEncryptionError(
      `${CREDENTIAL_ENCRYPTION_KEY_ENV} is required to store or read database credentials`
    );
  }
  return decodeMasterKey(encoded, CREDENTIAL_ENCRYPTION_KEY_ENV);
}

function configuredMasterKeys(): MasterKey[] {
  const current = currentMasterKey();
  const previous = (process.env[CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_ENV] ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => decodeMasterKey(entry, CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_ENV));
  return [current, ...previous.filter((entry) => entry.id !== current.id)];
}

function seal(key: Buffer, plaintext: Buffer, aad: string): SealedValue {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), ciphertext };
}

function open(key: Buffer, sealed: SealedValue, aad: string): Buffer {
  if (sealed.iv.length !== IV_BYTES || sealed.tag.length !== TAG_BYTES) {
    throw new CredentialEncryptionError('Credential envelope has invalid authenticated data');
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, sealed.iv);
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(sealed.tag);
    return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]);
  } catch {
    throw new CredentialEncryptionError('Credential envelope authentication failed');
  }
}

function encode(value: Buffer): string {
  return value.toString('base64url');
}

function decode(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) {
    throw new CredentialEncryptionError('Credential envelope is malformed');
  }
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value) {
    throw new CredentialEncryptionError('Credential envelope is malformed');
  }
  return decoded;
}

export function isEncryptedCredential(value: string): boolean {
  return value.startsWith(ENVELOPE_PREFIX);
}

export function encryptCredential(plaintext: string, context: string): string {
  const masterKey = currentMasterKey();
  const dataKey = randomBytes(KEY_BYTES);
  const wrappedKey = seal(masterKey.value, dataKey, `t3x-credential:v1:key:${context}`);
  const encryptedData = seal(
    dataKey,
    Buffer.from(plaintext, 'utf8'),
    `t3x-credential:v1:data:${context}`
  );

  return [
    't3xenc',
    'v1',
    masterKey.id,
    encode(wrappedKey.iv),
    encode(wrappedKey.tag),
    encode(wrappedKey.ciphertext),
    encode(encryptedData.iv),
    encode(encryptedData.tag),
    encode(encryptedData.ciphertext),
  ].join(':');
}

export function decryptCredential(value: string, context: string): DecryptedCredential {
  if (!isEncryptedCredential(value)) {
    if (value.startsWith('t3xenc:')) {
      throw new CredentialEncryptionError(
        'Credential envelope version is unsupported or malformed'
      );
    }
    // Require the current key before returning legacy plaintext so callers can
    // immediately rewrite it as an encrypted envelope.
    currentMasterKey();
    return { plaintext: value, needsRotation: true };
  }

  const parts = value.split(':');
  if (parts.length !== 9 || `${parts[0]}:${parts[1]}:` !== ENVELOPE_PREFIX) {
    throw new CredentialEncryptionError('Credential envelope is malformed');
  }

  const [, , keyId, wrappedIv, wrappedTag, wrappedCiphertext, dataIv, dataTag, ciphertext] = parts;
  const keys = configuredMasterKeys();
  const key = keys.find((candidate) => candidate.id === keyId);
  if (!key) {
    throw new CredentialEncryptionError('No configured key can decrypt credential envelope');
  }

  const dataKey = open(
    key.value,
    {
      iv: decode(wrappedIv),
      tag: decode(wrappedTag),
      ciphertext: decode(wrappedCiphertext),
    },
    `t3x-credential:v1:key:${context}`
  );
  if (dataKey.length !== KEY_BYTES) {
    throw new CredentialEncryptionError('Credential envelope contains an invalid data key');
  }

  const plaintext = open(
    dataKey,
    {
      iv: decode(dataIv),
      tag: decode(dataTag),
      ciphertext: decode(ciphertext),
    },
    `t3x-credential:v1:data:${context}`
  ).toString('utf8');

  return {
    plaintext,
    needsRotation: key.id !== keys[0].id,
  };
}
