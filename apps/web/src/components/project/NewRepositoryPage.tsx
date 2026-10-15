'use client';

import {
  initialRepositoryReadme,
  RepositoryReadmeSchema,
  RepositoryTagsSchema,
} from '@t3x-dev/api-client';
import { ChevronDown, Globe, Link2, LockKeyhole, UserRound } from 'lucide-react';
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
import { RepositoryTagsInput } from './RepositoryTagsInput';

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
  const [initializeReadme, setInitializeReadme] = useState(false);
  const [tags, setTags] = useState('');
  const parsedTags = RepositoryTagsSchema.safeParse(tags.split('\n'));
  const parsedReadme = RepositoryReadmeSchema.safeParse(
    initializeReadme ? initialRepositoryReadme(nameCheck.result?.name ?? name, description) : ''
  );
  const [visibility, setVisibility] = useState<'private' | 'unlisted' | 'public'>('private');
  const locked = setup.pending || setup.started;
  const ready =
    setup.started || (nameCheck.canSubmit && parsedTags.success && parsedReadme.success);
  const owners = Array.from(new Set([routeOwner, ...accounts.map((item) => item.namespace.slug)]));
  const VisibilityIcon =
    visibility === 'private' ? LockKeyhole : visibility === 'public' ? Globe : Link2;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    const result = await setup.create({
      name: nameCheck.result?.name ?? name,
      description,
      owner,
      visibility,
      initializeReadme,
      tags: parsedTags.success ? parsedTags.data : [],
    });
    if (result)
      router.push(
        `${getProjectRepoPath(result.project, owner)}/workspaces?workspace=${encodeURIComponent(result.workspaceId)}&conversation=${encodeURIComponent(result.conversationId)}`
      );
  }

  return (
    <div className="min-h-screen bg-[var(--surface-card)] text-[var(--text-primary)]">
      <DiscoverHeader
        owner={owner}
        namespaceTab="repositories"
        settingsHref={`/settings/provider-credentials?owner=${encodeURIComponent(owner)}`}
      />
      <main className={styles.page}>
        <header className={styles.heading}>
          <h1>Create a new repository</h1>
          <p>
            A repository holds your structured state and its history. Add source material later in
            your Workspace.
          </p>
          <p className={styles.requiredNote}>Required fields are marked with an asterisk (*).</p>
        </header>
        <form onSubmit={submit}>
          <section className={styles.section} aria-labelledby="repository-general-heading">
            <div className={styles.sectionHeading}>
              <span className={styles.step} aria-hidden="true">
                1
              </span>
              <h2 id="repository-general-heading">General</h2>
            </div>
            <div className={styles.sectionBody}>
              <div className={styles.nameRow}>
                <div className={styles.field}>
                  <label htmlFor="repo-owner">
                    Owner <span aria-hidden="true">*</span>
                  </label>
                  <div className={styles.selectControl}>
                    <UserRound className={styles.selectIcon} size={16} aria-hidden="true" />
                    <select
                      id="repo-owner"
                      aria-label="Owner"
                      required
                      disabled={locked}
                      value={owner}
                      onChange={(event) => setOwner(event.target.value)}
                    >
                      {owners.map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                    <ChevronDown className={styles.selectChevron} size={14} aria-hidden="true" />
                  </div>
                </div>
                <span className={styles.pathSeparator} aria-hidden="true">
                  /
                </span>
                <div className={styles.field}>
                  <label htmlFor="repo-name">
                    Repository name <span aria-hidden="true">*</span>
                  </label>
                  <Input
                    id="repo-name"
                    aria-label="Repository name"
                    required
                    autoFocus
                    autoComplete="off"
                    aria-describedby="repository-name-help repository-name-feedback"
                    disabled={locked}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
              </div>
              <div className={styles.nameHelp}>
                <p id="repository-name-help">
                  Choose a short, descriptive name for your repository.
                </p>
                <div id="repository-name-feedback">
                  {(name.length > 0 || nameCheck.error) && (
                    <RepositoryNameFeedback check={nameCheck} />
                  )}
                </div>
              </div>
              <div className={styles.field}>
                <label htmlFor="repo-description">
                  Description{' '}
                  <span className={styles.optional} aria-hidden="true">
                    Optional
                  </span>
                </label>
                <Input
                  id="repo-description"
                  aria-label="Description"
                  disabled={locked}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
            </div>
          </section>
          <section className={styles.section} aria-labelledby="repository-configuration-heading">
            <div className={styles.sectionHeading}>
              <span className={styles.step} aria-hidden="true">
                2
              </span>
              <h2 id="repository-configuration-heading">Configuration</h2>
            </div>
            <div className={styles.sectionBody}>
              <div className={styles.visibilityCard}>
                <div className={styles.optionCopy}>
                  <label htmlFor="repo-visibility">
                    Choose visibility <span aria-hidden="true">*</span>
                  </label>
                  <p id="repository-visibility-help">Choose who can access this repository.</p>
                </div>
                <div className={styles.selectControl}>
                  <VisibilityIcon className={styles.selectIcon} size={16} aria-hidden="true" />
                  <select
                    id="repo-visibility"
                    aria-label="Visibility"
                    aria-describedby="repository-visibility-help"
                    disabled={locked}
                    value={visibility}
                    onChange={(event) => setVisibility(event.target.value as typeof visibility)}
                  >
                    <option value="private">Private</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="public">Public</option>
                  </select>
                  <ChevronDown className={styles.selectChevron} size={14} aria-hidden="true" />
                </div>
              </div>
              <div className={styles.optionGroup}>
                <div className={styles.reservedOption}>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <input
                        type="checkbox"
                        checked={initializeReadme}
                        disabled={locked}
                        onChange={(event) => setInitializeReadme(event.target.checked)}
                      />
                      Initialize README
                    </label>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Use the confirmed repository name and description. You can edit it later.
                    </p>
                    {!parsedReadme.success ? (
                      <p role="alert" className="text-sm text-[var(--status-error)]">
                        {parsedReadme.error.issues[0]?.message}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className={styles.reservedOption}>
                  <RepositoryTagsInput value={tags} onChange={setTags} disabled={locked} />
                </div>
              </div>
            </div>
          </section>
          {setup.error && (
            <p role="alert" className={styles.error}>
              {setup.error}
            </p>
          )}
          <footer className={styles.footer}>
            <Button type="submit" variant="commit" size="sm" disabled={!ready || setup.pending}>
              {setup.pending ? 'Creating…' : setup.started ? 'Retry setup' : 'Create repository'}
            </Button>
          </footer>
        </form>
      </main>
    </div>
  );
}
