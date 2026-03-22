'use client';

import { Plus } from 'lucide-react';
import { useCallback } from 'react';
import { createTopicApi } from '@/lib/api/topics';
import { cn } from '@/lib/utils';
import { useExtractionPanelStore } from '@/store/extractionPanelStore';

export function TopicMap() {
  const topics = useExtractionPanelStore((s) => s.topics);
  const activeTopicId = useExtractionPanelStore((s) => s.activeTopicId);
  const setActiveTopicId = useExtractionPanelStore((s) => s.setActiveTopicId);
  const setActiveView = useExtractionPanelStore((s) => s.setActiveView);
  const addTopic = useExtractionPanelStore((s) => s.addTopic);
  const conversationId = useExtractionPanelStore((s) => s.conversationId);
  const projectId = useExtractionPanelStore((s) => s.projectId);

  const handleClickTopic = useCallback(
    (topicId: string) => {
      setActiveTopicId(topicId);
      setActiveView('yaml');
    },
    [setActiveTopicId, setActiveView]
  );

  const handleNewTopic = useCallback(async () => {
    if (!conversationId || !projectId) return;
    try {
      const topic = await createTopicApi(conversationId, projectId, 'new_topic');
      addTopic(topic);
      setActiveTopicId(topic.id);
      setActiveView('yaml');
    } catch {
      // Failed to create topic
    }
  }, [conversationId, projectId, addTopic, setActiveTopicId, setActiveView]);

  if (topics.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
        <p className="text-xs text-[var(--text-tertiary)]">No topics yet</p>
        <p className="text-xs text-[var(--text-tertiary)]">Start chatting to create your first topic tree</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex flex-wrap gap-2">
        {topics.map((topic) => (
          <button
            key={topic.id}
            type="button"
            onClick={() => handleClickTopic(topic.id)}
            className={cn(
              'rounded-lg border px-4 py-3 text-left transition-all hover:shadow-md',
              'min-w-[140px] max-w-[200px]',
              topic.id === activeTopicId
                ? 'border-[var(--accent-commit)] bg-[var(--accent-commit)]/5 shadow-sm'
                : topic.status === 'collapsed'
                  ? 'border-[var(--stroke-default)] bg-[var(--surface-panel)] opacity-50'
                  : 'border-[var(--stroke-default)] bg-[var(--surface-panel)]'
            )}
          >
            <div className="text-sm font-medium text-[var(--text-primary)] truncate">
              {topic.name.replace(/_/g, ' ')}
            </div>
            <div className="mt-1 text-[10px] text-[var(--text-tertiary)]">
              {topic.status === 'collapsed' ? 'collapsed' : 'active'}
            </div>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={handleNewTopic}
        className="flex items-center gap-1.5 self-start rounded-md border border-dashed border-[var(--stroke-default)] px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        New Topic
      </button>
    </div>
  );
}
