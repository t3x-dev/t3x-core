'use client';

import { redirect } from 'next/navigation';
import { namespaceSettingsHref } from '@/domain/settingsLocation';

export function OrganizationSettingsPage({ ownerSlug }: { ownerSlug: string }) {
  redirect(namespaceSettingsHref(ownerSlug, `/${encodeURIComponent(ownerSlug)}`));
  return null;
}
