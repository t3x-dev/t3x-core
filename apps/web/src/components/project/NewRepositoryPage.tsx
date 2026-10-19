'use client';

import {
  initialRepositoryReadme,
  RepositoryReadmeSchema,
  RepositoryTagsSchema,
} from '@t3x-dev/api-client';
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Globe,
  Link2,
  LockKeyhole,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { DiscoverHeader } from '@/components/schemas/DiscoverHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getProjectRepoPath } from '@/domain/project/repoPath';
import { useNamespaceAccounts } from '@/hooks/accounts/useNamespaceAccounts';
import { useRepositoryName } from '@/hooks/projects/useRepositoryName';
import { useRepositorySetup } from '@/hooks/projects/useRepositorySetup';
import palette from '@/styles/management-palette.module.css';
import { cn } from '@/utils/cn';
import styles from './NewRepositoryPage.module.css';
import { RepositoryNameFeedback } from './RepositoryNameFeedback';
import { type RepositoryTagsDraft, RepositoryTagsInput } from './RepositoryTagsInput';

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
  const [tags, setTags] = useState<RepositoryTagsDraft>({ tags: [], input: '' });
  const parsedTags = RepositoryTagsSchema.safeParse([...tags.tags, tags.input]);
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
  const visibilityDescription = {
    private: 'Only people with permission can access this repository.',
    unlisted: 'Anyone with the repository address can access it.',
    public: 'Anyone can discover and access this repository.',
  }[visibility];

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
    <div className={cn(palette.scope, styles.shell)}>
      <DiscoverHeader
        owner={owner}
        namespaceTab="repositories"
        settingsHref={`/settings/provider-credentials?owner=${encodeURIComponent(owner)}`}
      />
      <main className={styles.page}>
        <Link href={`/${routeOwner}`} className={styles.backLink}>
          <ArrowLeft aria-hidden="true" className="size-4" /> Back to repositories
        </Link>
        <header className={styles.heading}>
          <p className={styles.eyebrow}>A new place to begin</p>
          <h1>Create a new repository</h1>
          <p>
            Keep your structured state and its history together. Start with the essentials; add
            source material later in your Workspace.
          </p>
          <p className={styles.requiredNote}>Required fields are marked with an asterisk (*).</p>
        </header>
        <form onSubmit={submit} aria-busy={setup.pending}>
          <section className={styles.section} aria-labelledby="repository-general-heading">
            <div className={styles.sectionHeading}>
              <h2 id="repository-general-heading">General</h2>
              <p>Choose where this repository belongs and give it a name.</p>
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
              <h2 id="repository-configuration-heading">Configuration</h2>
              <p>Set access now. README and tags are optional.</p>
            </div>
            <div className={styles.sectionBody}>
              <div className={styles.visibilityCard}>
                <div className={styles.optionCopy}>
                  <label htmlFor="repo-visibility">
                    Choose visibility <span aria-hidden="true">*</span>
                  </label>
                  <p id="repository-visibility-help">{visibilityDescription}</p>
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
                  <div className={styles.readmeOption}>
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <input
                        type="checkbox"
                        checked={initializeReadme}
                        disabled={locked}
                        onChange={(event) => setInitializeReadme(event.target.checked)}
                      />
                      Initialize README
                    </label>
                    <p>Start with your repository name and description. You can edit it later.</p>
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
            <p>
              {setup.started
                ? 'Your repository is created. Finish setup to open its Workspace.'
                : 'Next, you’ll enter a new Workspace where you can add source material.'}
            </p>
            <Button type="submit" size="lg" disabled={!ready || setup.pending}>
              {setup.pending ? 'Creating…' : setup.started ? 'Retry setup' : 'Create repository'}
              {!setup.pending && <ArrowRight aria-hidden="true" className="size-4" />}
            </Button>
          </footer>
        </form>
      </main>
    </div>
  );
}
