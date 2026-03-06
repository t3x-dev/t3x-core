'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Project } from '@/lib/api';
import { listProjects } from '@/lib/api';
import type { CosineBucket, FeedbackStats } from '@/lib/api/extraction-feedback';
import {
  getExtractionFeedbackStats,
  getFeedbackCosineBuckets,
} from '@/lib/api/extraction-feedback';
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

  // Load projects on mount
  useEffect(() => {
    async function loadProjects() {
      try {
        const data = await listProjects(50, 0);
        setProjects(data.projects);
      } catch {
        setError('Failed to load projects.');
      }
    }
    loadProjects();
  }, []);

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
          getExtractionFeedbackStats(selectedProjectId!),
          getFeedbackCosineBuckets(selectedProjectId!),
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
  }, [selectedProjectId]);

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
