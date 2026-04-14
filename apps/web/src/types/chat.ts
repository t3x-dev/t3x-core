/**
 * Shared chat UI types. Moved out of @/components/chat/ChatInput so
 * non-component consumers (e.g. useConversationChat hook) can import
 * the type without breaching v2 §2.6 (hooks cannot import components).
 */

export interface AttachedImage {
  id: string;
  preview: string;
  base64: string;
  mediaType: string;
}
