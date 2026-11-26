import { mcpPublicEndpoint } from '@/server/mcpPublicEndpoint';
export function POST(request: Request) {
  return mcpPublicEndpoint('token', request);
}
