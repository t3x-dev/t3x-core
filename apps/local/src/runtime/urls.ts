export const REPOSITORY_WEBUI_ENTRY_PATH = '/';

export function buildRepositoryEntryUrl(webUrl: string): string {
  const url = new URL(REPOSITORY_WEBUI_ENTRY_PATH, webUrl.endsWith('/') ? webUrl : `${webUrl}/`);
  return url.toString();
}
