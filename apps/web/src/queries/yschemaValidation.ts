import {
  createYSchemaValidationRun,
  getLatestYSchemaValidationRun,
} from '@/infrastructure/projects';
import type {
  CreateYSchemaValidationRunPayload,
  LatestYSchemaValidationRunOptions,
  YSchemaValidationRun,
} from '@/types/api';

export function fetchLatestYSchemaValidation(
  projectId: string,
  options?: LatestYSchemaValidationRunOptions
): Promise<YSchemaValidationRun | null> {
  return getLatestYSchemaValidationRun(projectId, options);
}

export function runYSchemaValidation(
  projectId: string,
  payload?: CreateYSchemaValidationRunPayload
): Promise<YSchemaValidationRun> {
  return createYSchemaValidationRun(projectId, payload);
}
