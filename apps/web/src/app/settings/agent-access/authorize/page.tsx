import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AgentConsent } from '@/components/project/agent-access/AgentConsent';

export const metadata: Metadata = {
  title: 'Authorize Agent access · T3X',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

export default function AuthorizeAgentPage() {
  return (
    <Suspense fallback={null}>
      <AgentConsent />
    </Suspense>
  );
}
