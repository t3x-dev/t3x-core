'use client';

import {
  initialRepositoryReadme,
  RepositoryReadmeSchema,
  RepositoryTagsSchema,
} from '@t3x-dev/api-client';
import { ArrowLeft, ArrowRight, ArrowUpRight, Loader2, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { DiscoverHeader } from '@/components/schemas/DiscoverHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { safeExploreReturn } from '@/domain/project/exploreLocation';
import { getProjectRepoPath } from '@/domain/project/repoPath';
import { useNamespaceAccounts } from '@/hooks/accounts/useNamespaceAccounts';
import { useRepositoryName } from '@/hooks/projects/useRepositoryName';
import { useRepositorySetup } from '@/hooks/projects/useRepositorySetup';
import palette from '@/styles/management-palette.module.css';
import { cn } from '@/utils/cn';
import styles from './NewRepositoryPage.module.css';
import { visibilityOptions } from './RepositoryIdentity';
import management from './RepositoryManagement.module.css';
import { RepositoryNameFeedback } from './RepositoryNameFeedback';
import { RepositorySelect } from './RepositorySelect';
import { type RepositoryTagsDraft, RepositoryTagsInput } from './RepositoryTagsInput';

export function NewRepositoryPage() {
  const params = useParams<{ owner?: string | string[] }>();
  const routeOwner = (Array.isArray(params.owner) ? params.owner[0] : params.owner) || '';
  const [owner, setOwner] = useState(routeOwner);
  const { accounts } = useNamespaceAccounts();
  const setup = useRepositorySetup();
  const router = useRouter();
  const search = useSearchParams();
  const returnTo = safeExploreReturn(search?.get('returnTo'));
  const [name, setName] = useState('');
  const nameCheck = useRepositoryName(owner, name);
  const [description, setDescription] = useState('');
  const [initializeReadme, setInitializeReadme] = useState(false);
  const [initializePrdStarter, setInitializePrdStarter] = useState(false);
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
  const visibilityDescription = {
    private: 'Only people with permission can access this repository.',
    unlisted: 'Anyone with the repository address can access it.',
    public: 'Anyone can discover and access this repository.',
  }[visibility];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || setup.pending) return;
    const result = await setup.create({
      name: nameCheck.result?.name ?? name,
      description,
      owner,
      visibility,
      initializeReadme,
      starter: initializePrdStarter ? 'prd-v1' : undefined,
      tags: parsedTags.success ? parsedTags.data : [],
    });
    if (result && returnTo) {
      const target = new URL(returnTo, 'http://local');
      target.searchParams.set('studioTarget', result.project.project_id);
      target.searchParams.set('workspace', result.workspaceId);
      target.searchParams.set('branch', 'main');
      router.push(`${target.pathname}?${target.searchParams}`);
    } else if (result)
      router.push(
        `${getProjectRepoPath(result.project, owner)}/workspaces?workspace=${encodeURIComponent(result.workspaceId)}&conversation=${encodeURIComponent(result.conversationId)}`
      );
  }

  return (
    <div className={cn(palette.scope, management.shell)}>
      <DiscoverHeader
        owner={owner}
        namespaceTab="repositories"
        settingsHref={`/settings/provider-credentials?owner=${encodeURIComponent(owner)}`}
      />
      <div className={management.content}>
        <main className={cn(management.scope, styles.page)}>
          <div className={styles.backRow}>
            <Link href={returnTo ?? `/${routeOwner}`} className={management.backLink}>
              <ArrowLeft aria-hidden="true" className="size-4" />{' '}
              {returnTo ? 'Back to Explore' : 'Back to repositories'}
            </Link>
            {!returnTo && (
              <Link href="/explore?view=browse" className={management.backLink}>
                Browse Schema sources <ArrowUpRight aria-hidden="true" size={14} />
              </Link>
            )}
          </div>
          <header className={cn(management.heading, styles.introduction)}>
            <h1>Create a new repository</h1>
            <p>Keep your structured state and its history together.</p>
            <p className={styles.requiredNote}>Required fields are marked *</p>
          </header>
          <form onSubmit={submit} aria-busy={setup.pending}>
            <section className={styles.section} aria-labelledby="repository-general-heading">
              <div className={styles.sectionHeading}>
                <span className={styles.stepNumber} aria-hidden="true">
                  1
                </span>
                <h2 id="repository-general-heading">General</h2>
              </div>
              <div className={styles.sectionBody}>
                <div>
                  <div className={styles.nameRow}>
                    <div className={styles.field}>
                      <label htmlFor="repo-owner">
                        Owner <span aria-hidden="true">*</span>
                      </label>
                      <RepositorySelect
                        id="repo-owner"
                        label="Owner"
                        required
                        disabled={locked}
                        value={owner}
                        onValueChange={setOwner}
                        className={styles.ownerSelect}
                        options={owners.map((value) => ({ value, label: value, icon: UserRound }))}
                      />
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
                        aria-invalid={
                          name.length > 0 &&
                          Boolean(nameCheck.result && !nameCheck.result.available)
                        }
                        disabled={locked}
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                      />
                    </div>
                  </div>
                  <div className={styles.nameHelp}>
                    <p
                      id="repository-name-help"
                      hidden={name.length > 0 || Boolean(nameCheck.error)}
                    >
                      Choose a short, descriptive name for your repository.
                    </p>
                    <div id="repository-name-feedback">
                      {(name.length > 0 || nameCheck.error) && (
                        <RepositoryNameFeedback check={nameCheck} compact />
                      )}
                    </div>
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
                <span className={styles.stepNumber} aria-hidden="true">
                  2
                </span>
                <h2 id="repository-configuration-heading">Configuration</h2>
              </div>
              <div className={styles.visibilityCard}>
                <div className={styles.visibilityRow}>
                  <div className={styles.optionCopy}>
                    <label htmlFor="repo-visibility">
                      Visibility <span aria-hidden="true">*</span>
                    </label>
                    <p id="repository-visibility-help">{visibilityDescription}</p>
                  </div>
                  <RepositorySelect
                    id="repo-visibility"
                    label="Visibility"
                    describedBy="repository-visibility-help"
                    disabled={locked}
                    value={visibility}
                    onValueChange={(value) => setVisibility(value as typeof visibility)}
                    className={styles.visibilitySelect}
                    options={visibilityOptions}
                  />
                </div>
              </div>
              <div className={styles.configuration}>
                <div className={styles.readmeOption}>
                  <label htmlFor="repo-readme">
                    Initialize README <span className={styles.optional}>Optional</span>
                  </label>
                  <input
                    id="repo-readme"
                    role="switch"
                    aria-checked={initializeReadme}
                    aria-label="Initialize README"
                    type="checkbox"
                    checked={initializeReadme}
                    disabled={locked}
                    aria-describedby="repository-readme-help"
                    onChange={(event) => setInitializeReadme(event.target.checked)}
                  />

                  <p id="repository-readme-help">
                    Start with your repository name and description. You can edit it later.
                  </p>
                  {!parsedReadme.success ? (
                    <p role="alert" className="text-sm text-[var(--status-error)]">
                      {parsedReadme.error.issues[0]?.message}
                    </p>
                  ) : null}
                </div>
                <div className={styles.readmeOption}>
                  <label htmlFor="repo-prd-starter">
                    Initialize PRD starter <span className={styles.optional}>Optional</span>
                  </label>
                  <input
                    id="repo-prd-starter"
                    role="switch"
                    aria-checked={initializePrdStarter}
                    aria-label="Initialize PRD starter"
                    type="checkbox"
                    checked={initializePrdStarter}
                    disabled={locked}
                    aria-describedby="repository-prd-starter-help"
                    onChange={(event) => setInitializePrdStarter(event.target.checked)}
                  />
                  <p id="repository-prd-starter-help">
                    Create an initial semantic PRD commit on main so branches can open pull
                    requests.
                  </p>
                </div>
                <div className={styles.tagsField}>
                  <RepositoryTagsInput
                    value={tags}
                    onChange={setTags}
                    disabled={locked}
                    suggestionsNamespace={owner}
                  />
                </div>
              </div>
            </section>
            {setup.error && (
              <p role="alert" className={cn(management.notice, management.error, styles.error)}>
                {setup.error}
              </p>
            )}
            <footer className={styles.footer}>
              <output className={styles.progress} aria-live="polite">
                {setup.pending
                  ? setup.started
                    ? 'Repository created. Finishing setup…'
                    : 'Creating your repository…'
                  : setup.started
                    ? 'Your repository is created. Retry to finish setup and open its Workspace.'
                    : 'Your new repository opens in Workspace.'}
              </output>
              <Button
                type="submit"
                className={management.createAction}
                disabled={!ready || setup.pending}
              >
                {setup.pending && (
                  <Loader2
                    aria-hidden="true"
                    className="size-4 animate-spin motion-reduce:animate-none"
                  />
                )}
                {setup.pending ? 'Creating…' : setup.started ? 'Retry setup' : 'Create repository'}
                {!setup.pending && <ArrowRight aria-hidden="true" className="size-4" />}
              </Button>
            </footer>
          </form>
        </main>
      </div>
    </div>
  );
}
