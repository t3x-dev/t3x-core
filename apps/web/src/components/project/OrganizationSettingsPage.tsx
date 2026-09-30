'use client';

import { redirect } from 'next/navigation';

export function OrganizationSettingsPage({ ownerSlug }: { ownerSlug: string }) {
  redirect(`/settings/provider-credentials?owner=${encodeURIComponent(ownerSlug)}`);
  return null;
}
