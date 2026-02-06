'use client';

import { useEffect } from 'react';
import { CommandPalette } from '@/components/CommandPalette';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Sidebar } from '@/components/Sidebar';
import { showToast } from '@/components/Toast';
import { Toaster } from '@/components/ui/sonner';
import { useCanvasStore } from '@/store/canvasStore';
import { usePinsStore } from '@/store/pinsStore';
import { useProjectStore } from '@/store/projectStore';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const setProjectNotify = useProjectStore((state) => state.setNotifyCallback);
  const setCanvasNotify = useCanvasStore((state) => state.setNotifyCallback);
  const setPinsNotify = usePinsStore((state) => state.setNotifyCallback);

  // Register toast callback with stores
  useEffect(() => {
    setProjectNotify(showToast);
    setCanvasNotify(showToast);
    setPinsNotify(showToast);
    return () => {
      setProjectNotify(null);
      setCanvasNotify(null);
      setPinsNotify(null);
    };
  }, [setProjectNotify, setCanvasNotify, setPinsNotify]);

  return (
    <ErrorBoundary>
      <div className="flex min-h-screen bg-muted/30">
        <Sidebar />
        <main className="ml-16 flex flex-1 flex-col overflow-hidden">{children}</main>
        <Toaster position="bottom-right" richColors closeButton />
        <CommandPalette />
      </div>
    </ErrorBoundary>
  );
}
