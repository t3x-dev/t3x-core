'use client';

import {
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Webhook,
  X,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { WebhookForm } from '@/components/settings/WebhookForm';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatUserFacingError } from '@/domain/format/errors';
import { useWebhookCommands } from '@/hooks/webhooks/useWebhookCommands';
import type { CreateWebhookInput, UpdateWebhookInput, WebhookData } from '@/types/api';
import styles from './WebhookSettings.module.css';

interface DeliveryRecord {
  id: string;
  endpoint: string;
  event: string;
  status: 'success' | 'failed';
  deliveredAt: Date;
  webhookId: string;
}

const EVENT_LABELS: Record<string, string> = {
  'commit.created': 'Commit created',
  'merge.completed': 'Merge completed',
  'leaf.created': 'Leaf created',
  'leaf.generated': 'Leaf generated',
  'run.completed': 'Run completed',
  'run.failed': 'Run failed',
  'draft.ready': 'Draft ready',
  'check.failed': 'Check failed',
};

function eventLabel(event: string): string {
  return EVENT_LABELS[event] ?? event.replaceAll('.', ' ');
}

function formatTimestamp(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function truncateEndpoint(endpoint: string): string {
  return endpoint.length > 38 ? `${endpoint.slice(0, 35)}…` : endpoint;
}

export default function WebhooksPage() {
  const projectId = useSearchParams().get('project')?.trim() ?? '';
  const { listWebhooks, createWebhook, updateWebhook, deleteWebhook, testWebhook } =
    useWebhookCommands();
  const [webhooks, setWebhooks] = useState<WebhookData[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<WebhookData | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WebhookData | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const projectHref = useMemo(
    () => (projectId ? `/settings?project=${encodeURIComponent(projectId)}` : '/settings'),
    [projectId]
  );

  const fetchWebhooks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const loadedWebhooks = await listWebhooks();
      setWebhooks(
        projectId
          ? loadedWebhooks.filter((webhook) => webhook.project_id === projectId)
          : loadedWebhooks
      );
    } catch (err) {
      setError(formatUserFacingError(err, 'Failed to load webhooks.'));
    } finally {
      setLoading(false);
    }
  }, [listWebhooks, projectId]);

  useEffect(() => {
    void fetchWebhooks();
  }, [fetchWebhooks]);

  const closeForm = useCallback(() => {
    setFormOpen(false);
    setEditingWebhook(null);
  }, []);

  const openCreate = useCallback(() => {
    setEditingWebhook(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((webhook: WebhookData) => {
    setEditingWebhook(webhook);
    setFormOpen(true);
  }, []);

  const handleFormSubmit = useCallback(
    async (data: CreateWebhookInput | UpdateWebhookInput) => {
      setFormLoading(true);
      try {
        if (editingWebhook) {
          const updated = await updateWebhook(
            editingWebhook.webhook_id,
            data as UpdateWebhookInput
          );
          setWebhooks((current) =>
            current.map((webhook) =>
              webhook.webhook_id === updated.webhook_id ? updated : webhook
            )
          );
          toast.success('Webhook updated');
        } else {
          const created = await createWebhook(data as CreateWebhookInput);
          setWebhooks((current) => [...current, created]);
          toast.success('Webhook created');
        }
        closeForm();
      } catch (err) {
        toast.error(formatUserFacingError(err, 'Operation failed.'));
      } finally {
        setFormLoading(false);
      }
    },
    [closeForm, createWebhook, editingWebhook, updateWebhook]
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await deleteWebhook(deleteTarget.webhook_id);
      setWebhooks((current) =>
        current.filter((webhook) => webhook.webhook_id !== deleteTarget.webhook_id)
      );
      setDeleteTarget(null);
      toast.success('Webhook deleted');
    } catch (err) {
      toast.error(formatUserFacingError(err, 'Failed to delete webhook.'));
    } finally {
      setDeleteLoading(false);
    }
  }, [deleteTarget, deleteWebhook]);

  const handleTest = useCallback(
    async (webhook: WebhookData) => {
      setTestingId(webhook.webhook_id);
      let status: DeliveryRecord['status'] = 'failed';
      try {
        const result = await testWebhook(webhook.webhook_id);
        status = result.ok ? 'success' : 'failed';
        if (result.ok) toast.success(`Test successful (HTTP ${result.status})`);
        else toast.error(`Test failed (HTTP ${result.status})`);
      } catch (err) {
        toast.error(formatUserFacingError(err, 'Test request failed.'));
      } finally {
        setDeliveries((current) => [
          {
            id: `${webhook.webhook_id}-${Date.now()}`,
            endpoint: webhook.url,
            event: webhook.events[0] ?? 'webhook.test',
            status,
            deliveredAt: new Date(),
            webhookId: webhook.webhook_id,
          },
          ...current,
        ]);
        setTestingId(null);
      }
    },
    [testWebhook]
  );

  const copyEndpoint = useCallback(async (endpoint: string) => {
    try {
      await navigator.clipboard.writeText(endpoint);
      toast.success('Endpoint copied');
    } catch {
      toast.error('Unable to copy endpoint');
    }
  }, []);

  return (
    <div className={styles.page}>
      <section className={styles.workspace}>
        <header className={styles.pageHeader}>
          <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
            <Link href={projectHref}>Project settings</Link>
            <span aria-hidden="true">/</span>
            <span>Automations</span>
            <span aria-hidden="true">/</span>
            <strong>Webhooks</strong>
          </nav>
          <div className={styles.titleRow}>
            <div className={styles.titleCluster}>
              <h1>Webhooks</h1>
              <span className={styles.scopeBadge}>Project</span>
            </div>
            <Button className={styles.newButton} onClick={openCreate}>
              <Plus aria-hidden="true" className="size-4" />
              New webhook
            </Button>
          </div>
        </header>

        <div className={styles.contentScroll}>
          <section className={styles.panel} aria-labelledby="webhook-list-title">
            <div className={styles.panelTitle}>
              <Webhook aria-hidden="true" />
              <h2 id="webhook-list-title">Webhooks</h2>
            </div>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Endpoint</th>
                    <th>Events</th>
                    <th>Status</th>
                    <th>Last delivery</th>
                    <th className={styles.actionColumn}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} className={styles.emptyCell}>
                        <Loader2 aria-label="Loading webhooks" className={styles.spinner} />
                      </td>
                    </tr>
                  ) : error ? (
                    <tr>
                      <td colSpan={5} className={styles.emptyCell}>
                        <span className={styles.errorText}>{error}</span>
                        <Button size="sm" variant="outline" onClick={() => void fetchWebhooks()}>
                          Retry
                        </Button>
                      </td>
                    </tr>
                  ) : webhooks.length === 0 ? (
                    <tr>
                      <td colSpan={5} className={styles.emptyCell}>
                        <span>No webhooks configured for this project.</span>
                        <button type="button" onClick={openCreate}>
                          Create your first webhook
                        </button>
                      </td>
                    </tr>
                  ) : (
                    webhooks.map((webhook) => {
                      const latestDelivery = deliveries.find(
                        (delivery) => delivery.webhookId === webhook.webhook_id
                      );
                      return (
                        <tr key={webhook.webhook_id}>
                          <td>
                            <div className={styles.endpointCell}>
                              <span title={webhook.url}>{truncateEndpoint(webhook.url)}</span>
                              <button
                                type="button"
                                aria-label={`Copy ${webhook.url}`}
                                onClick={() => void copyEndpoint(webhook.url)}
                              >
                                <Copy aria-hidden="true" />
                              </button>
                            </div>
                          </td>
                          <td>
                            <div className={styles.eventList}>
                              {webhook.events.slice(0, 2).map((event) => (
                                <span className={styles.eventBadge} key={event}>
                                  {eventLabel(event)}
                                </span>
                              ))}
                              {webhook.events.length > 2 ? (
                                <span className={styles.moreEvents}>
                                  +{webhook.events.length - 2}
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td>
                            <span className={webhook.active ? styles.enabled : styles.disabled}>
                              <span aria-hidden="true" />
                              {webhook.active ? 'Enabled' : 'Disabled'}
                            </span>
                          </td>
                          <td>
                            <div className={styles.deliveryCell}>
                              <span>
                                {latestDelivery ? formatTimestamp(latestDelivery.deliveredAt) : '—'}
                              </span>
                              {latestDelivery?.status === 'success' ? (
                                <CheckCircle2 aria-label="Successful delivery" />
                              ) : latestDelivery?.status === 'failed' ? (
                                <XCircle aria-label="Failed delivery" />
                              ) : null}
                            </div>
                          </td>
                          <td className={styles.actionColumn}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className={styles.moreButton}
                                  aria-label={`Actions for ${webhook.url}`}
                                >
                                  <MoreHorizontal aria-hidden="true" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  disabled={testingId === webhook.webhook_id || !webhook.active}
                                  onClick={() => void handleTest(webhook)}
                                >
                                  {testingId === webhook.webhook_id ? (
                                    <Loader2 className="mr-2 size-4 animate-spin" />
                                  ) : (
                                    <Check className="mr-2 size-4" />
                                  )}
                                  Send test
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openEdit(webhook)}>
                                  <Pencil className="mr-2 size-4" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-[var(--status-error)] focus:text-[var(--status-error)]"
                                  onClick={() => setDeleteTarget(webhook)}
                                >
                                  <Trash2 className="mr-2 size-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.panel} aria-labelledby="delivery-list-title">
            <div className={styles.panelTitle}>
              <ClipboardList aria-hidden="true" />
              <h2 id="delivery-list-title">Recent deliveries</h2>
            </div>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Endpoint</th>
                    <th>Event</th>
                    <th>Delivery time</th>
                    <th className={styles.actionColumn}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.length === 0 ? (
                    <tr>
                      <td colSpan={5} className={styles.emptyCell}>
                        Delivery attempts will appear here after you send a test.
                      </td>
                    </tr>
                  ) : (
                    deliveries.map((delivery) => {
                      const webhook = webhooks.find(
                        (item) => item.webhook_id === delivery.webhookId
                      );
                      return (
                        <tr key={delivery.id}>
                          <td>
                            {delivery.status === 'success' ? (
                              <CheckCircle2
                                aria-label="Successful delivery"
                                className={styles.successIcon}
                              />
                            ) : (
                              <XCircle aria-label="Failed delivery" className={styles.errorIcon} />
                            )}
                          </td>
                          <td title={delivery.endpoint}>{truncateEndpoint(delivery.endpoint)}</td>
                          <td>
                            <span className={styles.eventBadge}>{eventLabel(delivery.event)}</span>
                          </td>
                          <td>{formatTimestamp(delivery.deliveredAt)}</td>
                          <td className={styles.deliveryActions}>
                            {delivery.status === 'failed' && webhook ? (
                              <Button
                                size="sm"
                                onClick={() => void handleTest(webhook)}
                                disabled={testingId === webhook.webhook_id}
                              >
                                <RotateCcw aria-hidden="true" className="size-3.5" />
                                Retry
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => toast.info(`${eventLabel(delivery.event)} delivery`)}
                            >
                              Details
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>

      {formOpen ? (
        <aside
          className={styles.drawer}
          aria-label={editingWebhook ? 'Edit webhook' : 'New webhook'}
        >
          <div className={styles.drawerHeader}>
            <h2>{editingWebhook ? 'Edit webhook' : 'New webhook'}</h2>
            <button type="button" aria-label="Close webhook form" onClick={closeForm}>
              <X aria-hidden="true" />
            </button>
          </div>
          <WebhookForm
            webhook={editingWebhook}
            onSubmit={handleFormSubmit}
            onCancel={closeForm}
            loading={formLoading}
            projectId={projectId}
            variant="drawer"
          />
        </aside>
      ) : null}

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
