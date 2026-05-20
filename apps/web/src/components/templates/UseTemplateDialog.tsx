'use client';

import { Loader2, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCommitsList } from '@/hooks/commits/useCommitsList';
import { useCreateLeaf } from '@/hooks/leaves/useCreateLeaf';
import { useProjectsList } from '@/hooks/projects/useProjectsList';
import { useTerminology } from '@/hooks/shared/useTerminology';
import type { ApiCommit, LeafType, Project, Template } from '@/types/api';

interface UseTemplateDialogProps {
  template: Template | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UseTemplateDialog({ template, open, onOpenChange }: UseTemplateDialogProps) {
  const { t } = useTerminology();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [commits, setCommits] = useState<ApiCommit[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedCommitHash, setSelectedCommitHash] = useState('');
  const [title, setTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingCommits, setLoadingCommits] = useState(false);
  const { loadProjects } = useProjectsList();
  const { loadCommits } = useCommitsList();
  const { create: createLeaf } = useCreateLeaf();

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedProjectId('');
      setSelectedCommitHash('');
      setCommits([]);
      setTitle('');
    }
  }, [open]);

  // Load projects on open
  useEffect(() => {
    if (!open) return;
    setLoadingProjects(true);
    loadProjects()
      .then((data) => setProjects(data.projects))
      .catch(() => toast.error('Failed to load projects'))
      .finally(() => setLoadingProjects(false));
  }, [open, loadProjects]);

  // Load commits when project changes
  useEffect(() => {
    if (!selectedProjectId) {
      setCommits([]);
      setSelectedCommitHash('');
      return;
    }
    let cancelled = false;
    setLoadingCommits(true);
    loadCommits(selectedProjectId)
      .then((c) => {
        if (!cancelled) {
          setCommits(c);
          if (c.length > 0) setSelectedCommitHash(c[0].hash);
        }
      })
      .catch(() => {
        if (!cancelled) toast.error('Failed to load commits');
      })
      .finally(() => {
        if (!cancelled) setLoadingCommits(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId, loadCommits]);

  // Pre-fill title from template
  useEffect(() => {
    if (template && open) {
      setTitle(`${template.title} Leaf`);
    }
  }, [template, open]);

  const handleCreate = async () => {
    if (!template || !selectedProjectId || !selectedCommitHash) return;
    setIsCreating(true);

    try {
      const leaf = await createLeaf({
        source: { type: 'user' },
        commit_hash: selectedCommitHash,
        type: template.leaf_type as LeafType,
        title: title || undefined,
        project_id: selectedProjectId,
        constraints: [],
        config: {
          template_id: template.template_id,
          prompt_template: template.system_prompt,
        },
      });

      toast.success('Leaf created from template');
      onOpenChange(false);
      router.push(`/project/${selectedProjectId}/leaf/${leaf.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create leaf');
    } finally {
      setIsCreating(false);
    }
  };

  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Use Template</DialogTitle>
          <DialogDescription>Create a leaf from &ldquo;{template.title}&rdquo;</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Template info */}
          <div className="flex items-center gap-2">
            <Badge variant="outline">{template.leaf_type}</Badge>
            <Badge variant="outline">{template.category}</Badge>
          </div>

          {/* Project selection */}
          <div className="space-y-1.5">
            <Label>Project</Label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              disabled={loadingProjects || isCreating}
              className="w-full h-9 rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)] px-3 text-sm text-[var(--text-primary)]"
            >
              <option value="">Select a project...</option>
              {projects.map((p) => (
                <option key={p.project_id} value={p.project_id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Commit selection */}
          <div className="space-y-1.5">
            <Label>{t('commit')}</Label>
            {loadingCommits ? (
              <div className="flex items-center gap-2 h-9 text-sm text-[var(--text-tertiary)]">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading commits...
              </div>
            ) : commits.length === 0 ? (
              <p className="text-sm text-[var(--text-tertiary)] py-2">
                {selectedProjectId
                  ? 'No commits found in this project.'
                  : 'Select a project first.'}
              </p>
            ) : (
              <select
                value={selectedCommitHash}
                onChange={(e) => setSelectedCommitHash(e.target.value)}
                disabled={isCreating}
                className="w-full h-9 rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)] px-3 text-sm text-[var(--text-primary)]"
              >
                {commits.map((c) => (
                  <option key={c.hash} value={c.hash}>
                    {c.message || c.hash.slice(7, 19)} ({c.content?.trees?.length ?? 0} nodes)
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label>Leaf Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Product Launch Tweet"
              disabled={isCreating}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={isCreating || !selectedProjectId || !selectedCommitHash}
            className="gap-1"
          >
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Play className="h-3 w-3" />
                Create Leaf
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
