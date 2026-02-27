'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DocumentImportTab } from './DocumentImportTab';
import { PlatformImportTab } from './PlatformImportTab';
import { UrlImportTab } from './UrlImportTab';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onImported: () => void;
}

export function ImportDialog({ open, onOpenChange, projectId, onImported }: ImportDialogProps) {
  const handleSingleImported = (_conversationId: string) => {
    onImported();
  };

  const handlePlatformImported = () => {
    onImported();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Import Content</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="url" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="url" className="flex-1">
              URL
            </TabsTrigger>
            <TabsTrigger value="document" className="flex-1">
              Document
            </TabsTrigger>
            <TabsTrigger value="platform" className="flex-1">
              Platform
            </TabsTrigger>
          </TabsList>

          <TabsContent value="url" className="mt-4">
            <UrlImportTab projectId={projectId} onImported={handleSingleImported} />
          </TabsContent>

          <TabsContent value="document" className="mt-4">
            <DocumentImportTab projectId={projectId} onImported={handleSingleImported} />
          </TabsContent>

          <TabsContent value="platform" className="mt-4">
            <PlatformImportTab projectId={projectId} onImported={handlePlatformImported} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
