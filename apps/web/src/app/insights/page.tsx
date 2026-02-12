'use client';

import { Clock3, GitCommit, Lightbulb, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SemanticCard } from '@/components/SemanticCard';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { CommitV4, Project } from '@/lib/api';
import { listCommitsV4, listProjects } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { SemanticEntry } from '@/types/semantic';

const stageColors = {
  commit: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  draft: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  turn: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
} as const;

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function commitToSemanticEntry(commit: CommitV4, projectName: string): SemanticEntry {
  return {
    id: commit.hash.slice(7, 19),
    title: commit.message || `Commit ${commit.hash.slice(7, 15)}`,
    summary: commit.content.sentences.map((s) => s.text).join('. '),
    author: commit.author?.name || commit.author?.type || 'unknown',
    stage: 'commit',
    status: 'validated',
    bridgePrompt: commit.branch || 'main',
    updatedAt: formatTimeAgo(commit.committed_at),
    tags: [projectName, commit.branch || 'main'],
    evidenceCount: commit.content.sentences.length,
    facets: commit.content.sentences
      .slice(0, 3)
      .map((s) => s.text.slice(0, 50) + (s.text.length > 50 ? '...' : '')),
  };
}

const INSIGHTS_PROJECT_LIMIT = 10;
const INSIGHTS_COMMITS_PER_PROJECT = 5;
const LEDGER_PAGE_SIZE = 50;

export default function InsightsPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [entries, setEntries] = useState<SemanticEntry[]>([]);
  const [ledgerVisible, setLedgerVisible] = useState(LEDGER_PAGE_SIZE);
  const [timeline, setTimeline] = useState<
    { id: string; label: string; detail: string; time: string; stage: string }[]
  >([]);

  useEffect(() => {
    async function loadData() {
      try {
        const projectData = await listProjects(INSIGHTS_PROJECT_LIMIT, 0);
        const projects = projectData.projects;

        if (projects.length === 0) {
          setLoading(false);
          return;
        }

        // Fetch commits for all projects in parallel (capped per project)
        const allCommits: { commit: CommitV4; projectName: string }[] = [];
        await Promise.all(
          projects.map(async (project: Project) => {
            try {
              const commits = await listCommitsV4(
                project.project_id,
                undefined,
                INSIGHTS_COMMITS_PER_PROJECT,
                0
              );
              for (const commit of commits) {
                allCommits.push({ commit, projectName: project.name });
              }
            } catch {
              // Skip projects that fail to load
            }
          })
        );

        // Sort by date descending
        allCommits.sort(
          (a, b) =>
            new Date(b.commit.committed_at).getTime() - new Date(a.commit.committed_at).getTime()
        );

        // Map to SemanticEntry for the Ledger tab
        const semanticEntries = allCommits.map(({ commit, projectName }) =>
          commitToSemanticEntry(commit, projectName)
        );
        setEntries(semanticEntries);

        // Build timeline from recent commits
        const timelineItems = allCommits.slice(0, 10).map(({ commit, projectName }) => ({
          id: commit.hash.slice(7, 19),
          label: commit.message || `Commit on ${commit.branch || 'main'}`,
          detail: `${commit.content.sentences.length} sentences in ${projectName}`,
          time: formatTimeAgo(commit.committed_at),
          stage: 'commit' as const,
        }));
        setTimeline(timelineItems);
      } catch {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading insights...</span>
      </div>
    );
  }

  const isEmpty = entries.length === 0 && timeline.length === 0;

  if (loadError) {
    return (
      <div className="flex h-full flex-col gap-6 overflow-auto p-6">
        <header className="flex items-center gap-3">
          <Lightbulb className="h-5 w-5" />
          <h1 className="text-2xl font-bold tracking-tight">Insights</h1>
        </header>
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load insights data. Please try refreshing the page.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto p-6">
      <header className="flex items-center gap-3">
        <Lightbulb className="h-5 w-5" />
        <h1 className="text-2xl font-bold tracking-tight">Insights</h1>
      </header>

      <Tabs defaultValue="ledger" className="flex-1">
        <TabsList>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="latest">Latest Commits</TabsTrigger>
        </TabsList>

        <TabsContent value="ledger" className="mt-6 space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Ledger</h2>
            <p className="text-sm text-muted-foreground">Semantic commits across all projects.</p>
          </div>
          {isEmpty ? (
            <EmptyState
              icon={GitCommit}
              title="No commits yet"
              description="Create commits to see insights here. Start by adding a conversation and extracting knowledge into a commit."
            />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {entries.slice(0, ledgerVisible).map((entry) => (
                  <SemanticCard key={entry.id} entry={entry} />
                ))}
              </div>
              {entries.length > ledgerVisible && (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setLedgerVisible((v) => v + LEDGER_PAGE_SIZE)}
                  >
                    Load more ({entries.length - ledgerVisible} remaining)
                  </button>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="latest" className="mt-6">
          {isEmpty ? (
            <EmptyState
              icon={Clock3}
              title="No activity yet"
              description="Create commits to see a timeline of activity here."
            />
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Latest Commits</CardTitle>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock3 className="h-3.5 w-3.5" /> {timeline.length} recent
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {timeline.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                  >
                    <Badge
                      variant="outline"
                      className={cn(
                        'shrink-0 text-[10px] uppercase',
                        stageColors[item.stage as keyof typeof stageColors]
                      )}
                    >
                      {item.stage}
                    </Badge>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="font-medium leading-tight">{item.label}</p>
                      <p className="text-sm text-muted-foreground line-clamp-1">{item.detail}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{item.time}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
