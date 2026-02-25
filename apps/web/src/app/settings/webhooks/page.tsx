'use client';

import {
  ExternalLink,
  Loader2,
  MoreVertical,
  Pencil,
  Play,
  Plus,
  Trash2,
  Webhook,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { WebhookForm } from '@/components/settings/WebhookForm';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import type { CreateWebhookInput, UpdateWebhookInput, WebhookData } from '@/lib/api';
import { createWebhook, deleteWebhook, listWebhooks, testWebhook, updateWebhook } from '@/lib/api';

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<WebhookData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<WebhookData | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<WebhookData | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Test state
  const [testingId, setTestingId] = useState<string | null>(null);

  const fetchWebhooks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listWebhooks();
      setWebhooks(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load webhooks';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  // Create / Edit handler
  const handleFormSubmit = useCallback(
    async (data: CreateWebhookInput | UpdateWebhookInput) => {
      setFormLoading(true);
      try {
        if (editingWebhook) {
          const updated = await updateWebhook(
            editingWebhook.webhook_id,
            data as UpdateWebhookInput
          );
          setWebhooks((prev) =>
            prev.map((w) => (w.webhook_id === updated.webhook_id ? updated : w))
          );
          toast.success('Webhook updated');
        } else {
          const created = await createWebhook(data as CreateWebhookInput);
          setWebhooks((prev) => [...prev, created]);
          toast.success('Webhook created');
        }
        setFormOpen(false);
        setEditingWebhook(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Operation failed';
        toast.error(message);
      } finally {
        setFormLoading(false);
      }
    },
    [editingWebhook]
  );

  // Delete handler
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await deleteWebhook(deleteTarget.webhook_id);
      setWebhooks((prev) => prev.filter((w) => w.webhook_id !== deleteTarget.webhook_id));
      toast.success('Webhook deleted');
      setDeleteTarget(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete webhook';
      toast.error(message);
    } finally {
      setDeleteLoading(false);
    }
  }, [deleteTarget]);

  // Test handler
  const handleTest = useCallback(async (webhook: WebhookData) => {
    setTestingId(webhook.webhook_id);
    try {
      const result = await testWebhook(webhook.webhook_id);
      if (result.ok) {
        toast.success(`Test successful (HTTP ${result.status})`);
      } else {
        toast.error(`Test failed (HTTP ${result.status})`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Test request failed';
      toast.error(message);
    } finally {
      setTestingId(null);
    }
  }, []);

  // Open create dialog
  const openCreate = useCallback(() => {
    setEditingWebhook(null);
    setFormOpen(true);
  }, []);

  // Open edit dialog
  const openEdit = useCallback((webhook: WebhookData) => {
    setEditingWebhook(webhook);
    setFormOpen(true);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-[var(--stroke-divider)] px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">Webhooks</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">
              Receive HTTP notifications when events occur in T3X.
            </p>
          </div>
          <Button className="gap-1.5" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Create Webhook
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--text-tertiary)]" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <p className="text-sm text-red-500">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchWebhooks}>
              Retry
            </Button>
          </div>
        ) : webhooks.length === 0 ? (
          <EmptyState
            icon={Webhook}
            title="No webhooks configured"
            description="Create a webhook to receive notifications when events occur in your projects."
            action={{ label: 'Create Webhook', onClick: openCreate }}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {webhooks.map((webhook) => (
              <WebhookCard
                key={webhook.webhook_id}
                webhook={webhook}
                onEdit={openEdit}
                onDelete={setDeleteTarget}
                onTest={handleTest}
                testing={testingId === webhook.webhook_id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) {
            setFormOpen(false);
            setEditingWebhook(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingWebhook ? 'Edit Webhook' : 'Create Webhook'}</DialogTitle>
            <DialogDescription>
              {editingWebhook
                ? 'Update the webhook configuration.'
                : 'Configure a new webhook endpoint to receive event notifications.'}
            </DialogDescription>
          </DialogHeader>
          <WebhookForm
            webhook={editingWebhook}
            onSubmit={handleFormSubmit}
            onCancel={() => {
              setFormOpen(false);
              setEditingWebhook(null);
            }}
            loading={formLoading}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete Webhook"
        description={`Are you sure you want to delete the webhook for "${deleteTarget?.url}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        variant="destructive"
        loading={deleteLoading}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// WebhookCard — individual webhook row
// ---------------------------------------------------------------------------

interface WebhookCardProps {
  webhook: WebhookData;
  onEdit: (webhook: WebhookData) => void;
  onDelete: (webhook: WebhookData) => void;
  onTest: (webhook: WebhookData) => void;
  testing: boolean;
}

function WebhookCard({ webhook, onEdit, onDelete, onTest, testing }: WebhookCardProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--stroke-default)] bg-[var(--surface-card)] p-4 transition-colors hover:bg-[var(--hover-bg)]">
      <div className="flex flex-col gap-1.5 min-w-0 flex-1 mr-4">
        {/* URL + status */}
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full shrink-0 ${
              webhook.active ? 'bg-green-500' : 'bg-[var(--text-tertiary)]'
            }`}
          />
          <span className="text-sm font-medium text-[var(--text-primary)] truncate">
            {webhook.url}
          </span>
          {!webhook.active && (
            <Badge
              variant="outline"
              className="text-xs text-[var(--text-tertiary)] border-[var(--stroke-default)]"
            >
              Inactive
            </Badge>
          )}
        </div>

        {/* Events */}
        <div className="flex flex-wrap gap-1.5">
          {webhook.events.map((event) => (
            <Badge
              key={event}
              variant="outline"
              className="text-xs font-normal text-[var(--text-secondary)] border-[var(--stroke-default)]"
            >
              {event}
            </Badge>
          ))}
        </div>

        {/* Meta info */}
        <div className="flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
          {webhook.project_id && (
            <span className="flex items-center gap-1">
              <ExternalLink className="h-3 w-3" />
              {webhook.project_id}
            </span>
          )}
          {webhook.secret && <span>HMAC enabled</span>}
          <span>Created {new Date(webhook.created_at).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onTest(webhook)}
          disabled={testing || !webhook.active}
          className="gap-1 text-xs"
        >
          {testing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          Test
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">Webhook actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(webhook)}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(webhook)}
              className="text-red-500 focus:text-red-500"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
