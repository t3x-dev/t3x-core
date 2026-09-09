import { StateExportArtifactSchema } from '@t3x-dev/api-client';
import { API_V1, fetchWithTimeout, handleResponse } from './core';

export async function fetchStateExport(projectId: string, digest: string, format: 'json' | 'yaml') {
  const query = new URLSearchParams({ project_id: projectId, format });
  const response = await fetchWithTimeout(
    `${API_V1}/commits/${encodeURIComponent(digest)}/export?${query}`
  );
  const artifact = StateExportArtifactSchema.parse(await handleResponse(response));
  return verifyStateExport(artifact, digest, format);
}

export async function verifyStateExport(
  artifact: import('@t3x-dev/api-client').StateExportArtifact,
  digest: string,
  format: 'json' | 'yaml'
) {
  if (artifact.sourceCommit.digest !== digest || artifact.format !== format) {
    throw new Error('Export does not match the selected revision');
  }
  const bytes = new TextEncoder().encode(artifact.content);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const digestHex = Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  if (`sha256:${digestHex}` !== artifact.byteDigest || bytes.byteLength !== artifact.byteLength) {
    throw new Error('Export integrity check failed');
  }
  return artifact;
}

export function downloadStateExport(artifact: Awaited<ReturnType<typeof fetchStateExport>>) {
  const url = URL.createObjectURL(new Blob([artifact.content], { type: artifact.mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = artifact.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
