import { useRef, useState } from 'react';
import {
  downloadStateExport,
  fetchStateExport,
  supportsExactStateExport,
} from '@/infrastructure/stateExport';

export function useStateExport(projectId: string, commitDigest: string) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const requestInFlight = useRef(false);
  const supported = supportsExactStateExport(projectId, commitDigest);

  async function download(format: 'json' | 'yaml') {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setPending(true);
    setError(null);
    setDownloaded(false);
    try {
      const artifact = await fetchStateExport(projectId, commitDigest, format);
      downloadStateExport(artifact);
      setDownloaded(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Export failed. Try again.');
    } finally {
      requestInFlight.current = false;
      setPending(false);
    }
  }

  return {
    pending,
    error,
    downloaded,
    supported,
    download,
    reset() {
      setError(null);
      setDownloaded(false);
    },
  };
}
