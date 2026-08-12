import { describe, expect, it } from 'vitest';
import { formatStartedRuntimeMessages } from '../start.js';

describe('formatStartedRuntimeMessages', () => {
  it('includes the repository-first URL in the local start output', () => {
    expect(
      formatStartedRuntimeMessages({
        apiPid: 101,
        webPid: 102,
        apiUrl: 'http://127.0.0.1:8000',
        webUrl: 'http://127.0.0.1:3000',
        dataDir: '/tmp/t3x-data',
        stateFilePath: '/tmp/t3x-state.json',
        apiLogPath: '/tmp/api.log',
        webLogPath: '/tmp/web.log',
      })
    ).toContain('[t3x-local] Open: http://127.0.0.1:3000/');
  });
});
