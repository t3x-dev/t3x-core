'use client';

import { BookOpen, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFeedbackStats } from '@/hooks/feedback/useFeedbackStats';
import { useLeavesByProject } from '@/hooks/projects/useLeavesByProject';
import { useProjectsList } from '@/hooks/projects/useProjectsList';
import type { CosineBucket, FeedbackStats, Project } from '@/types/api';
import { ConfidenceBucketChart } from './ConfidenceBucketChart';
import { FeedbackByTypeTable } from './FeedbackByTypeTable';
import { FeedbackOverview } from './FeedbackOverview';

export function FeedbackTab() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [buckets, setBuckets] = useState<CosineBucket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { loadProjects } = useProjectsList();
  const { loadStats, loadCosineBuckets } = useFeedbackStats();

  // Load projects on mount
  useEffect(() => {
    async function load() {
      try {
        const data = await loadProjects(50, 0);
        setProjects(data.projects);
      } catch {
        setError('Failed to load projects.');
      }
    }
    load();
  }, [loadProjects]);

  // Fetch feedback data when project is selected
  useEffect(() => {
    if (!selectedProjectId) {
      setStats(null);
      setBuckets([]);
      return;
    }

    let cancelled = false;
    async function loadFeedback() {
      setLoading(true);
      setError(null);
      try {
        const [statsData, bucketsData] = await Promise.all([
          loadStats(selectedProjectId!),
          loadCosineBuckets(selectedProjectId!),
        ]);
        if (!cancelled) {
          setStats(statsData);
          setBuckets(bucketsData);
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load feedback data.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    loadFeedback();
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId, loadStats, loadCosineBuckets]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Extraction Feedback</h2>
        <p className="text-sm text-muted-foreground">
          Review acceptance rates and feedback distribution across extraction types.
        </p>
      </div>

      <Select
        value={selectedProjectId ?? ''}
        onValueChange={(value) => setSelectedProjectId(value || null)}
      >
        <SelectTrigger className="w-64">
          <SelectValue placeholder="Select a project" />
        </SelectTrigger>
        <SelectContent>
          {projects.map((p) => (
            <SelectItem key={p.project_id} value={p.project_id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading feedback data...</span>
        </div>
      )}

      {!loading && stats && (
        <div className="space-y-6">
          <FeedbackOverview stats={stats.overall} />
          <FeedbackByTypeTable byType={stats.by_inference_type} />
          <ConfidenceBucketChart buckets={buckets} />
          <LessonsSection projectId={selectedProjectId!} />
        </div>
      )}

      {!loading && !stats && !error && selectedProjectId && (
        <p className="text-sm text-muted-foreground">
          No feedback data available for this project.
        </p>
      )}

      {!loading && !error && !selectedProjectId && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Select a project above to view extraction feedback statistics.
        </p>
      )}
    </div>
  );
}

function LessonsSection({ projectId }: { projectId: string }) {
  const [lessons, setLessons] = useState<
    Array<{ lesson: string; count: number; lastSeen: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const { loadLeaves } = useLeavesByProject();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const leaves = await loadLeaves(projectId);
        const lessonMap = new Map<string, { count: number; lastSeen: string }>();
        for (const leaf of leaves) {
          for (const a of leaf.assertions ?? []) {
            if (!a.passed && a.lesson) {
              const existing = lessonMap.get(a.lesson);
              if (existing) {
                existing.count++;
                if (leaf.created_at && leaf.created_at > existing.lastSeen) {
                  existing.lastSeen = leaf.created_at;
                }
              } else {
                lessonMap.set(a.lesson, {
                  count: 1,
                  lastSeen: leaf.created_at ?? '',
                });
              }
            }
          }
        }
        if (!cancelled) {
          setLessons(
            [...lessonMap.entries()]
              .map(([lesson, data]) => ({ lesson, ...data }))
              .sort((a, b) => b.count - a.count)
              .slice(0, 10)
          );
        }
      } catch {
        // Silently fail — lessons are supplementary
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, loadLeaves]);

  if (loading) {
    return <div className="py-4 text-center text-sm text-muted-foreground">Loading lessons...</div>;
  }

  if (lessons.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium flex items-center gap-2">
        <BookOpen className="h-4 w-4" />
        Lessons Learned
      </h3>
      <div className="space-y-2">
        {lessons.map((l) => (
          <div key={l.lesson} className="rounded-md border p-2.5 text-sm">
            <p className="text-foreground">{l.lesson}</p>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span>{l.count}×</span>
              {l.lastSeen && <span>{formatTimeAgo(l.lastSeen)}</span>}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        These lessons are automatically injected into future generations to avoid repeating
        mistakes.
      </p>
    </div>
  );
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}
