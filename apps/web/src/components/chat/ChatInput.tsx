'use client';

import { Brain, Globe, Hexagon, Paperclip, Send, Square } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useChatSessionStore } from '@/store/chatSessionStore';

export interface AttachedImage {
  id: string;
  preview: string;
  base64: string;
  mediaType: string;
}

async function resizeImage(file: File, maxDim: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('toBlob failed'));
        },
        file.type || 'image/jpeg',
        0.85
      );
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = URL.createObjectURL(file);
  });
}

async function processImage(file: File): Promise<AttachedImage> {
  let blob: Blob = file;
  if (file.size > 4 * 1024 * 1024) {
    blob = await resizeImage(file, 2048);
  }
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return {
    id: crypto.randomUUID(),
    preview: URL.createObjectURL(file),
    base64,
    mediaType: file.type || 'image/jpeg',
  };
}

interface ChatInputProps {
  onSend: (message: string, images?: AttachedImage[]) => void;
  onStop?: () => void;
  isStreaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
  provider?: string;
}

export function ChatInput({
  onSend,
  onStop,
  isStreaming = false,
  disabled = false,
  placeholder = 'Message...',
  provider,
}: ChatInputProps) {
  const webSearchEnabled = useChatSessionStore((s) => s.webSearchEnabled);
  const toggleWebSearch = useChatSessionStore((s) => s.toggleWebSearch);
  const thinkingEnabled = useChatSessionStore((s) => s.thinkingEnabled);
  const toggleThinking = useChatSessionStore((s) => s.toggleThinking);
  const [value, setValue] = useState('');
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea as content grows
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  useEffect(() => {
    autoResize();
  }, [value, autoResize]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    const images = await Promise.all(files.map(processImage));
    setAttachedImages((prev) => [...prev, ...images]);
    e.target.value = '';
  };

  const removeImage = (id: string) => {
    setAttachedImages((prev) => {
      const removed = prev.find((img) => img.id === id);
      if (removed) URL.revokeObjectURL(removed.preview);
      return prev.filter((img) => img.id !== id);
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    const images = await Promise.all(files.map(processImage));
    setAttachedImages((prev) => [...prev, ...images]);
  };

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if ((!trimmed && attachedImages.length === 0) || disabled) return;
    onSend(trimmed || '', attachedImages.length > 0 ? attachedImages : undefined);
    setValue('');
    for (const img of attachedImages) URL.revokeObjectURL(img.preview);
    setAttachedImages([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, disabled, onSend, attachedImages]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const isEmpty = !value.trim() && attachedImages.length === 0;

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'rounded-xl border bg-[var(--surface-panel)]',
        'transition-colors duration-[var(--motion-base)]',
        'focus-within:border-[var(--accent-commit)] focus-within:ring-1 focus-within:ring-[var(--accent-commit)]/30',
        isDragging
          ? 'border-[var(--accent-commit)] bg-[var(--accent-commit)]/5'
          : 'border-[var(--stroke-default)]'
      )}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleFileChange}
      />

      {/* Image preview strip */}
      {attachedImages.length > 0 && (
        <div className="flex gap-2 px-3 pt-2 flex-wrap">
          {attachedImages.map((img) => (
            <div key={img.id} className="relative group/img">
              <img
                src={img.preview}
                alt="Attached"
                className="h-16 w-16 object-cover rounded border border-[var(--border-primary)]"
              />
              <button
                type="button"
                onClick={() => removeImage(img.id)}
                className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-[var(--status-error)] text-white text-[10px] flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar row: buttons + textarea + send */}
      <div className="flex items-end gap-2 px-3 py-2">
        {/* Paperclip button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleFileClick}
          disabled={disabled}
          className={cn(
            'h-8 w-8 shrink-0 rounded-lg text-[var(--text-tertiary)]',
            'hover:text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]',
            'transition-colors duration-[var(--motion-base)]'
          )}
          aria-label="Attach file"
        >
          <Paperclip className="h-4 w-4" />
        </Button>

        {/* Web search toggle — Claude only */}
        {(!provider || provider === 'claude' || provider === 'anthropic') && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleWebSearch}
            className={cn(
              'h-8 w-8 shrink-0 rounded-lg transition-colors duration-[var(--motion-base)]',
              webSearchEnabled
                ? 'bg-[var(--accent-commit)]/15 text-[var(--accent-commit)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]'
            )}
            aria-label="Toggle web search"
          >
            <Globe className="h-4 w-4" />
          </Button>
        )}

        {/* Extended thinking toggle — Claude only */}
        {(!provider || provider === 'claude' || provider === 'anthropic') && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleThinking}
            className={cn(
              'h-8 w-8 shrink-0 rounded-lg transition-colors duration-[var(--motion-base)]',
              thinkingEnabled
                ? 'bg-[var(--accent-commit)]/15 text-[var(--accent-commit)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]'
            )}
            aria-label="Toggle extended thinking"
          >
            <Brain className="h-4 w-4" />
          </Button>
        )}

        {/* Extract button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => window.dispatchEvent(new CustomEvent('t3x:extract-requested'))}
          disabled={disabled}
          className={cn(
            'h-8 w-8 shrink-0 rounded-lg transition-colors duration-[var(--motion-base)]',
            'bg-[var(--source-dim)] text-[var(--source)] hover:bg-[var(--source)]/20'
          )}
          aria-label="Extract to YOps"
          title="Extract to YOps"
        >
          <Hexagon className="h-4 w-4" />
        </Button>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className={cn(
            'flex-1 resize-none bg-transparent text-sm leading-relaxed text-[var(--text-primary)]',
            'placeholder:text-[var(--text-tertiary)]',
            'focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed',
            'py-1 min-h-[32px] max-h-[200px] overflow-y-auto'
          )}
          style={{ height: 'auto' }}
        />

        {/* Send / Stop button */}
        {isStreaming ? (
          <Button
            type="button"
            size="icon"
            onClick={onStop}
            className={cn(
              'h-8 w-8 shrink-0 rounded-lg',
              'bg-[var(--status-error)]/10 text-[var(--status-error)]',
              'hover:bg-[var(--status-error)]/20 transition-colors duration-[var(--motion-base)]'
            )}
            aria-label="Stop generation"
          >
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            onClick={handleSend}
            disabled={isEmpty || disabled}
            className={cn(
              'h-8 w-8 shrink-0 rounded-lg',
              'bg-[var(--accent-commit)] text-white',
              'hover:opacity-90 transition-opacity duration-[var(--motion-base)]',
              'disabled:opacity-30 disabled:cursor-not-allowed'
            )}
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
