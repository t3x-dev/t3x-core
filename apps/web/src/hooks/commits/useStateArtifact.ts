import { useEffect, useMemo, useState } from 'react';
import { summarizeArtifactState } from '@/domain/project/stateArtifact';
import { downloadArtifact, exportArtifactCard } from '@/infrastructure/export/stateArtifact';
import { fetchStateExport, supportsExactStateExport } from '@/infrastructure/stateExport';

type CardData = { yaml: string; exact: boolean };

export function useStateArtifact(projectId: string, digest: string, structureYaml: string) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ data: CardData } | { error: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const exact = supportsExactStateExport(projectId, digest);
    async function load() {
      try {
        const yaml = exact
          ? (await fetchStateExport(projectId, digest, 'yaml', controller.signal)).content
          : structureYaml;
        if (!controller.signal.aborted) {
          setResult({ data: { yaml, exact } });
        }
      } catch {
        if (!controller.signal.aborted) {
          setResult({
            error: 'Could not load the committed data. Try again.',
          });
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [projectId, digest, structureYaml, attempt]);

  const yaml = result && 'data' in result ? result.data.yaml : undefined;
  const summary = useMemo(() => {
    if (yaml === undefined) return null;
    try {
      return summarizeArtifactState(yaml, structureYaml);
    } catch {
      return null;
    }
  }, [yaml, structureYaml]);

  return {
    result,
    summary,
    retry() {
      setResult(null);
      setAttempt((current) => current + 1);
    },
  };
}

export async function downloadStateArtifactCard(
  card: HTMLElement,
  styles: string,
  title: string,
  digest: string,
  format: 'html' | 'png'
) {
  const blob = await exportArtifactCard(card, styles, title, format);
  downloadArtifact(blob, `state-${digest.replace(/^sha256:/, '').slice(0, 12)}.${format}`);
}
