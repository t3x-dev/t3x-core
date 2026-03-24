'use client';

import { Check, Copy } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface CodeBlockProps {
  language?: string;
  children: string;
}

export function CodeBlock({ language, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [children]);

  return (
    <div className="relative group/code">
      {language && (
        <div className="absolute top-0 left-0 px-2 py-0.5 text-[10px] text-[var(--text-tertiary)] bg-[var(--bg-secondary)] rounded-br font-mono">
          {language}
        </div>
      )}
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-1.5 right-1.5 p-1 rounded opacity-0 group-hover/code:opacity-100 transition-opacity bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <SyntaxHighlighter
        language={language}
        style={oneDark}
        customStyle={{
          margin: 0,
          borderRadius: '0.375rem',
          fontSize: '0.8125rem',
          background: 'var(--bg-tertiary)',
        }}
      >
        {children.replace(/\n$/, '')}
      </SyntaxHighlighter>
    </div>
  );
}
