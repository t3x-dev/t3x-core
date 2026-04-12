/**
 * Shared API types — neutral re-export surface so components (especially
 * under `components/chat/**`) can reference domain types without importing
 * from the L1 adapter layer (`@/lib/api/*`) directly.
 *
 * Adding new types here is cheap; it keeps the biome-enforced L4→L1 ban
 * strict while still letting components type their props.
 */

export type { Citation } from '@/lib/api/chat';
export type { ApiCommit } from '@/lib/api/commits';
export type { TreeMergeSuggestion } from '@/lib/api/diff';
export type { TurnContextData } from '@/lib/api/turns';
export type { Conversation, Project } from '@/lib/api/types';
