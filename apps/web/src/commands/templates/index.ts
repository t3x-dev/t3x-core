/**
 * commands/templates — v2 §2.4 aggregate command module.
 *
 * Source policy: none.
 * Optimistic-update style: all-or-nothing.
 * Error surface: TemplatePersistenceError (extends CommandError).
 */

export { type CreateTemplateInput, createTemplate } from './createTemplate';
export { deleteTemplate } from './deleteTemplate';
export { TemplatePersistenceError } from './errors';
