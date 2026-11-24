import type { StudioPreview } from '@t3x-dev/api-client';
import { createContext } from 'react';

export interface StudioPreviewSnapshot {
  data: StudioPreview;
  expiresAt: number;
}

export const StudioPreviewCacheContext = createContext<Map<string, StudioPreviewSnapshot> | null>(
  null
);
