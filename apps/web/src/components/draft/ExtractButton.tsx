'use client';

import { Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface ExtractButtonProps {
  draftId: string;
  projectId: string;
  conversationId: string;
  onExtracted: () => void;
  disabled?: boolean;
}

export function ExtractButton({
  draftId,
  projectId,
  conversationId,
  onExtracted,
  disabled,
}: ExtractButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleExtract = async () => {
    setLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/v1/extract/incremental`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          conversation_id: conversationId,
          draft_id: draftId,
        }),
      });
      if (!res.ok) throw new Error('Extraction failed');
      onExtracted();
    } catch (err) {
      console.error('Extraction failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={handleExtract} disabled={disabled || loading} variant="outline">
      {loading ? (
        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
      ) : (
        <Sparkles className="mr-1.5 h-4 w-4" />
      )}
      Extract
    </Button>
  );
}
