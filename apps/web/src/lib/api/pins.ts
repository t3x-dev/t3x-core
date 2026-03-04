/**
 * Pins + Conversation Context + Memory API
 */

import type { Pin } from '@t3x/core';
import { API_V1, buildQueryString, fetchWithTimeout, handleResponse } from './core';

// ============================================================================
// Pins (V4 - source selection for commits and context)
// ============================================================================

export type PinType = 'conversation' | 'leaf';

/** API response format for Pin (uses null for absent values) */
interface ApiPin {
  id: string;
  project_id: string;
  type: PinType;
  ref_id: string;
  selected_assertion_ids: string[] | null;
  pinned_at: string;
  pinned_by: string | null;
}

/** Convert API Pin response to core Pin type (null -> undefined) */
function toPin(apiPin: ApiPin): Pin {
  return {
    id: apiPin.id,
    project_id: apiPin.project_id,
    type: apiPin.type,
    ref_id: apiPin.ref_id,
    selected_assertion_ids: apiPin.selected_assertion_ids ?? undefined,
    pinned_at: apiPin.pinned_at,
    pinned_by: apiPin.pinned_by ?? undefined,
  };
}

export interface PinListData {
  pins: Pin[];
}

/**
 * List pins by project
 */
export async function listPins(projectId: string, type?: PinType): Promise<Pin[]> {
  const query = buildQueryString({ type });
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/pins${query ? `?${query}` : ''}`
  );
  const apiPins = await handleResponse<ApiPin[]>(res);
  return apiPins.map(toPin);
}

/**
 * Create a new pin
 */
export async function createPinApi(
  projectId: string,
  type: PinType,
  refId: string,
  selectedAssertionIds?: string[]
): Promise<Pin> {
  const res = await fetchWithTimeout(`${API_V1}/projects/${encodeURIComponent(projectId)}/pins`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type,
      ref_id: refId,
      selected_assertion_ids: selectedAssertionIds,
    }),
  });
  const apiPin = await handleResponse<ApiPin>(res);
  return toPin(apiPin);
}

/**
 * Delete a pin by ID
 */
export async function deletePinApi(pinId: string): Promise<{ deleted: boolean; id: string }> {
  const res = await fetchWithTimeout(`${API_V1}/pins/${encodeURIComponent(pinId)}`, {
    method: 'DELETE',
  });
  return handleResponse<{ deleted: boolean; id: string }>(res);
}

/**
 * Update pin's selected assertion IDs
 */
export async function updatePinAssertionsApi(
  pinId: string,
  selectedAssertionIds: string[]
): Promise<Pin> {
  const res = await fetchWithTimeout(`${API_V1}/pins/${encodeURIComponent(pinId)}/assertions`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      selected_assertion_ids: selectedAssertionIds,
    }),
  });
  const apiPin = await handleResponse<ApiPin>(res);
  return toPin(apiPin);
}

// ============================================================================
// Conversation Context
// ============================================================================

export interface ConversationContext {
  conversation_id: string;
  selected_pin_ids: string[] | null;
  updated_at: string;
}

export async function getConversationContext(
  conversationId: string
): Promise<ConversationContext | null> {
  const res = await fetchWithTimeout(
    `${API_V1}/conversations/${encodeURIComponent(conversationId)}/context`
  );
  return handleResponse<ConversationContext | null>(res);
}

export async function updateConversationContext(
  conversationId: string,
  selectedPinIds: string[] | null
): Promise<ConversationContext> {
  const res = await fetchWithTimeout(
    `${API_V1}/conversations/${encodeURIComponent(conversationId)}/context`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selected_pin_ids: selectedPinIds }),
    }
  );
  return handleResponse<ConversationContext>(res);
}

// ============================================================================
// Conversation Memory (Built context from pins for LLM injection)
// ============================================================================

export interface ContextSource {
  type: 'commit' | 'conversation' | 'leaf';
  id: string;
  label?: string;
}

export interface BuiltContext {
  text: string;
  token_estimate: number;
  sources: ContextSource[];
}

/**
 * Get built memory context for a conversation.
 * Assembles pinned conversations, leaves, and current commit into LLM-ready text.
 *
 * @param conversationId - Conversation ID
 * @returns Built context with text, token estimate, and sources
 */
export async function getConversationMemory(conversationId: string): Promise<BuiltContext> {
  const res = await fetchWithTimeout(
    `${API_V1}/conversations/${encodeURIComponent(conversationId)}/memory`
  );
  return handleResponse<BuiltContext>(res);
}
