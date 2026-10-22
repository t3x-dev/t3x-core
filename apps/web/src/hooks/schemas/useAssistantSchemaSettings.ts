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
  const [generating, setGenerating] = useState(false);
  const [operationId, setOperationId] = useState<string>();
  const epoch = useRef(0);
  const mutation = useRef(0);
  const loadedSettingsId = useRef<string | null>(null);
  const inFlight = useRef<Promise<AssistantSchemaSettingsView | undefined> | null>(null);
  useEffect(() => {
    ++epoch.current;
    inFlight.current = null;
    loadedSettingsId.current = null;
    setRecord(null);
    setError(undefined);
    setGenerating(false);
    setOperationId(undefined);
    return () => {
      ++epoch.current;
    };
  }, [projectId, workspaceId, conversationId]);
  useEffect(() => {
    let active = true;
    const started = epoch.current;
    const readMutation = mutation.current;
    // A revision/focus refresh is not a new request scope. In particular, the
    // confirmation write itself advances the revision while AI is still running.
    if (conversationId)
      void readAssistantSchemaSettings(projectId, workspaceId, conversationId).then(
        (value) => {
          if (
            active &&
            started === epoch.current &&
            readMutation === mutation.current &&
            !inFlight.current
          ) {
            if (loadedSettingsId.current !== (value?.settingsId ?? null)) setError(undefined);
            loadedSettingsId.current = value?.settingsId ?? null;
            setRecord(value);
          }
        },
        (failure) => {
          if (
            active &&
            started === epoch.current &&
            readMutation === mutation.current &&
            !inFlight.current
          )
            setError(
              failure instanceof Error ? failure.message : 'Could not restore Schema settings.'
            );
        }
      );
    return () => {
      active = false;
    };
  }, [projectId, workspaceId, conversationId, refreshKey]);
  return {
    record,
    error,
    generating,
    operationId,
    generate: (
      settings: AssistantSchemaSettingsInput,
      discardStudioCandidate = false,
      target = record
    ) => {
      if (inFlight.current) return inFlight.current;
      if (!target) return Promise.reject(new Error('Settings are unavailable.'));
      ++mutation.current;
      const request = (async () => {
        const started = epoch.current;
        setError(undefined);
        setGenerating(true);
        setOperationId(target.settingsId);
        try {
          const saved = await confirmAssistantSchemaSettings(
            projectId,
            workspaceId,
            target,
            settings,
            {
              generateSnapshot: true,
              applyToDraft: true,
              discardStudioCandidate,
            }
          );
          if (started !== epoch.current) return;
          loadedSettingsId.current = saved.settingsId;
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
            if (latest) {
              loadedSettingsId.current = latest.settingsId;
              setRecord(latest);
            }
            setError(
              failure instanceof Error ? failure.message : 'Could not save Schema to Draft.'
            );
          }
          throw failure;
        } finally {
          if (started === epoch.current) {
            inFlight.current = null;
            setGenerating(false);
          }
        }
      })();
      inFlight.current = request;
      return request;
    },
    save: async (settings: AssistantSchemaSettingsInput | null, target = record) => {
      const started = epoch.current;
      if (!target) throw new Error('Settings are unavailable.');
      ++mutation.current;
      setOperationId(target.settingsId);
      const saved = await confirmAssistantSchemaSettings(projectId, workspaceId, target, settings);
      if (started === epoch.current) {
        loadedSettingsId.current = saved.settingsId;
        setError(undefined);
        setRecord(saved);
        return saved;
      }
    },
  };
}
