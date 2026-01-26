'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Settings2, Download, FileJson, FileText, Copy, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePinsStore } from '@/store/pinsStore';
import { EditContextDialog } from './EditContextDialog';
import { toast } from 'sonner';

// Use standalone API if configured, otherwise fall back to embedded routes
const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
const API_V1 = `${API_BASE}/api/v1`;

interface ContextPanelProps {
  conversationId: string;
  projectId: string;
  contextConfig: { selected_pin_ids: string[] | null } | null;
  onContextChange: (pinIds: string[] | null) => void;
}

export function ContextPanel({
  conversationId,
  projectId,
  contextConfig,
  onContextChange,
}: ContextPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const { pins } = usePinsStore();

  // Export context as file (JSON or Markdown)
  const handleExport = async (format: 'json' | 'markdown') => {
    setIsExporting(true);
    try {
      const response = await fetch(
        `${API_V1}/conversations/${conversationId}/context-export?format=${format}`
      );

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Get filename from Content-Disposition header or generate one
      const disposition = response.headers.get('Content-Disposition');
      const filenameMatch = disposition?.match(/filename="(.+)"/);
      const filename = filenameMatch?.[1] ?? `${conversationId}-context.${format === 'markdown' ? 'md' : 'json'}`;

      // Download the file
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Context exported as ${format.toUpperCase()}`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export context');
    } finally {
      setIsExporting(false);
    }
  };

  // Copy context to clipboard
  const handleCopyToClipboard = async () => {
    setIsExporting(true);
    try {
      const response = await fetch(`${API_V1}/conversations/${conversationId}/memory`);

      if (!response.ok) {
        throw new Error('Failed to get context');
      }

      const data = await response.json();
      if (data.success && data.data?.text) {
        await navigator.clipboard.writeText(data.data.text);
        toast.success('Context copied to clipboard');
      } else {
        throw new Error('Invalid response');
      }
    } catch (error) {
      console.error('Copy error:', error);
      toast.error('Failed to copy context');
    } finally {
      setIsExporting(false);
    }
  };

  // Determine active pins
  const activePins = contextConfig?.selected_pin_ids === null
    ? pins // all pins
    : pins.filter(p => contextConfig?.selected_pin_ids?.includes(p.id));

  const convPins = activePins.filter(p => p.type === 'conversation');
  const leafPins = activePins.filter(p => p.type === 'leaf');

  return (
    <div className="border-r bg-muted/30 w-64 flex flex-col">
      {/* Header */}
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <span className="font-medium text-sm">Context</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Export dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={isExporting}
                onClick={(e) => e.stopPropagation()}
              >
                {isExporting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Download className="h-3 w-3" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => handleExport('json')}>
                <FileJson className="h-4 w-4 mr-2" />
                Export as JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('markdown')}>
                <FileText className="h-4 w-4 mr-2" />
                Export as Markdown
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCopyToClipboard}>
                <Copy className="h-4 w-4 mr-2" />
                Copy to Clipboard
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Settings button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              setIsDialogOpen(true);
            }}
          >
            <Settings2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="p-3 space-y-3 text-sm">
          {/* Status */}
          <div className="text-muted-foreground">
            {contextConfig?.selected_pin_ids === null
              ? 'Using all pins'
              : `Using ${activePins.length} pins`}
          </div>

          {/* Pinned conversations */}
          {convPins.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                Conversations
              </div>
              {convPins.map(pin => (
                <div key={pin.id} className="flex items-center gap-1">
                  <span className="text-amber-500">📌</span>
                  <span className="truncate">{pin.ref_id}</span>
                </div>
              ))}
            </div>
          )}

          {/* Pinned leaves */}
          {leafPins.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                Leaves
              </div>
              {leafPins.map(pin => (
                <div key={pin.id} className="flex items-center gap-1">
                  <span className="text-amber-500">📌</span>
                  <span className="truncate">{pin.ref_id}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit Dialog */}
      <EditContextDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        projectId={projectId}
        conversationId={conversationId}
        currentSelection={contextConfig?.selected_pin_ids ?? null}
        onSave={onContextChange}
      />
    </div>
  );
}
