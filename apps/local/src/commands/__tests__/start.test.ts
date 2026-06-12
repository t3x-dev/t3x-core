import { describe, expect, it } from 'vitest';
import { formatStartedRuntimeMessages } from '../start.js';

describe('formatStartedRuntimeMessages', () => {
  it('includes the guided demo URL in the local start output', () => {
    expect(
      formatStartedRuntimeMessages({
        apiPid: 101,
        webPid: 102,
        apiUrl: 'http://localhost:8000',
        webUrl: 'http://localhost:3000',
        dataDir: '/tmp/t3x-data',
        stateFilePath: '/tmp/t3x-state.json',
        apiLogPath: '/tmp/api.log',
        webLogPath: '/tmp/web.log',
      })
    ).toContain('[t3x-local] Demo: http://localhost:3000/chat?introDemo=1');
  });
});
