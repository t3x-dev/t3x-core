'use client';

import type { FrameRelationType } from '@t3x/core';
import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getSmoothStepPath } from '@xyflow/react';
import { useState } from 'react';
import { RELATION_STYLES, type RelationEdgeData } from './frameGraphUtils';

// ── Stroke width per relation type ──

const STROKE_WIDTHS: Record<FrameRelationType, number> = {
  causes: 2,
  conditions: 2,
  contrasts: 2,
  elaborates: 1,
  follows: 3,
  depends: 2,
};

/**
 * RelationEdge — Custom XYFlow edge with 6 distinct visual styles
 * for inter-sentence frame relations.
 *
 * Visual encoding:
 * - causes:     orange, solid 2px, filled arrow
 * - conditions: yellow, dashed (8 4) 2px, filled arrow
 * - contrasts:  red, solid 2px, filled arrow
 * - elaborates: blue, thin solid 1px, filled arrow
 * - follows:    gray, thick solid 3px, filled arrow
 * - depends:    purple, dotted (4 4) 2px, filled arrow
 */
export function RelationEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  data,
  selected,
}: EdgeProps) {
  const [isHovered, setIsHovered] = useState(false);

  const edgeData = data as RelationEdgeData | undefined;
  const relationType = edgeData?.relationType ?? 'elaborates';
  const isNew = edgeData?.isNew ?? false;
  const confidence = edgeData?.confidence;
  const relStyle = RELATION_STYLES[relationType];
  const strokeWidth = STROKE_WIDTHS[relationType];

  // Confidence-based visual encoding
  const confidenceOpacity =
    confidence == null || confidence >= 0.8 ? 1.0 : confidence >= 0.5 ? 0.7 : 0.4;
  const confidenceDash =
    confidence == null || confidence >= 0.8 ? undefined : confidence >= 0.5 ? '8 4' : '3 3';

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 10,
  });

  const activeStrokeWidth = selected
    ? strokeWidth + 1
    : isHovered
      ? strokeWidth + 0.5
      : strokeWidth;

  // Edge draw animation styles for new edges
  const newEdgeStyle: React.CSSProperties = isNew
    ? {
        strokeDasharray: '1000',
        strokeDashoffset: '1000',
        animation: 'edgeDraw 500ms ease-out forwards',
      }
    : {};

  return (
    <g
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ cursor: 'pointer' }}
    >
      {/* Keyframe definition for edge draw animation */}
      {isNew && (
        <style>{`
          @keyframes edgeDraw {
            from { stroke-dashoffset: 1000; }
            to { stroke-dashoffset: 0; }
          }
        `}</style>
      )}

      {/* Hover/select glow */}
      {(isHovered || selected) && (
        <path
          d={edgePath}
          fill="none"
          strokeWidth={activeStrokeWidth + 6}
          stroke={relStyle.color}
          strokeLinecap="round"
          style={{ opacity: selected ? 0.15 : 0.1, filter: 'blur(4px)' }}
        />
      )}

      {/* Main edge */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          stroke: relStyle.color,
          strokeWidth: activeStrokeWidth,
          opacity: confidenceOpacity,
          ...(relStyle.strokeDasharray && !isNew
            ? { strokeDasharray: relStyle.strokeDasharray }
            : !relStyle.strokeDasharray && !isNew && confidenceDash
              ? { strokeDasharray: confidenceDash }
              : {}),
          transition: 'stroke-width 150ms ease, opacity 150ms ease',
          ...newEdgeStyle,
        }}
        markerEnd={`url(#${markerIdFor(relationType)})`}
      />

      {/* Label on hover */}
      {isHovered && (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute rounded-md border border-white/10 bg-zinc-900/90 px-2 py-0.5 text-xs font-medium shadow-lg backdrop-blur-sm"
            style={{
              color: relStyle.color,
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            }}
          >
            {relStyle.label}
            {confidence != null && (
              <span className="ml-1.5 opacity-70">({confidence.toFixed(2)})</span>
            )}
            {confidence != null && confidence < 0.5 && (
              <span className="ml-1 text-amber-400">low</span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  );
}

// ── Marker helpers ──

function markerIdFor(relationType: FrameRelationType): string {
  return `relation-marker-${relationType}`;
}

/**
 * Generates marker definitions for all relation types.
 * Render the returned SVG element once inside the ReactFlow wrapper.
 *
 * Usage:
 * ```tsx
 * <ReactFlow ...>
 *   <RelationEdgeMarkerDefs />
 * </ReactFlow>
 * ```
 */
export function RelationEdgeMarkerDefs() {
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
      <title>Relation edge markers</title>
      <defs>
        {(Object.keys(RELATION_STYLES) as FrameRelationType[]).map((type) => {
          const style = RELATION_STYLES[type];
          return (
            <marker
              key={type}
              id={markerIdFor(type)}
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth="8"
              markerHeight="8"
              orient="auto-start-reverse"
              markerUnits="strokeWidth"
            >
              {type === 'depends' ? (
                /* Hollow circle for depends */
                <circle cx="5" cy="5" r="3.5" fill="none" stroke={style.color} strokeWidth="1.5" />
              ) : type === 'contrasts' ? (
                /* Double diamond for contrasts */
                <path d="M1 5 L3.5 2 L6 5 L3.5 8 Z M4 5 L6.5 2 L9 5 L6.5 8 Z" fill={style.color} />
              ) : type === 'conditions' ? (
                /* Hollow triangle for conditions */
                <path d="M0 0 L10 5 L0 10 Z" fill="none" stroke={style.color} strokeWidth="1.5" />
              ) : (
                /* Filled triangle (causes, elaborates, follows) */
                <path d="M0 0 L10 5 L0 10 Z" fill={style.color} />
              )}
            </marker>
          );
        })}
      </defs>
    </svg>
  );
}

export default RelationEdge;
