import { getCanonicalRepositoryPath, getProjectIdRepoPath } from '@/domain/project/repoPath';
import {
  isRetiredRepositoryLocation,
  isSupportedRepositorySuffix,
} from '@/domain/project/repositoryLocation';
import { safeInternalReturnTo } from './navigationReturn';

const HISTORY_KEY = 'repositorySettingsReturn';
let incoming: { projectId: string; pathname: string; source: string; legacy?: string } | undefined;

function internalSource(value: string) {
  const source = safeInternalReturnTo(value, '');
  return source.startsWith('//') ? '' : source;
}

function legacySource(value: string, projectId: string, settingsPath: string) {
  const source = internalSource(value);
  if (!source) return '';
  const url = new URL(source, window.location.origin);
  if (url.pathname === '/' || url.pathname === '/repositories') return source;

  const canonical = getCanonicalRepositoryPath(settingsPath);
  const idPath = getProjectIdRepoPath(projectId);
  for (const base of canonical ? [canonical, idPath] : [idPath]) {
    if (url.pathname !== base && !url.pathname.startsWith(`${base}/`)) continue;
    const suffix = url.pathname.slice(base.length).replace(/\/$/, '');
    if (suffix === '/settings' || (!suffix && url.searchParams.get('tab') === 'settings'))
      return '';
    if (
      isSupportedRepositorySuffix(suffix) &&
      !isRetiredRepositoryLocation(suffix, url.searchParams)
    )
      return source;
  }
  return '';
}

export function rememberRepositorySettingsReturn(projectId: string, pathname: string) {
  const { pathname: sourcePath, search, hash } = window.location;
  incoming = { projectId, pathname, source: `${sourcePath}${search}${hash}` };
}

function storedSource(projectId: string) {
  const entry = window.history.state?.[HISTORY_KEY];
  return entry?.projectId === projectId && typeof entry.source === 'string'
    ? internalSource(entry.source)
    : '';
}

/** Carry the entry's source across a repository address redirect or rename. */
export function carryRepositorySettingsReturn(
  projectId: string,
  pathname: string,
  resolvedAlias?: string
) {
  const current = new URL(window.location.href);
  const legacy = current.searchParams.get('returnTo');
  if (legacy !== null && resolvedAlias && current.pathname === `${resolvedAlias}/settings`) {
    // The address resolver has confirmed that this alias and the destination are the same repository.
    const source = legacySource(legacy, projectId, current.pathname);
    if (source) incoming = { projectId, pathname, source, legacy };
    return;
  }
  const source =
    incoming?.projectId === projectId && incoming.pathname === current.pathname
      ? incoming.source
      : storedSource(projectId);
  if (source) incoming = { projectId, pathname, source };
}

export function readRepositorySettingsReturn(projectId: string) {
  const url = new URL(window.location.href);
  const legacy = url.searchParams.get('returnTo');
  const stored = storedSource(projectId);
  const pending = incoming;
  incoming = undefined;
  const matching = pending?.projectId === projectId && pending.pathname === url.pathname;
  let source = stored;
  if (legacy !== null) {
    source =
      matching && pending.legacy === legacy
        ? pending.source
        : legacySource(legacy, projectId, url.pathname);
  } else if (matching && pending.legacy === undefined) {
    source = internalSource(pending.source);
  }
  if (legacy !== null || source !== stored) {
    url.searchParams.delete('returnTo');
    const data = source ? { [HISTORY_KEY]: { projectId, source } } : null;
    window.history.replaceState(
      data,
      '',
      legacy === null ? undefined : `${url.pathname}${url.search}${url.hash}`
    );
  }
  return source;
}

/** Next.js carries its own routing state when writing the section fragment. */
export function repositorySettingsHistoryData() {
  const entry = window.history.state?.[HISTORY_KEY];
  return entry ? { [HISTORY_KEY]: entry } : null;
}
