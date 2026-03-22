'use client';

import { FileText, FolderOpen, Plus } from 'lucide-react';
import { useCallback } from 'react';
import { createTopicApi } from '@/lib/api/topics';
import { cn } from '@/lib/utils';
import { useExtractionPanelStore } from '@/store/extractionPanelStore';

export function TopicMap() {
  const topics = useExtractionPanelStore((s) => s.topics);
  const activeTopicId = useExtractionPanelStore((s) => s.activeTopicId);
  const setActiveTopicId = useExtractionPanelStore((s) => s.setActiveTopicId);
  const addTopic = useExtractionPanelStore((s) => s.addTopic);
  const conversationId = useExtractionPanelStore((s) => s.conversationId);
  const projectId = useExtractionPanelStore((s) => s.projectId);

  const handleClickTopic = useCallback(
    (topicId: string) => {
      setActiveTopicId(topicId);
    },
    [setActiveTopicId]
  );

  const handleNewTopic = useCallback(async () => {
    if (!conversationId || !projectId) return;
    try {
      const topic = await createTopicApi(conversationId, projectId, 'new_topic');
      addTopic(topic);
      setActiveTopicId(topic.id);
    } catch {
      // Failed to create topic
    }
  }, [conversationId, projectId, addTopic, setActiveTopicId]);

  if (topics.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
        <p className="text-xs text-[var(--text-tertiary)]">No topics yet</p>
        <p className="text-xs text-[var(--text-tertiary)]">Start chatting to create your first topic tree</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 px-2 py-2">
      <div className="flex items-center gap-1.5 px-1 pb-1">
        <FolderOpen className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
          Topics
        </span>
      </div>

      {topics.map((topic) => (
        <button
          key={topic.id}
          type="button"
          onClick={() => handleClickTopic(topic.id)}
          className={cn(
            'flex items-center gap-2 rounded px-2 py-1.5 text-left transition-colors w-full',
            topic.id === activeTopicId
              ? 'bg-[var(--accent-commit)]/10 text-[var(--accent-commit)]'
              : topic.status === 'collapsed'
                ? 'text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]'
          )}
        >
          <FileText className={cn(
            'h-3.5 w-3.5 shrink-0',
            topic.id === activeTopicId ? 'text-[var(--accent-commit)]' : 'text-[var(--text-tertiary)]'
          )} />
          <span className="text-xs truncate">
            {topic.name.replace(/_/g, ' ')}
          </span>
          {topic.status === 'collapsed' && (
            <span className="text-[9px] text-[var(--text-tertiary)] ml-auto shrink-0">collapsed</span>
          )}
        </button>
      ))}

      <button
        type="button"
        onClick={handleNewTopic}
        className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] transition-colors w-full mt-1"
      >
        <Plus className="h-3.5 w-3.5 shrink-0" />
        <span>New Topic</span>
      </button>
    </div>
  );
}
