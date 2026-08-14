import { describe, expect, it } from 'vitest';
import { setupWebSocket } from '../lib/ws';

describe('Node WebSocket setup', () => {
  it('provides the node-server v2 upgrade helper and a no-server ws instance', () => {
    const { upgradeWebSocket, websocket } = setupWebSocket();

    expect(upgradeWebSocket).toBeTypeOf('function');
    expect(websocket.server.options.noServer).toBe(true);
  });
});
