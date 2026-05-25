'use client';

import { Suspense } from 'react';
import { ProjectDetailPageContent } from '@/app/project/[projectId]/page';

export default function ChatProjectCanvasPage() {
  return (
    <Suspense fallback={null}>
      <ProjectDetailPageContent showChatSidebarToggle />
    </Suspense>
  );
}
