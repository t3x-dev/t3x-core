'use client';

import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useTerminology } from '@/hooks/useTerminology';
import type { CreateWebhookInput, UpdateWebhookInput, WebhookData } from '@/lib/api';

const WEBHOOK_EVENTS = [
  { value: 'commit.created', label: 'Commit Created', description: 'When a new commit is created' },
  {
    value: 'merge.completed',
    label: 'Merge Completed',
    description: 'When a merge is completed',
  },
  { value: 'leaf.created', label: 'Leaf Created', description: 'When a new leaf is created' },
  {
    value: 'leaf.generated',
    label: 'Leaf Generated',
    description: 'When leaf output is generated',
  },
  { value: 'run.completed', label: 'Run Completed', description: 'When an eval run completes' },
  { value: 'run.failed', label: 'Run Failed', description: 'When an eval run fails' },
] as const;

interface WebhookFormProps {
  /** Existing webhook for edit mode, null for create mode */
  webhook: WebhookData | null;
  /** Called on successful form submission */
  onSubmit: (data: CreateWebhookInput | UpdateWebhookInput) => Promise<void>;
  /** Called when user cancels */
  onCancel: () => void;
  /** Whether the form is currently submitting */
  loading?: boolean;
}

export function WebhookForm({ webhook, onSubmit, onCancel, loading = false }: WebhookFormProps) {
  const { t } = useTerminology();
  const isEdit = webhook !== null;

  const [url, setUrl] = useState(webhook?.url ?? '');
  const [events, setEvents] = useState<string[]>(webhook?.events ?? []);
  const [secret, setSecret] = useState('');
  const [projectId, setProjectId] = useState(webhook?.project_id ?? '');
  const [active, setActive] = useState(webhook?.active ?? true);

  // Reset form when webhook changes
  useEffect(() => {
    setUrl(webhook?.url ?? '');
    setEvents(webhook?.events ?? []);
    setSecret('');
    setProjectId(webhook?.project_id ?? '');
    setActive(webhook?.active ?? true);
  }, [webhook]);

  const toggleEvent = useCallback((event: string) => {
    setEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (isEdit) {
        const data: UpdateWebhookInput = {
          url: url || undefined,
          events: events.length > 0 ? events : undefined,
          secret: secret || undefined,
          project_id: projectId || null,
          active,
        };
        await onSubmit(data);
      } else {
        const data: CreateWebhookInput = {
          url,
          events,
          secret: secret || undefined,
          project_id: projectId || undefined,
          active,
        };
        await onSubmit(data);
      }
    },
    [isEdit, url, events, secret, projectId, active, onSubmit]
  );

  const isValidUrl = (s: string) => {
    try {
      new URL(s);
      return true;
    } catch {
      return false;
    }
  };
  const urlTrimmed = url.trim();
  const urlFormatError = urlTrimmed !== '' && !isValidUrl(urlTrimmed);
  const isValid = urlTrimmed !== '' && isValidUrl(urlTrimmed) && events.length > 0;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* URL */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="webhook-url">
          Endpoint URL <span className="text-red-500">*</span>
        </Label>
        <Input
          id="webhook-url"
          type="url"
          placeholder="https://example.com/webhooks/t3x"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          disabled={loading}
          aria-describedby={urlFormatError ? 'webhook-url-error' : undefined}
        />
        {urlFormatError && (
          <p id="webhook-url-error" className="text-xs text-red-500">
            Please enter a valid URL (e.g. https://example.com/webhook).
          </p>
        )}
        <p className="text-xs text-[var(--text-tertiary)]">
          The URL that will receive webhook POST requests.
        </p>
      </div>

      {/* Events */}
      <div className="flex flex-col gap-2">
        <Label>
          Events <span className="text-red-500">*</span>
        </Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {WEBHOOK_EVENTS.map((event) => (
            // biome-ignore lint/a11y/noLabelWithoutControl: Checkbox renders <input> inside label
            <label
              key={event.value}
              className="flex items-start gap-2.5 rounded-lg border border-[var(--stroke-default)] p-3 cursor-pointer hover:bg-[var(--hover-bg)] transition-colors"
            >
              <Checkbox
                checked={events.includes(event.value)}
                onCheckedChange={() => toggleEvent(event.value)}
                disabled={loading}
                className="mt-0.5"
              />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  {t(event.value.replace('.', '_') as Parameters<typeof t>[0])}
                </span>
                <span className="text-xs text-[var(--text-tertiary)]">{event.description}</span>
              </div>
            </label>
          ))}
        </div>
        {events.length === 0 && <p className="text-xs text-red-500">Select at least one event.</p>}
      </div>

      {/* Secret */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="webhook-secret">Secret</Label>
        <Input
          id="webhook-secret"
          type="password"
          placeholder={isEdit ? '(unchanged)' : 'Optional HMAC signing secret'}
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          disabled={loading}
        />
        <p className="text-xs text-[var(--text-tertiary)]">
          Used for HMAC-SHA256 signature verification of webhook payloads.
          {isEdit && ' Leave blank to keep the current secret.'}
        </p>
      </div>

      {/* Project Filter */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="webhook-project">Project Filter</Label>
        <Input
          id="webhook-project"
          type="text"
          placeholder="proj_... (optional)"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          disabled={loading}
        />
        <p className="text-xs text-[var(--text-tertiary)]">
          Only send events for this project. Leave blank for all projects.
        </p>
      </div>

      {/* Active Toggle */}
      <div className="flex items-center justify-between rounded-lg border border-[var(--stroke-default)] p-3">
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="webhook-active" className="cursor-pointer">
            Active
          </Label>
          <p className="text-xs text-[var(--text-tertiary)]">
            Enable or disable this webhook without deleting it.
          </p>
        </div>
        <Switch
          id="webhook-active"
          checked={active}
          onCheckedChange={setActive}
          disabled={loading}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" disabled={!isValid || loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
          {isEdit ? 'Save Changes' : 'Create Webhook'}
        </Button>
      </div>
    </form>
  );
}
