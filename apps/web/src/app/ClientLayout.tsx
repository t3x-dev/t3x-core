'use client';

import { SessionProvider } from 'next-auth/react';
import { useParams } from 'next/navigation';
import { ThemeProvider } from 'next-themes';
import { useCallback, useEffect, useState } from 'react';
import { CommandPalette } from '@/components/CommandPalette';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { KeyboardShortcutsDialog } from '@/components/KeyboardShortcutsDialog';
import { OnboardingDialog } from '@/components/onboarding/OnboardingDialog';
import { WelcomeModal } from '@/components/onboarding/WelcomeModal';
import { Sidebar } from '@/components/Sidebar';
import { NotificationBell } from '@/components/shared/NotificationBell';
import { VerificationBadge } from '@/components/shared/VerificationBadge';
import { showToast } from '@/components/Toast';
import { Toaster } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';
import { usePinsStore } from '@/store/pinsStore';
import { useProjectStore } from '@/store/projectStore';
import { useSettingsStore } from '@/store/settingsStore';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const setProjectNotify = useProjectStore((state) => state.setNotifyCallback);
  const setCanvasNotify = useCanvasStore((state) => state.setNotifyCallback);
  const setPinsNotify = usePinsStore((state) => state.setNotifyCallback);
  const density = useSettingsStore((s) => s.density);
  const params = useParams();
  const projectId = typeof params?.projectId === 'string' ? params.projectId : null;

  // Sync density attribute to document
  useEffect(() => {
    document.documentElement.setAttribute('data-density', density);
  }, [density]);

  // Sidebar collapsed state — lifted here so main content margin can follow
  // Default to `true` (collapsed) on both server & client to avoid hydration mismatch,
  // then sync from localStorage after mount.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('t3x-sidebar-collapsed');
    if (stored === 'false') {
      setSidebarCollapsed(false);
    }
  }, []);

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
    <SessionProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <ErrorBoundary>
          <div className="flex h-screen bg-background">
            <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
            <main
              aria-label="Main content"
              className={cn(
                'flex flex-1 flex-col overflow-hidden transition-[margin-left] duration-[var(--duration-normal)] ease-[var(--ease-out-soft)]',
                sidebarCollapsed ? 'ml-16' : 'ml-52'
              )}
            >
              <div className="flex items-center justify-end gap-2 px-4 h-8 shrink-0">
                {projectId && <VerificationBadge key={projectId} projectId={projectId} />}
                <NotificationBell />
              </div>
              <div className="flex flex-1 flex-col min-h-0">{children}</div>
            </main>
            <Toaster position="bottom-right" richColors closeButton />
            <CommandPalette />
            <KeyboardShortcutsDialog />
            <WelcomeModal />
            <OnboardingDialog />
          </div>
        </ErrorBoundary>
      </ThemeProvider>
    </SessionProvider>
  );
}
