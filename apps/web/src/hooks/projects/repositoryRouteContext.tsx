'use client';

import { useParams } from 'next/navigation';
import { createContext, useContext } from 'react';

/** Thin adapter for existing ID-based business pages rendered under owner/name. */
export const RepositoryRouteContext = createContext<Record<string, string>>({});
export function useRepositoryRouteParams<
  T extends Record<string, string | string[]> = Record<string, string | string[]>,
>() {
  const params = useParams<T>();
  return { ...params, ...useContext(RepositoryRouteContext) } as T;
}
