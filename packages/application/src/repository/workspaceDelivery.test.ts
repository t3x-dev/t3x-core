import { expect, it } from 'vitest';
import { resolveWorkspaceDeliveryTarget } from './workspaceDelivery';

it.each(['yaml', 'json'])('supports explicit full-state %s download', (format) => {
  expect(resolveWorkspaceDeliveryTarget({ type: 'export', format })).toMatchObject({
    mode: 'download',
    format,
  });
});
it.each([
  { type: 'document', format: 'yaml' },
  { type: 'export', format: 'pdf' },
  { type: 'export', format: 'json', instruction: 'Generate' },
  { type: 'export', format: 'json', sourceScope: 'one node' },
  { type: 'export', format: 'yaml', constraints: ['summarize'] },
])('preserves unsupported generation target as legacy: %j', (target) => {
  expect(resolveWorkspaceDeliveryTarget(target).mode).toBe('legacy');
});
