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
  const [selectedType, setSelectedType] = useState<LeafType>('deploy_agent');
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
      setSelectedType('deploy_agent');

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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Leaf from Commit</DialogTitle>
          <DialogDescription>
            Create a new leaf to apply constraints and generate output from this commit&apos;s knowledge.
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
              {LEAF_TYPES.map((leafType) => {
                const Icon = leafType.icon;
                const isSelected = selectedType === leafType.type;
                return (
                  <button
                    key={leafType.type}
                    type="button"
                    onClick={() => setSelectedType(leafType.type)}
                    disabled={isCreating}
                    className={cn(
                      'flex items-center gap-2 p-3 rounded-lg border text-left transition-colors',
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50',
                      isCreating && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <Icon size={16} className={isSelected ? 'text-indigo-600' : 'text-gray-500'} />
                    <div>
                      <div className="font-medium text-sm">{leafType.label}</div>
                      <div className="text-xs text-gray-500">
                        {leafType.category === 'runner' ? 'Runner' : 'Output'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Commit hash display (read-only) */}
          <div className="space-y-2">
            <Label>From Commit</Label>
            <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-md border border-gray-200">
              <code className="text-xs font-mono text-gray-600 truncate flex-1">
                {commitHash}
              </code>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isCreating}
          >
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isCreating}>
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Create Leaf
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
