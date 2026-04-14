/**
 * L3 — re-exports the `ApiError` class so store-layer consumers can do
 * `instanceof ApiError` checks without importing from `@/infrastructure/*`
 * directly. Components should prefer typed-result hooks (see
 * `hooks/useLearnFromEdits` for the pattern) over reaching for the class.
 */

export { ApiError } from '@/infrastructure/core';
