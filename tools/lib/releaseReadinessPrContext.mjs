const RELEASE_BOUND_HEAD_REFS = [/^release\//, /^hotfix\//, /^changeset-release\//];

export function resolveReleaseReadinessPrContext({ repository, pullRequest }) {
  const headRef = pullRequest?.head?.ref ?? null;
  const baseRef = pullRequest?.base?.ref ?? null;
  const headRepo = pullRequest?.head?.repo?.full_name ?? null;
  const sameRepo = headRepo === repository;
  const releaseHead = RELEASE_BOUND_HEAD_REFS.some((pattern) => pattern.test(headRef ?? ''));
  const releaseBound = sameRepo && baseRef === 'main' && releaseHead;

  return {
    release_bound: releaseBound,
    pr_number: pullRequest?.number ?? null,
    base_ref: baseRef,
    base_sha: pullRequest?.base?.sha ?? null,
    head_ref: headRef,
    head_sha: pullRequest?.head?.sha ?? null,
    product_version: headRef?.match(/^release\/v?(.+)$/)?.[1] ?? null,
    pr_body: pullRequest?.body ?? '',
  };
}
