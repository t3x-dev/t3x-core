/**
 * L3 read wrapper for the chat model registry.
 */

import { getAvailableModels } from '@/infrastructure/llm';

export function fetchAvailableModels() {
  return getAvailableModels();
}
