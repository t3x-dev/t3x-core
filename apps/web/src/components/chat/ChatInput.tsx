'use client';

import { Paperclip, Send } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = 'Message...',
}: ChatInputProps) {
  const [value, setValue] = useState('');
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

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    // Reset height after clearing
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const isEmpty = !value.trim();

  return (
    <div
      className={cn(
        'flex items-end gap-2 rounded-xl border border-[var(--stroke-default)] bg-[var(--surface-panel)]',
        'px-3 py-2 transition-colors duration-[var(--motion-base)]',
        'focus-within:border-[var(--accent-commit)] focus-within:ring-1 focus-within:ring-[var(--accent-commit)]/30'
      )}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
      />

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

      {/* Send button */}
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
    </div>
  );
}
