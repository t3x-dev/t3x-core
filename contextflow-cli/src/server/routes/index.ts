/**
 * Routes Index
 *
 * Re-exports all route registration functions.
 */

// Core processing routes
export { registerHealthRoutes } from "./health";
export { registerExtractRoutes } from "./extract";
export { registerDiffRoutes } from "./diff";
export { registerMergeRoutes } from "./merge";
export { registerBridgeRoutes } from "./bridges";
export { registerDraftRoutes } from "./draft";

// V2 Storage/Management routes (Python core_api migration)
export { registerProjectRoutes } from "./projects";
export { registerConversationRoutes } from "./conversations";
export { registerTurnsV2Routes } from "./turnsV2";
export { registerBranchesRoutes } from "./branchesV2";
export { registerCommitsV2Routes } from "./commitsV2";
export { registerDraftsV2Routes } from "./draftsV2";
