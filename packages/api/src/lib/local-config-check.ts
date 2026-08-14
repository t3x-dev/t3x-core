import { fetchAgentEndpoint } from '@t3x-dev/runner';
import { getEffectiveApiCredential, getHttpOrigin, resolveLocalConfigState } from './local-config';
import { isInternalUrlResolved } from './ssrf';

export interface LocalAccessCheckResult {
  ok: boolean;
  code:
    | 'ACCESS_OK'
    | 'AUTH_NOT_REQUIRED'
    | 'MISSING_API_KEY'
    | 'CREDENTIAL_ORIGIN_MISMATCH'
    | 'UNSAFE_API_URL'
    | 'INVALID_API_KEY'
    | 'API_UNREACHABLE'
    | 'API_ERROR';
  auth_mode: 'open' | 'protected' | 'unreachable';
  message: string;
  api_url: string;
  api_key_present: boolean;
  api_key_source: 'env' | 'file' | 'none';
  status_code: number | null;
}

function buildStatusUrl(apiUrl: string): string {
  return `${apiUrl.replace(/\/+$/, '')}/v1/status`;
}

function isCurrentApiLoopbackOrigin(apiUrl: string): boolean {
  try {
    const url = new URL(apiUrl);
    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    const expectedPort = process.env.PORT || '8000';
    return (
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '::1'].includes(hostname) &&
      (url.port || '80') === expectedPort
    );
  } catch {
    return false;
  }
}

async function isUnsafeStatusTarget(apiUrl: string): Promise<boolean> {
  if (!getHttpOrigin(apiUrl)) return true;
  if (isCurrentApiLoopbackOrigin(apiUrl)) return false;
  return isInternalUrlResolved(apiUrl);
}

async function requestStatus(url: string, apiKey?: string): Promise<Response> {
  const headers = new Headers();
  if (apiKey) headers.set('Authorization', `Bearer ${apiKey}`);
  const allowlist = isCurrentApiLoopbackOrigin(url) ? new URL(url).origin : undefined;
  return fetchAgentEndpoint(
    url,
    {
      method: 'GET',
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    },
    { allowlist }
  );
}

export async function checkLocalAccess(): Promise<LocalAccessCheckResult> {
  const state = resolveLocalConfigState();
  const credential = getEffectiveApiCredential();
  const statusUrl = buildStatusUrl(state.api_url);

  if (await isUnsafeStatusTarget(state.api_url)) {
    return {
      ok: false,
      code: 'UNSAFE_API_URL',
      auth_mode: 'unreachable',
      message:
        'The target API URL resolves to a private or reserved address outside the current local API origin.',
      api_url: state.api_url,
      api_key_present: state.api_key_present,
      api_key_source: state.api_key_source,
      status_code: null,
    };
  }

  let probeResponse: Response;
  try {
    probeResponse = await requestStatus(statusUrl);
  } catch (error) {
    return {
      ok: false,
      code: 'API_UNREACHABLE',
      auth_mode: 'unreachable',
      message: error instanceof Error ? error.message : 'Could not reach the target API.',
      api_url: state.api_url,
      api_key_present: state.api_key_present,
      api_key_source: state.api_key_source,
      status_code: null,
    };
  }

  if (probeResponse.ok) {
    const message = state.api_key_present
      ? 'The target API is reachable and does not currently require a key. The configured key was not needed for this result.'
      : 'The target API is reachable and does not currently require a key.';
    return {
      ok: true,
      code: 'AUTH_NOT_REQUIRED',
      auth_mode: 'open',
      message,
      api_url: state.api_url,
      api_key_present: state.api_key_present,
      api_key_source: state.api_key_source,
      status_code: probeResponse.status,
    };
  }

  if (probeResponse.status !== 401 && probeResponse.status !== 403) {
    return {
      ok: false,
      code: 'API_ERROR',
      auth_mode: 'unreachable',
      message: `The target API responded with HTTP ${probeResponse.status}.`,
      api_url: state.api_url,
      api_key_present: state.api_key_present,
      api_key_source: state.api_key_source,
      status_code: probeResponse.status,
    };
  }

  if (!credential.apiKey) {
    return {
      ok: false,
      code: 'MISSING_API_KEY',
      auth_mode: 'protected',
      message: 'The target API requires authentication, but no API key is configured.',
      api_url: state.api_url,
      api_key_present: state.api_key_present,
      api_key_source: state.api_key_source,
      status_code: probeResponse.status,
    };
  }

  const targetOrigin = getHttpOrigin(state.api_url);
  if (!targetOrigin || targetOrigin !== credential.trustedOrigin) {
    return {
      ok: false,
      code: 'CREDENTIAL_ORIGIN_MISMATCH',
      auth_mode: 'protected',
      message:
        'The configured key is bound to a different API origin. Save the key again for this API URL before retrying.',
      api_url: state.api_url,
      api_key_present: state.api_key_present,
      api_key_source: state.api_key_source,
      status_code: probeResponse.status,
    };
  }

  try {
    const authResponse = await requestStatus(statusUrl, credential.apiKey);
    if (authResponse.ok) {
      return {
        ok: true,
        code: 'ACCESS_OK',
        auth_mode: 'protected',
        message: 'Configured key is accepted by the target API.',
        api_url: state.api_url,
        api_key_present: state.api_key_present,
        api_key_source: state.api_key_source,
        status_code: authResponse.status,
      };
    }

    if (authResponse.status === 401 || authResponse.status === 403) {
      return {
        ok: false,
        code: 'INVALID_API_KEY',
        auth_mode: 'protected',
        message: 'Configured key was rejected by the target API.',
        api_url: state.api_url,
        api_key_present: state.api_key_present,
        api_key_source: state.api_key_source,
        status_code: authResponse.status,
      };
    }

    return {
      ok: false,
      code: 'API_ERROR',
      auth_mode: 'protected',
      message: `The target API responded with HTTP ${authResponse.status} after auth.`,
      api_url: state.api_url,
      api_key_present: state.api_key_present,
      api_key_source: state.api_key_source,
      status_code: authResponse.status,
    };
  } catch (error) {
    return {
      ok: false,
      code: 'API_UNREACHABLE',
      auth_mode: 'unreachable',
      message: error instanceof Error ? error.message : 'Could not reach the target API.',
      api_url: state.api_url,
      api_key_present: state.api_key_present,
      api_key_source: state.api_key_source,
      status_code: null,
    };
  }
}
