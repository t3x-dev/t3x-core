'use client';

import { FolderOpen, Plus, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { createTopicApi, deleteTopicApi } from '@/lib/api/topics';
import { cn } from '@/lib/utils';
import { useExtractionPanelStore } from '@/store/extractionPanelStore';

/**
 * TopicMap — folder-style vertical list of topics.
 *
 * Each topic is a clickable row. Active topic is highlighted.
 * Provides a "+ New Topic" button and delete per topic.
 */
export function TopicMap() {
  const topics = useExtractionPanelStore((s) => s.topics);
  const activeTopicId = useExtractionPanelStore((s) => s.activeTopicId);
  const setActiveTopicId = useExtractionPanelStore((s) => s.setActiveTopicId);
  const setTopics = useExtractionPanelStore((s) => s.setTopics);
  const addTopic = useExtractionPanelStore((s) => s.addTopic);
  const conversationId = useExtractionPanelStore((s) => s.conversationId);

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreate = useCallback(async () => {
    if (!conversationId || !newName.trim()) return;
    try {
      const topic = await createTopicApi(conversationId, newName.trim());
      addTopic(topic);
      setActiveTopicId(topic.id);
      setNewName('');
      setIsCreating(false);
    } catch {
      // Silent failure
    }
  }, [conversationId, newName, addTopic, setActiveTopicId]);

  const handleDelete = useCallback(
    async (topicId: string) => {
      try {
        await deleteTopicApi(topicId);
        setTopics(topics.filter((t) => t.id !== topicId));
        if (activeTopicId === topicId) {
          setActiveTopicId(topics.length > 1 ? topics.find((t) => t.id !== topicId)?.id ?? null : null);
        }
      } catch {
        // Silent failure
      }
    },
    [topics, activeTopicId, setTopics, setActiveTopicId]
  );

  if (topics.length === 0 && !isCreating) return null;

  return (
    <div className="border-b border-[var(--stroke-default)] px-2 py-1.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
          Topics
        </span>
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="rounded p-0.5 text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
          aria-label="New topic"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      <div className="flex flex-col gap-0.5">
        {/* "All" option to show unfiltered */}
        <button
          type="button"
          onClick={() => setActiveTopicId(null)}
          className={cn(
            'flex items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] transition-colors',
            activeTopicId === null
              ? 'bg-[var(--accent-commit)]/10 text-[var(--text-primary)] font-medium'
              : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]'
          )}
        >
          <FolderOpen className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">All topics</span>
        </button>

        {topics.map((topic) => (
          <div
            key={topic.id}
            className={cn(
              'group flex items-center gap-1.5 rounded px-1.5 py-1 transition-colors',
              activeTopicId === topic.id
                ? 'bg-[var(--accent-commit)]/10 text-[var(--text-primary)] font-medium'
                : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]'
            )}
          >
            <button
              type="button"
              onClick={() => setActiveTopicId(topic.id)}
              className="flex items-center gap-1.5 flex-1 min-w-0 text-left text-[11px]"
            >
              <FolderOpen className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{topic.name}</span>
            </button>
            <button
              type="button"
              onClick={() => handleDelete(topic.id)}
              className="hidden group-hover:flex items-center p-0.5 rounded text-[var(--text-tertiary)] hover:text-red-400 hover:bg-red-400/10"
              aria-label={`Delete topic ${topic.name}`}
            >
              <Trash2 className="h-2.5 w-2.5" />
            </button>
          </div>
        ))}

        {isCreating && (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') {
                  setIsCreating(false);
                  setNewName('');
                }
              }}
              placeholder="Topic name..."
              className="flex-1 rounded border border-[var(--stroke-default)] bg-[var(--surface-panel)] px-1.5 py-0.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-commit)]"
              autoFocus
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="rounded bg-[var(--accent-commit)] px-1.5 py-0.5 text-[10px] text-white hover:opacity-90 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
