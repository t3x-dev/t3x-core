import { afterEach, describe, expect, it } from 'vitest';
import {
  buildSignedN8nCallbackUrl,
  signN8nCallback,
  verifyN8nCallbackSignature,
  verifyRunnerBearer,
} from '../service-auth.js';

const originalToken = process.env.RUNNER_SERVICE_TOKEN;
const originalLegacyToken = process.env.RUNNER_SECRET;

afterEach(() => {
  if (originalToken === undefined) delete process.env.RUNNER_SERVICE_TOKEN;
  else process.env.RUNNER_SERVICE_TOKEN = originalToken;
  if (originalLegacyToken === undefined) delete process.env.RUNNER_SECRET;
  else process.env.RUNNER_SECRET = originalLegacyToken;
});

describe('runner service authentication', () => {
  it('fails closed when the shared service token is not configured', () => {
    delete process.env.RUNNER_SERVICE_TOKEN;
    delete process.env.RUNNER_SECRET;
    expect(verifyRunnerBearer(undefined)).toBe('missing-config');
  });

  it('accepts only the configured bearer token', () => {
    process.env.RUNNER_SERVICE_TOKEN = 'service-secret';
    expect(verifyRunnerBearer('Bearer service-secret')).toBe('ok');
    expect(verifyRunnerBearer('Bearer wrong')).toBe('invalid');
  });

  it('creates a per-run callback capability that cannot be replayed for another run', () => {
    process.env.RUNNER_SERVICE_TOKEN = 'service-secret';
    const signature = signN8nCallback('run_1', 'runner_1');
    expect(verifyN8nCallbackSignature(signature, 'run_1', 'runner_1')).toBe('ok');
    expect(verifyN8nCallbackSignature(signature, 'run_2', 'runner_1')).toBe('invalid');

    const url = new URL(
      buildSignedN8nCallbackUrl('http://runner:8080/callbacks/n8n', 'run_1', 'runner_1')
    );
    expect(url.searchParams.get('runner_signature')).toBe(signature);
  });
});
