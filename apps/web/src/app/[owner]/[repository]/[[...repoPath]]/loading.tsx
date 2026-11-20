'use client';

import { LoadingSpinner } from '@/components/layout/ApiStatus';

export default function Loading() {
  return <LoadingSpinner message="Loading repository view..." />;
}
