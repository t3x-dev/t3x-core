import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { verifyDownloadArtifact } from '@/infrastructure/stateExport';

const commitDigest = `sha256:${'a'.repeat(64)}` as const;
const content = '{"portable":true}\n';
const artifact = {
  format: 'bundle' as const,
  scope: 'portable-commit' as const,
  mimeType: 'application/json' as const,
  filename: 'artifact.t3x.json',
  content,
  byteLength: Buffer.byteLength(content),
  byteDigest: `sha256:${createHash('sha256').update(content).digest('hex')}` as const,
  sourceCommit: { kind: 'commit' as const, schema: 't3x/commit/v2' as const, digest: commitDigest },
  sourceState: {
    kind: 'state' as const,
    schema: 't3x/state/v1' as const,
    digest: `sha256:${'b'.repeat(64)}` as const,
  },
  schemaDigest: `sha256:${'c'.repeat(64)}` as const,
  serialization: 't3x.portable-artifact/v1' as const,
};

it('verifies portable artifact identity and bytes before download', async () => {
  await expect(verifyDownloadArtifact(artifact, commitDigest, 'bundle')).resolves.toBe(artifact);
  await expect(
    verifyDownloadArtifact({ ...artifact, content: '{}\n' }, commitDigest, 'bundle')
  ).rejects.toThrow('Export integrity check failed');
});
