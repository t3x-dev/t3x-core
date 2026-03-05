'use client';

import { FileIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';

export interface ContentBlock {
  type: 'text' | 'image' | 'audio' | 'file';
  text?: string;
  url?: string;
  filename?: string;
  mime_type?: string;
}

interface ContentBlockRendererProps {
  block: ContentBlock;
  onImageClick?: (url: string) => void;
}

export function ContentBlockRenderer({ block, onImageClick }: ContentBlockRendererProps) {
  switch (block.type) {
    case 'text':
      return <p className="text-sm whitespace-pre-wrap break-words">{block.text}</p>;

    case 'image':
      return (
        // biome-ignore lint/performance/noImgElement: dynamic user-provided URLs (blob/external), dimensions unknown
        <img
          src={block.url}
          alt={block.filename || 'Image'}
          className="max-w-md rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => onImageClick?.(block.url!)}
        />
      );

    case 'audio':
      return (
        <audio controls src={block.url} className="w-full max-w-md">
          <track kind="captions" />
        </audio>
      );

    case 'file':
      return (
        <div className="flex items-center gap-3 rounded-lg border p-3 max-w-md bg-muted/50">
          <FileIcon className="h-8 w-8 shrink-0 text-[var(--text-tertiary)]" />
          <div className="flex-1 min-w-0">
            <a
              href={block.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-[var(--text-primary)] hover:underline truncate block"
            >
              {block.filename || 'Attachment'}
            </a>
            {block.mime_type && (
              <Badge variant="secondary" className="mt-1 text-[10px]">
                {block.mime_type}
              </Badge>
            )}
          </div>
        </div>
      );

    default:
      return null;
  }
}
