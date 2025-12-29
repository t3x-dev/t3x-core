'use client';

import { useEffect } from 'react';
import { CommandPalette } from '@/components/CommandPalette';
import { Sidebar } from '@/components/Sidebar';
import { showToast } from '@/components/Toast';
import { Toaster } from '@/components/ui/sonner';
import { useCanvasStore } from '@/store/canvasStore';
import { useProjectStore } from '@/store/projectStore';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const setProjectNotify = useProjectStore((state) => state.setNotifyCallback);
  const setCanvasNotify = useCanvasStore((state) => state.setNotifyCallback);

  // Register toast callback with stores
  useEffect(() => {
    setProjectNotify(showToast);
    setCanvasNotify(showToast);
    return () => {
      setProjectNotify(null);
      setCanvasNotify(null);
    };
  }, [setProjectNotify, setCanvasNotify]);

  return (
    <div className="flex min-h-screen bg-muted/30">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
      <Toaster position="bottom-right" richColors closeButton />
      <CommandPalette />
    </div>
  );
}
