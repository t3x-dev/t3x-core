'use client';

import { Check, ChevronDown, FileText, Upload } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { DiscoverHeader } from '@/components/schemas/DiscoverHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DEFAULT_OWNER_SLUG, getProjectRepoPath, toRepoSlug } from '@/domain/project/repoPath';
import { useNamespaceAccounts } from '@/hooks/accounts/useNamespaceAccounts';
import { useRepositorySetup } from '@/hooks/projects/useRepositorySetup';
import { useProviderCommands } from '@/hooks/providers/useProviderCommands';
import { useProvidersList } from '@/hooks/shared/useProvidersList';
import styles from './NewRepositoryPage.module.css';

export function NewRepositoryPage() {
  const params = useParams<{ owner?: string | string[] }>();
  const routeOwner =
    (Array.isArray(params.owner) ? params.owner[0] : params.owner) || DEFAULT_OWNER_SLUG;
  const [owner, setOwner] = useState(routeOwner);
  const { accounts } = useNamespaceAccounts();
  const { providers, loading } = useProvidersList();
  const { runProviderConnectionTest } = useProviderCommands();
  const setup = useRepositorySetup();
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'unlisted' | 'public'>('private');
  const [providerId, setProviderId] = useState('');
  const provider =
    providers.find((item) => item.id === providerId) ?? providers.find((item) => item.configured);
  const [modelId, setModelId] = useState('');
  const models = Array.from(
    new Set([
      ...(provider?.available_models ?? []),
      ...(provider?.default_model ? [provider.default_model] : []),
    ])
  );
  const model = models.includes(modelId) ? modelId : provider?.default_model || models[0] || '';
  const [tested, setTested] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [schema, setSchema] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const locked = setup.pending || setup.started;
  const ready =
    !!name.trim() && !!provider?.configured && !!model && tested === provider.id && !fileError;
  const owners = Array.from(new Set([routeOwner, ...accounts.map((item) => item.namespace.slug)]));
  const toggle = (id: string) =>
    setCollapsed((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  async function testConnection() {
    if (!provider) return;
    const id = provider.id;
    setTesting(true);
    setTestError(null);
    setTested(null);
    try {
      const result = await runProviderConnectionTest(id);
      if (result.ok) setTested(id);
      else setTestError(result.error || 'Connection test failed.');
    } catch (error) {
      setTestError(error instanceof Error ? error.message : 'Connection test failed.');
    } finally {
      setTesting(false);
    }
  }
  function selectFiles(selected: File[], outputSchema: boolean) {
    const allowed = outputSchema ? /\.(yaml|yml)$/i : /\.(pdf|docx|md|markdown|csv)$/i;
    if (selected.some((file) => file.size > 5 * 1024 * 1024 || !allowed.test(file.name))) {
      setFileError('Choose a supported file, up to 5 MB each.');
      return;
    }
    setFileError(null);
    if (outputSchema) setSchema(selected[0] ?? null);
    else setFiles(selected);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || !provider) return;
    const result = await setup.create({
      name,
      description,
      owner,
      visibility,
      provider: provider.id,
      model,
      files,
      schema,
    });
    if (result)
      router.push(
        `${getProjectRepoPath(result.project, owner)}/workspaces?workspace=${encodeURIComponent(result.workspaceId)}&conversation=${encodeURIComponent(result.conversationId)}`
      );
  }
  function sectionHeader(id: string, number: number, title: string, optional = false) {
    return (
      <button
        type="button"
        className={styles.sectionHeading}
        aria-expanded={!collapsed.includes(id)}
        aria-controls={`repository-${id}`}
        onClick={() => toggle(id)}
      >
        <span>{number}</span>
        <h2>{title}</h2>
        {optional && <small>Optional</small>}
        <ChevronDown />
      </button>
    );
  }
  return (
    <div className="min-h-screen bg-[var(--surface-panel)] text-[var(--text-primary)]">
      <DiscoverHeader
        owner={owner}
        namespaceTab="repositories"
        settingsHref={`/settings/provider-credentials?owner=${encodeURIComponent(owner)}`}
      />
      <main className={styles.page}>
        <div className={styles.heading}>
          <div>
            <h1>Create a new repository</h1>
            <p>
              A repository holds structured state. Set up the basics, connect AI, and optionally add
              starting material.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setCollapsed(collapsed.length === 3 ? [] : ['general', 'ai', 'material'])
            }
          >
            {collapsed.length === 3 ? 'Expand all' : 'Collapse all'}
          </button>
        </div>
        <form onSubmit={submit}>
          <section className={styles.section}>
            {sectionHeader('general', 1, 'General')}
            <div
              className={styles.panel}
              id="repository-general"
              hidden={collapsed.includes('general')}
            >
              <div className={styles.field}>
                <label htmlFor="repo-owner">Owner</label>
                <select
                  id="repo-owner"
                  disabled={locked}
                  value={owner}
                  onChange={(event) => setOwner(event.target.value)}
                >
                  {owners.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor="repo-name">Repository name</label>
                <div>
                  <Input
                    id="repo-name"
                    autoFocus
                    disabled={locked}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="product-catalog"
                  />
                  <p className={styles.hint}>
                    Available at{' '}
                    <code>
                      /{owner}/{toRepoSlug(name.trim() || 'New repository')}
                    </code>
                  </p>
                </div>
              </div>
              <div className={styles.field}>
                <label htmlFor="repo-description">
                  Description<small aria-hidden="true">Optional</small>
                </label>
                <Input
                  id="repo-description"
                  aria-label="Description"
                  disabled={locked}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="What structured state does this repository track?"
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="repo-visibility">Visibility</label>
                <select
                  id="repo-visibility"
                  disabled={locked}
                  value={visibility}
                  onChange={(event) => setVisibility(event.target.value as typeof visibility)}
                >
                  <option value="private">Private</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="public">Public</option>
                </select>
              </div>
            </div>
          </section>
          <section className={styles.section}>
            {sectionHeader('ai', 2, 'AI')}
            <div className={styles.panel} id="repository-ai" hidden={collapsed.includes('ai')}>
              <div className={styles.field}>
                <label htmlFor="repo-provider">Connection</label>
                <div>
                  <div className={styles.connection}>
                    <select
                      id="repo-provider"
                      disabled={locked || testing || loading}
                      value={provider?.id || ''}
                      onChange={(event) => {
                        setProviderId(event.target.value);
                        setModelId('');
                        setTested(null);
                        setTestError(null);
                      }}
                    >
                      <option value="" disabled>
                        {loading ? 'Loading connections…' : 'Select a connection'}
                      </option>
                      {providers
                        .filter((item) => item.configured)
                        .map((item) => (
                          <option value={item.id} key={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                    <span className={styles.testStatus}>
                      {tested === provider?.id ? 'Connected' : 'Not tested'}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!provider || testing || locked}
                      onClick={() => void testConnection()}
                    >
                      {testing ? 'Testing…' : 'Test'}
                    </Button>
                  </div>
                  {testError && (
                    <p role="alert" className={styles.error}>
                      {testError}
                    </p>
                  )}
                  {!loading && !provider && (
                    <Link href="/settings/providers">Configure a connection</Link>
                  )}
                </div>
              </div>
              <div className={styles.field}>
                <label htmlFor="repo-model">Model</label>
                <select
                  id="repo-model"
                  disabled={locked || !provider}
                  value={model}
                  onChange={(event) => setModelId(event.target.value)}
                >
                  <option value="" disabled>
                    Select a model
                  </option>
                  {models.map((value) => (
                    <option key={value} value={value}>
                      {value}
                      {value === provider?.default_model ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>
          <section className={styles.section}>
            {sectionHeader('material', 3, 'Initial material', true)}
            <div
              className={styles.panel}
              id="repository-material"
              hidden={collapsed.includes('material')}
            >
              <div className={styles.field}>
                <span>
                  Files<small>PDF, DOCX, Markdown, CSV · up to 5 MB each</small>
                </span>
                <div className={styles.upload}>
                  <FileText size={20} />
                  <span>{files.map((file) => file.name).join(', ') || 'None'}</span>
                  <label>
                    {' '}
                    <Upload size={14} />
                    Upload
                    <input
                      aria-label="Upload files"
                      type="file"
                      multiple
                      accept=".pdf,.docx,.md,.markdown,.csv"
                      disabled={locked}
                      onChange={(event) => selectFiles(Array.from(event.target.files ?? []), false)}
                    />
                  </label>
                  {files.length > 0 && (
                    <button type="button" disabled={locked} onClick={() => setFiles([])}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
              <div className={styles.field}>
                <span>
                  Output structure
                  <small>A .yaml or .yml schema that defines the data structure</small>
                </span>
                <div className={styles.upload}>
                  <FileText size={20} />
                  <span>{schema?.name || 'None'}</span>
                  <label>
                    <Upload size={14} />
                    Upload YAML
                    <input
                      aria-label="Upload YAML"
                      type="file"
                      accept=".yaml,.yml"
                      disabled={setup.pending}
                      onChange={(event) => selectFiles(Array.from(event.target.files ?? []), true)}
                    />
                  </label>
                  {schema && (
                    <button type="button" disabled={setup.pending} onClick={() => setSchema(null)}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>
          {(fileError || setup.error) && (
            <p role="alert" className={styles.error}>
              {fileError || setup.error}
            </p>
          )}
          <footer className={styles.footer}>
            <div>
              <span className={styles.status}>
                {name.trim() ? <Check size={16} /> : <span className={styles.pending} />}Name
              </span>
              <span className={styles.status}>
                {tested === provider?.id ? (
                  <Check size={16} />
                ) : (
                  <span className={styles.pending} />
                )}
                AI connection
              </span>
              <span className={styles.destination}>Prepares main + Workspace</span>
              <Button type="submit" variant="commit" disabled={!ready || setup.pending}>
                {setup.pending
                  ? 'Creating…'
                  : setup.started
                    ? 'Retry setup'
                    : 'Create and start conversation'}
              </Button>
            </div>
          </footer>
        </form>
      </main>
    </div>
  );
}
