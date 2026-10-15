'use client';

import { Check, ChevronDown, FileText, Upload } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { DiscoverHeader } from '@/components/schemas/DiscoverHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getProjectRepoPath } from '@/domain/project/repoPath';
import { useNamespaceAccounts } from '@/hooks/accounts/useNamespaceAccounts';
import { useRepositoryName } from '@/hooks/projects/useRepositoryName';
import { useRepositorySetup } from '@/hooks/projects/useRepositorySetup';
import styles from './NewRepositoryPage.module.css';
import { RepositoryNameFeedback } from './RepositoryNameFeedback';

export function NewRepositoryPage() {
  const params = useParams<{ owner?: string | string[] }>();
  const routeOwner = (Array.isArray(params.owner) ? params.owner[0] : params.owner) || '';
  const [owner, setOwner] = useState(routeOwner);
  const { accounts } = useNamespaceAccounts();
  const setup = useRepositorySetup();
  const router = useRouter();
  const [name, setName] = useState('');
  const nameCheck = useRepositoryName(owner, name);
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'unlisted' | 'public'>('private');
  const [schema, setSchema] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const locked = setup.pending || setup.started;
  const ready = (setup.started || nameCheck.canSubmit) && !fileError;
  const owners = Array.from(new Set([routeOwner, ...accounts.map((item) => item.namespace.slug)]));
  const toggle = (id: string) =>
    setCollapsed((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  function selectSchema(selected: File[]) {
    if (selected.some((file) => file.size > 5 * 1024 * 1024 || !/\.(yaml|yml)$/i.test(file.name))) {
      setFileError('Choose a supported file, up to 5 MB each.');
      return;
    }
    setFileError(null);
    setSchema(selected[0] ?? null);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    const result = await setup.create({
      name: nameCheck.result?.name ?? name,
      description,
      owner,
      visibility,
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
              A repository holds structured state. Set up the basics, then add source material in
              your Workspace.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCollapsed(collapsed.length === 2 ? [] : ['general', 'schema'])}
          >
            {collapsed.length === 2 ? 'Expand all' : 'Collapse all'}
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
                  <RepositoryNameFeedback check={nameCheck} />
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
            {sectionHeader('schema', 2, 'Output structure / Schema', true)}
            <div
              className={styles.panel}
              id="repository-schema"
              hidden={collapsed.includes('schema')}
            >
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
                      onChange={(event) => selectSchema(Array.from(event.target.files ?? []))}
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
                {setup.started || nameCheck.canSubmit ? (
                  <Check size={16} />
                ) : (
                  <span className={styles.pending} />
                )}
                Name
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
