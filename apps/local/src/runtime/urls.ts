export const INTRO_DEMO_WEBUI_ENTRY_PATH = '/chat';

export function buildIntroDemoUrl(webUrl: string): string {
  const url = new URL(INTRO_DEMO_WEBUI_ENTRY_PATH, webUrl.endsWith('/') ? webUrl : `${webUrl}/`);
  url.searchParams.set('introDemo', '1');
  return url.toString();
}
