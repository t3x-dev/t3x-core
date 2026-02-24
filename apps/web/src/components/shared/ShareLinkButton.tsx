'use client';

/**
 * ShareLinkButton — Creates and manages share links for entities.
 *
 * Shows a button that creates/copies a share link on click.
 * If a link already exists, shows dropdown for management.
 */

import { Check, Copy, Link2, Loader2, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ShareLink } from '@/lib/api';
import * as api from '@/lib/api';
import { cn } from '@/lib/utils';

interface ShareLinkButtonProps {
  entityType: 'leaf';
  entityId: string;
  className?: string;
}

export function ShareLinkButton({ entityType, entityId, className }: ShareLinkButtonProps) {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Load existing share links on mount
  useEffect(() => {
    api
      .listShareLinks(entityType, entityId)
      .then(setLinks)
      .catch(() => {});
  }, [entityType, entityId]);

  const shareUrl = useCallback((token: string) => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/share/${token}`;
  }, []);

  const handleCreate = useCallback(async () => {
    setLoading(true);
    try {
      const link = await api.createShareLink(entityType, entityId);
      setLinks((prev) => [...prev, link]);

      // Auto-copy
      await navigator.clipboard.writeText(shareUrl(link.token));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to create share link:', err);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, shareUrl]);

  const handleCopy = useCallback(
    async (token: string) => {
      await navigator.clipboard.writeText(shareUrl(token));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    },
    [shareUrl]
  );

  const handleRevoke = useCallback(async (id: string) => {
    try {
      await api.revokeShareLink(id);
      setLinks((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      console.error('Failed to revoke share link:', err);
    }
  }, []);

  const activeLinks = links.filter((l) => !l.revoked_at);

  if (activeLinks.length === 0) {
    // No existing link — show simple create button
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleCreate}
        disabled={loading}
        className={cn('gap-1.5', className)}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : copied ? (
          <Check className="h-3.5 w-3.5 text-[var(--diff-added-accent)]" />
        ) : (
          <Link2 className="h-3.5 w-3.5" />
        )}
        {copied ? 'Copied!' : 'Share'}
      </Button>
    );
  }

  // Has existing link — show dropdown with management
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={cn('gap-1.5', className)}>
          <Link2 className="h-3.5 w-3.5" />
          Share
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {activeLinks.map((link) => (
          <div key={link.id} className="flex items-center gap-2 px-2 py-1.5">
            <span className="flex-1 truncate text-xs font-mono text-[var(--text-secondary)]">
              {shareUrl(link.token)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => handleCopy(link.token)}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-[var(--diff-added-accent)]" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-destructive"
              onClick={() => handleRevoke(link.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleCreate} disabled={loading}>
          {loading ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Link2 className="mr-2 h-3.5 w-3.5" />
          )}
          Create New Link
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
