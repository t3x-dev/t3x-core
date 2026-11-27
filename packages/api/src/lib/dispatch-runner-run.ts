import { runnerServiceToken } from './runner-service-auth';

// Runner URL (t3x-runner service)
const RUNNER_URL = process.env.RUNNER_URL || 'http://t3x-runner:8080';

const DEFAULT_ENGINE_CALLBACK_BASE = 'http://t3x-api:8000';
const DEFAULT_ENGINE_CALLBACK_PATH = '/api/v1/runs/ingest';

// This Engine's callback URL for Runner to call back
const ENGINE_CALLBACK_URL =
  process.env.ENGINE_CALLBACK_URL ||
  new URL(DEFAULT_ENGINE_CALLBACK_PATH, DEFAULT_ENGINE_CALLBACK_BASE).toString();

// Runner's callback URL for n8n to call back
const RUNNER_CALLBACK_URL =
  process.env.RUNNER_CALLBACK_URL || 'http://t3x-runner:8080/callbacks/n8n';

export function dispatchRunnerRun(payload: Record<string, unknown>, configured = false) {
  const token = runnerServiceToken();
  return fetch(`${RUNNER_URL}/${configured ? 'configured-runs' : 'runs'}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: 'Bearer ' + token }),
    },
    body: JSON.stringify({
      ...payload,
      callback_url: RUNNER_CALLBACK_URL,
      engine_callback_url: ENGINE_CALLBACK_URL,
    }),
    ...(configured && { redirect: 'error' as const }),
    signal: AbortSignal.timeout(10000),
  });
}
