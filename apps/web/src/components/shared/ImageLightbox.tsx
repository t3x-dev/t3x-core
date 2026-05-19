'use client';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

interface ImageLightboxProps {
  url: string;
  open: boolean;
  onClose: () => void;
}

export function ImageLightbox({ url, open, onClose }: ImageLightboxProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        className="max-w-[90vw] max-h-[90vh] p-0 border-none bg-transparent shadow-none"
        overlayClassName="bg-[var(--overlay-scrim)] backdrop-blur"
        showCloseButton
      >
        <DialogTitle className="sr-only">Image preview</DialogTitle>
        {/* biome-ignore lint/performance/noImgElement: dynamic user-provided URL, dimensions unknown */}
        <img
          src={url}
          alt="Full size preview"
          className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
        />
      </DialogContent>
    </Dialog>
  );
}
