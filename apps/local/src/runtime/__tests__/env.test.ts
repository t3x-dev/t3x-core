import { describe, expect, it } from 'vitest';
import { buildApiEnv, buildWebEnv, LOCAL_RUNTIME_HOST } from '../env.js';

const options = {
  dataDir: '/tmp/t3x-local-test',
  apiPort: 8000,
  webPort: 3000,
};

describe('local runtime network boundary', () => {
  it('forces the unauthenticated API to loopback even when the parent environment is public', () => {
    const env = buildApiEnv({ HOST: '0.0.0.0' }, options);

    expect(env.HOST).toBe(LOCAL_RUNTIME_HOST);
    expect(env.AUTH_DISABLED).toBe('true');
  });

  it('forces the unauthenticated WebUI to loopback and points it at the loopback API', () => {
    const env = buildWebEnv({ HOSTNAME: '0.0.0.0' }, options);

    expect(env.HOSTNAME).toBe(LOCAL_RUNTIME_HOST);
    expect(env.AUTH_DISABLED).toBe('true');
    expect(env.NEXT_PUBLIC_API_URL).toBe(`http://${LOCAL_RUNTIME_HOST}:8000`);
  });
});
