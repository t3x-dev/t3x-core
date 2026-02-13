'use client';

import { Loader2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
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
import { createLeaf, type LeafType } from '@/lib/api';
import { cn } from '@/lib/utils';
import { LEAF_TYPES } from './CanvasNodes';

const isRunnerEnabled = process.env.NEXT_PUBLIC_RUNNER_ENABLED === 'true';

interface LeafCreationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commitHash: string;
  projectId: string;
}

export function LeafCreationDialog({
  open,
  onOpenChange,
  commitHash,
  projectId,
}: LeafCreationDialogProps) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [selectedType, setSelectedType] = useState<LeafType>('tweet');
  const [title, setTitle] = useState('');

  const handleCreate = async () => {
    setIsCreating(true);

    try {
      const leaf = await createLeaf({
        commit_hash: commitHash,
        type: selectedType,
        title: title || undefined,
        project_id: projectId,
        constraints: [], // Start empty, user can add in detail page
      });

      toast.success('Leaf created successfully');
      onOpenChange(false);

      // Reset form
      setTitle('');
      setSelectedType('tweet');

      // Navigate to leaf detail page
      router.push(`/project/${projectId}/leaf/${leaf.id}`);
    } catch (err) {
      // Handle specific error codes
      if (err instanceof Error) {
        if (err.message.includes('COMMIT_NOT_FOUND')) {
          toast.error('The commit no longer exists. Please refresh and try again.');
        } else if (err.message.includes('PROJECT_NOT_FOUND')) {
          toast.error('Project not found. Please check your permissions.');
        } else {
          toast.error(err.message);
        }
      } else {
        toast.error('An unexpected error occurred');
      }
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[90vw] max-w-[540px] bg-[var(--color-bg-white)] overflow-hidden z-[60]"
        overlayClassName="z-[60]"
      >
        <DialogHeader>
          <DialogTitle>Create Leaf from Commit</DialogTitle>
          <DialogDescription>
            Create a new leaf to apply constraints and generate output from this commit&apos;s
            knowledge.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Title input */}
          <div className="space-y-2">
            <Label htmlFor="leaf-title">Title (optional)</Label>
            <Input
              id="leaf-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., User Profile System Prompt"
              disabled={isCreating}
            />
          </div>

          {/* Leaf type selection */}
          <div className="space-y-2">
            <Label>Leaf Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {LEAF_TYPES.filter(
                (lt) => isRunnerEnabled || lt.type !== 'deploy_agent'
              ).map((leafType) => {
                const Icon = leafType.icon;
                const isSelected = selectedType === leafType.type;
                return (
                  <button
                    key={leafType.type}
                    type="button"
                    onClick={() => setSelectedType(leafType.type)}
                    disabled={isCreating}
                    className={cn(
                      'flex items-center gap-2 p-3 rounded-lg border text-left transition-colors min-w-0',
                      isSelected
                        ? 'border-[var(--accent-conversation)] bg-[var(--accent-conversation)]/10 text-[var(--accent-conversation)]'
                        : 'border-[var(--color-border)] bg-[var(--color-bg-white)] hover:border-[var(--color-border)] hover:bg-[var(--color-bg-subtle)]',
                      isCreating && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <Icon
                      size={16}
                      className={cn(
                        'shrink-0',
                        isSelected
                          ? 'text-[var(--accent-conversation)]'
                          : 'text-[var(--color-text-muted)]'
                      )}
                    />
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{leafType.label}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Commit hash display (read-only) */}
          <div className="space-y-2">
            <Label>From Commit</Label>
            <div className="p-2 bg-[var(--color-bg-subtle)] rounded-md border border-[var(--color-border)] overflow-hidden">
              <code className="text-xs font-mono text-[var(--color-text-secondary)] block truncate">
                {commitHash}
              </code>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isCreating} className="shrink-0">
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Creating...</span>
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                <span>Create Leaf</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
