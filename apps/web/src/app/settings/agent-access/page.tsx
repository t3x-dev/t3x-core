import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ConnectAgent } from '@/components/project/agent-access/ConnectAgent';

export const metadata: Metadata = {
  title: 'Connect an Agent · T3X',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

export default function ConnectAgentPage() {
  return (
    <Suspense fallback={null}>
      <ConnectAgent />
    </Suspense>
  );
}
