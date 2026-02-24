'use client';

import { ThemeProvider } from 'next-themes';
import { useCallback, useEffect, useState } from 'react';
import { CommandPalette } from '@/components/CommandPalette';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { WelcomeModal } from '@/components/onboarding/WelcomeModal';
import { Sidebar } from '@/components/Sidebar';
import { showToast } from '@/components/Toast';
import { Toaster } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';
import { usePinsStore } from '@/store/pinsStore';
import { useProjectStore } from '@/store/projectStore';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const setProjectNotify = useProjectStore((state) => state.setNotifyCallback);
  const setCanvasNotify = useCanvasStore((state) => state.setNotifyCallback);
  const setPinsNotify = usePinsStore((state) => state.setNotifyCallback);

  // Sidebar collapsed state — lifted here so main content margin can follow
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('t3x-sidebar-collapsed') !== 'false';
  });

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('t3x-sidebar-collapsed', String(next));
      return next;
    });
  }, []);

  // Global ⌘+\ keyboard shortcut for sidebar toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        toggleSidebar();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [toggleSidebar]);

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
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ErrorBoundary>
        <div className="flex min-h-screen bg-background">
          <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
          <main
            className={cn(
              'flex flex-1 flex-col overflow-hidden transition-[margin-left] duration-[var(--duration-normal)] ease-[var(--ease-out-soft)]',
              sidebarCollapsed ? 'ml-16' : 'ml-52'
            )}
          >
            <div className="flex flex-1 flex-col">{children}</div>
          </main>
          <Toaster position="bottom-right" richColors closeButton />
          <CommandPalette />
          <WelcomeModal />
        </div>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
