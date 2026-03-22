'use client';

import { FileText, FolderOpen, Plus, X } from 'lucide-react';
import { useCallback } from 'react';
import { createTopicApi, deleteTopicApi } from '@/lib/api/topics';
import { cn } from '@/lib/utils';
import { useExtractionPanelStore } from '@/store/extractionPanelStore';

export function TopicMap() {
  const topics = useExtractionPanelStore((s) => s.topics);
  const activeTopicId = useExtractionPanelStore((s) => s.activeTopicId);
  const setActiveTopicId = useExtractionPanelStore((s) => s.setActiveTopicId);
  const setTopics = useExtractionPanelStore((s) => s.setTopics);
  const addTopic = useExtractionPanelStore((s) => s.addTopic);
  const draft = useExtractionPanelStore((s) => s.draft);
  const conversationId = useExtractionPanelStore((s) => s.conversationId);
  const projectId = useExtractionPanelStore((s) => s.projectId);

  const handleClickTopic = useCallback(
    (topicId: string, topicName: string) => {
      setActiveTopicId(topicId);

      // Scroll YAML to the root frame matching this topic name
      // Find frame whose type matches the topic name
      const rootFrame = draft.frames.find((f) => f.type === topicName);
      if (rootFrame) {
        const el = document.querySelector(`[data-frame-id="${rootFrame.id}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    [setActiveTopicId, draft.frames]
  );

  const handleDeleteTopic = useCallback(
    async (e: React.MouseEvent, topicId: string) => {
      e.stopPropagation();
      try {
        await deleteTopicApi(topicId);
        setTopics(topics.filter((t) => t.id !== topicId));
        if (activeTopicId === topicId) {
          const remaining = topics.filter((t) => t.id !== topicId);
          setActiveTopicId(remaining.length > 0 ? remaining[0].id : null);
        }
      } catch {
        // Failed to delete
      }
    },
    [topics, activeTopicId, setTopics, setActiveTopicId]
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
      <div className="flex flex-col items-center justify-center gap-2 py-4 px-4">
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
        <div
          key={topic.id}
          className={cn(
            'group flex items-center gap-2 rounded px-2 py-1.5 text-left transition-colors w-full cursor-pointer',
            topic.id === activeTopicId
              ? 'bg-[var(--accent-commit)]/10 text-[var(--accent-commit)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]'
          )}
          onClick={() => handleClickTopic(topic.id, topic.name)}
        >
          <FileText className={cn(
            'h-3.5 w-3.5 shrink-0',
            topic.id === activeTopicId ? 'text-[var(--accent-commit)]' : 'text-[var(--text-tertiary)]'
          )} />
          <span className="text-xs truncate flex-1">
            {topic.name.replace(/_/g, ' ')}
          </span>
          <button
            type="button"
            onClick={(e) => handleDeleteTopic(e, topic.id)}
            className="opacity-0 group-hover:opacity-100 shrink-0 rounded p-0.5 text-[var(--text-tertiary)] hover:text-red-400 hover:bg-red-400/10 transition-all"
            title="Remove topic"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
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
