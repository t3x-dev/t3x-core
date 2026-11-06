import { proxyBrowserApi } from '@/server/browserApiProxy';

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

async function handler(request: Request, context: RouteContext): Promise<Response> {
  return proxyBrowserApi(request, (await context.params).path);
}

export {
  handler as DELETE,
  handler as GET,
  handler as HEAD,
  handler as PATCH,
  handler as POST,
  handler as PUT,
};
