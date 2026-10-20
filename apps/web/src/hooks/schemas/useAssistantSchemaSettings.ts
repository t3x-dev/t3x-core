import type {
  AssistantSchemaSettingsInput,
  AssistantSchemaSettingsView,
} from '@t3x-dev/api-client';
import { useEffect, useRef, useState } from 'react';
import {
  confirmAssistantSchemaSettings,
  readAssistantSchemaSettings,
} from '@/infrastructure/workspaceAssistant';

export function useAssistantSchemaSettings(
  projectId: string,
  workspaceId: string,
  conversationId: string | undefined,
  refreshKey: string
) {
  const [record, setRecord] = useState<AssistantSchemaSettingsView | null>(null);
  const [error, setError] = useState<string>();
  const epoch = useRef(0);
  useEffect(() => {
    ++epoch.current;
    let active = true;
    setRecord(null);
    setError(undefined);
    if (conversationId)
      void readAssistantSchemaSettings(projectId, workspaceId, conversationId).then(
        (value) => {
          if (active) setRecord(value);
        },
        (failure) => {
          if (active)
            setError(
              failure instanceof Error ? failure.message : 'Could not restore Schema settings.'
            );
        }
      );
    return () => {
      active = false;
      ++epoch.current;
    };
  }, [projectId, workspaceId, conversationId, refreshKey]);
  return {
    record,
    error,
    generate: async (settings: AssistantSchemaSettingsInput, discardStudioCandidate = false) => {
      const started = epoch.current;
      if (!record) throw new Error('Settings are unavailable.');
      setError(undefined);
      try {
        const saved = await confirmAssistantSchemaSettings(
          projectId,
          workspaceId,
          record,
          settings,
          {
            generateSnapshot: true,
            applyToDraft: true,
            discardStudioCandidate,
          }
        );
        if (started !== epoch.current) return;
        setRecord(saved);
        window.dispatchEvent(
          new CustomEvent('t3x-schema-candidate-updated', { detail: { projectId, workspaceId } })
        );
        try {
          localStorage.setItem(
            't3x-schema-candidate-updated',
            JSON.stringify({ projectId, workspaceId, at: Date.now() })
          );
        } catch {
          /* Focus refresh remains available. */
        }
        return saved;
      } catch (failure) {
        const latest = conversationId
          ? await readAssistantSchemaSettings(projectId, workspaceId, conversationId).catch(
              () => null
            )
          : null;
        if (started === epoch.current) {
          if (latest) setRecord(latest);
          setError(failure instanceof Error ? failure.message : 'Could not save Schema to Draft.');
        }
        throw failure;
      }
    },
    save: async (settings: AssistantSchemaSettingsInput | null) => {
      const started = epoch.current;
      if (!record) throw new Error('Settings are unavailable.');
      const saved = await confirmAssistantSchemaSettings(projectId, workspaceId, record, settings);
      if (started === epoch.current) {
        setRecord(saved);
        return saved;
      }
    },
  };
}
