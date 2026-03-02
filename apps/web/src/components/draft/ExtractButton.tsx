'use client';

import { Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { extractIncremental } from '@/lib/api';

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
      const result = await extractIncremental(projectId, conversationId, draftId);
      const total = result.stats.auto_landed + result.stats.needs_review;
      toast.success(`Extracted ${total} point${total !== 1 ? 's' : ''}`);
      onExtracted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Extraction failed');
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
