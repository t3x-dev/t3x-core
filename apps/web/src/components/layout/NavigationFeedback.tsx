'use client';

import { useLinkStatus } from 'next/link';

export function NavigationFeedback() {
  const { pending } = useLinkStatus();
  return pending ? (
    <output className="sr-only" data-navigation-pending="">
      Opening page…
    </output>
  ) : null;
}
