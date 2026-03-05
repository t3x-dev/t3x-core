'use client';

import { Paperclip, X } from 'lucide-react';
import { useRef } from 'react';

import { Button } from '@/components/ui/button';
import type { ContentBlock } from './ContentBlockRenderer';

interface AttachmentButtonProps {
  attachments: ContentBlock[];
  onAdd: (block: ContentBlock) => void;
  onRemove: (index: number) => void;
}

function getBlockType(mimeType: string): ContentBlock['type'] {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
}

export function AttachmentButton({ attachments, onAdd, onRemove }: AttachmentButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      const block: ContentBlock = {
        type: getBlockType(file.type),
        url: URL.createObjectURL(file),
        filename: file.name,
        mime_type: file.type || 'application/octet-stream',
      };
      onAdd(block);
    }

    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Attachment chips */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {attachments.map((attachment, index) => (
            <div
              key={`${attachment.filename}-${index}`}
              className="flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-1 text-xs text-[var(--text-secondary)]"
            >
              <span className="max-w-[120px] truncate">{attachment.filename || 'file'}</span>
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="ml-0.5 rounded-sm hover:bg-muted-foreground/20 p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Paperclip button */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => fileInputRef.current?.click()}
        aria-label="Attach file"
      >
        <Paperclip className="h-4 w-4" />
      </Button>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
