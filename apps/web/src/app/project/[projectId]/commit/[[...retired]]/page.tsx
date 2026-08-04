import { notFound } from 'next/navigation';

/**
 * Tombstone for the entire retired legacy commit-detail route family.
 *
 * The optional catch-all prevents `/project/:projectId/commit`, the former
 * hash route, and any trailing subpath from falling through to the repository
 * catch-all as a successful page.
 */
export default function RetiredCommitRoute(): never {
  notFound();
}
