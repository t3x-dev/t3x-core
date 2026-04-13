/**
 * commands/leaves — v2 §2.4 aggregate command module.
 *
 * Source policy: weak (created_by 'user' | 'agent' tag captured by hook).
 * Optimistic-update style: all-or-nothing.
 * Error surface: LeafPersistenceError (extends CommandError).
 */

export { type CreateLeafInput, createLeaf } from './createLeaf';
export { deleteLeaf } from './deleteLeaf';
export { LeafPersistenceError } from './errors';
