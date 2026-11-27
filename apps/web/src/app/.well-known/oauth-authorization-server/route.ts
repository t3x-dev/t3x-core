import { mcpPublicEndpoint } from '@/server/mcpPublicEndpoint';
export function GET() {
  return mcpPublicEndpoint('metadata');
}
