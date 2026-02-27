/**
 * Import System Types
 *
 * Shared types for URL, document, and platform import.
 */

export interface ParsedParagraph {
  text: string;
  type: 'heading' | 'paragraph' | 'list_item' | 'code' | 'table' | 'blockquote';
  level?: number; // For headings (h1=1, h2=2, etc.)
  index: number;
}

export interface ParseResult {
  paragraphs: ParsedParagraph[];
  metadata: ImportMetadata;
  raw_text: string;
}

export interface TurnProvenance {
  turn_hash: string;
  paragraph_index: number;
  element_type: ParsedParagraph['type'] | 'message';
  page?: number;
}

export interface ImportMetadata {
  source_type: 'url' | 'document' | 'platform';
  source_url?: string;
  source_filename?: string;
  platform?: string;
  title?: string;
  author?: string;
  published_at?: string;
  content_hash: string;
  content_length: number;
  content_truncated?: boolean;
  extraction_quality?: 'good' | 'partial' | 'poor';
  page_count?: number;
  imported_at: string;
  turn_map?: TurnProvenance[];
}

export interface ImportPreviewResult {
  paragraphs: ParsedParagraph[];
  metadata: ImportMetadata;
  estimated_turns: number;
  duplicate_warning?: string;
}

export interface ImportResult {
  project_id: string;
  conversation_id: string;
  turns_imported: number;
  metadata: ImportMetadata;
  duplicate_warning?: string;
}

// Platform-specific types

export interface PlatformConversation {
  id: string;
  title: string;
  messages: PlatformMessage[];
  created_at?: string;
}

export interface PlatformMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at?: string;
}

export interface PlatformParseResult {
  conversations: PlatformConversation[];
  platform: string;
  export_version?: string;
}
