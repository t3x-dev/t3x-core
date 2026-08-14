import http from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertSafeAgentEndpoint,
  fetchAgentEndpoint,
  isBlockedAgentAddress,
  UnsafeAgentEndpointError,
} from '../endpoint-security.js';

function credentialBearingEndpoint() {
  const endpoint = new URL('https://agent.example');
  endpoint.username = 'user';
  endpoint.password = 'pass';
  return endpoint.href;
}

describe('runner endpoint security', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // One representative from every IANA special-purpose parent range, plus multicast.
  it.each([
    '0.0.0.1',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.0.0.9',
    '192.0.2.1',
    '192.31.196.1',
    '192.52.193.1',
    '192.88.99.2',
    '192.168.1.1',
    '192.175.48.1',
    '198.18.0.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    '::ffff:7f00:1',
    '::ffff:93.184.216.34',
    '64:ff9b::1',
    '64:ff9b:1::1',
    '100::1',
    '100:0:0:1::1',
    '2001::1',
    '2001:db8::1',
    '2002::1',
    '2620:4f:8000::1',
    '3fff::1',
    '5f00::1',
    'fd00::1',
    'fe80::1',
    'fec0::1',
    'ff02::1',
    '4000::1',
  ])('classifies special-purpose address %s as blocked', (address) => {
    expect(isBlockedAgentAddress(address)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '93.184.216.34',
    '192.0.1.255',
    '192.31.195.255',
    '192.31.197.0',
    '198.17.255.255',
    '198.20.0.0',
    '2001:4860:4860::8888',
    '2606:4700:4700::1111',
    '3ffe:ffff::1',
  ])('keeps globally routable boundary address %s available', (address) => {
    expect(isBlockedAgentAddress(address)).toBe(false);
  });

  it('allows a public address returned by DNS', async () => {
    await expect(
      assertSafeAgentEndpoint('https://agent.example/run', {
        lookup: async () => [{ address: '93.184.216.34' }],
      })
    ).resolves.toBeUndefined();
  });

  it('blocks a hostname when any resolved address is private', async () => {
    await expect(
      assertSafeAgentEndpoint('https://agent.example/run', {
        lookup: async () => [{ address: '93.184.216.34' }, { address: '127.0.0.1' }],
      })
    ).rejects.toBeInstanceOf(UnsafeAgentEndpointError);
  });

  it('blocks loopback endpoints unless their exact origin is allowlisted', async () => {
    await expect(
      assertSafeAgentEndpoint('http://127.0.0.1:9000/run', { allowlist: '' })
    ).rejects.toThrow('RUNNER_ENDPOINT_ALLOWLIST');

    await expect(
      assertSafeAgentEndpoint('http://127.0.0.1:9000/run', {
        allowlist: 'http://127.0.0.1:9000',
      })
    ).resolves.toBeUndefined();

    await expect(
      assertSafeAgentEndpoint('http://127.0.0.1:9001/run', {
        allowlist: 'http://127.0.0.1:9000',
      })
    ).rejects.toBeInstanceOf(UnsafeAgentEndpointError);
  });

  it.each([
    'file:///etc/passwd',
    'ftp://agent.example/run',
    credentialBearingEndpoint(),
  ])('rejects unsupported or credential-bearing endpoint %s', async (endpoint) => {
    await expect(assertSafeAgentEndpoint(endpoint)).rejects.toBeInstanceOf(
      UnsafeAgentEndpointError
    );
  });

  it('forces manual redirect handling for outbound agent requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 302 }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchAgentEndpoint(
      'https://agent.example/run',
      { redirect: 'follow' },
      { lookup: async () => [{ address: '93.184.216.34' }] }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://agent.example/run',
      expect.objectContaining({ dispatcher: expect.anything(), redirect: 'manual' })
    );
  });

  it('uses the validated address for the actual connection instead of resolving again', async () => {
    const server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ host: req.headers.host }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Expected a TCP test server');
      const origin = `http://agent.invalid:${address.port}`;

      const response = await fetchAgentEndpoint(
        `${origin}/run`,
        {},
        {
          allowlist: origin,
          lookup: async () => [{ address: '127.0.0.1', family: 4 }],
        }
      );

      expect(await response.json()).toEqual({ host: `agent.invalid:${address.port}` });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
