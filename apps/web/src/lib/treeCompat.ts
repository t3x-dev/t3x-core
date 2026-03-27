/**
 * Tree Compatibility Utilities
 *
 * Provides backward-compatible Frame-like interface from TreeNode.
 * Used by UI components that were written for the old Frame type
 * (id, type, slots) and need to work with TreeNode (key, slots, children).
 */

import type { SemanticContent, SlotValue, TreeNode } from '@t3x-dev/core';

/**
 * Frame-like object compatible with old UI components.
 * Maps TreeNode to the old Frame interface shape.
 * id = dot-path, type = key name.
 */
export interface Frame {
  id: string;
  type: string;
  key: string;
  slots: Record<string, SlotValue>;
  source?: string;
  confidence?: number;
  children: TreeNode[];
  /** Original slot_quotes from TreeNode */
  slot_quotes?: Record<string, string>;
  /** Slot-level source refs (for backward compat) */
  slot_sources?: Record<string, unknown>;
  /** Flag for manually edited nodes */
  manual_edited?: boolean;
}

/**
 * Flatten TreeNode[] into Frame-like objects for backward compatibility.
 * Uses dot-path as id and key as type.
 */
export function treesToFrames(trees: TreeNode[], prefix = ''): Frame[] {
  const frames: Frame[] = [];
  for (const node of trees) {
    const path = prefix ? `${prefix}.${node.key}` : node.key;
    frames.push({
      id: path,
      key: node.key,
      type: node.key,
      slots: node.slots,
      source: node.source,
      confidence: node.confidence,
      children: node.children,
      slot_quotes: node.slot_quotes,
    });
    if (node.children.length > 0) {
      frames.push(...treesToFrames(node.children, path));
    }
  }
  return frames;
}

/**
 * Get flat Frame-like objects from SemanticContent.
 */
export function contentToFrames(content: SemanticContent): Frame[] {
  return treesToFrames(content.trees);
}

/**
 * Get compat SemanticContent with both .trees and .frames.
 * .frames is a flat array of Frame compat objects derived from .trees.
 */
export function toCompatContent(content: SemanticContent): SemanticContent & { frames: Frame[] } {
  return {
    ...content,
    frames: treesToFrames(content.trees),
  };
}

/**
 * Convert Frame-like objects back to TreeNode[].
 * Only converts top-level frames (those without dots in id) to trees.
 * Nested frames are restored via the children property.
 */
export function framesToTrees(frames: Frame[]): TreeNode[] {
  return frames
    .filter((f) => !f.id.includes('.'))
    .map((f) => frameToNode(f));
}

function frameToNode(frame: Frame): TreeNode {
  return {
    key: frame.type,
    slots: frame.slots,
    children: (frame.children ?? []),
    source: frame.source,
    confidence: frame.confidence,
    slot_quotes: frame.slot_quotes,
  };
}

/**
 * Adapts a SemanticContent to have a .frames property that returns
 * Frame[] compat objects lazily.
 */
export function withFrames<T extends SemanticContent>(content: T): T & { frames: Frame[] } {
  const cached = treesToFrames(content.trees);
  return Object.assign({}, content, { frames: cached });
}
