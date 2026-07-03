'use client';

import { useParams, usePathname } from 'next/navigation';
import { ThemeProvider } from 'next-themes';
import { useEffect } from 'react';
import { CommandPalette } from '@/components/layout/CommandPalette';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { KeyboardShortcutsDialog } from '@/components/layout/KeyboardShortcutsDialog';
import { showToast } from '@/components/layout/Toast';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { Toaster } from '@/components/ui/sonner';
import { useCanvasStore } from '@/store/canvasStore';
import { usePinsStore } from '@/store/pinsStore';
import { useProjectStore } from '@/store/projectStore';
import { useSessionStore } from '@/store/sessionStore';
import { useSettingsStore } from '@/store/settingsStore';

export function isCommitDetailRoute(pathname: string): boolean {
  return /^\/project\/[^/]+\/commit\/[^/]+(?:\/)?$/.test(pathname);
}

export function isProjectDiffRoute(pathname: string): boolean {
  return /^\/project\/[^/]+\/diff(?:\/)?$/.test(pathname);
}

export function isProjectMergeRoute(pathname: string): boolean {
  return /^\/project\/[^/]+\/merge\/[^/]+(?:\/)?$/.test(pathname);
}

export function isShelllessDetailRoute(pathname: string): boolean {
  return (
    isCommitDetailRoute(pathname) || isProjectDiffRoute(pathname) || isProjectMergeRoute(pathname)
  );
}

export function isSettingsRoute(pathname: string): boolean {
  return /^\/settings(?:\/.*)?$/.test(pathname);
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';
  const setProjectNotify = useProjectStore((state) => state.setNotifyCallback);
  const setCanvasNotify = useCanvasStore((state) => state.setNotifyCallback);
  const setPinsNotify = usePinsStore((state) => state.setNotifyCallback);
  const density = useSettingsStore((s) => s.density);
  const cleanupLegacyKeys = useSessionStore((s) => s.cleanupLegacyKeys);
  const params = useParams();
  const projectId = typeof params?.projectId === 'string' ? params.projectId : null;

  // Clean up legacy onboarding localStorage keys on first mount
  useEffect(() => {
    cleanupLegacyKeys();
  }, [cleanupLegacyKeys]);

  // Sync density attribute to document
  useEffect(() => {
    document.documentElement.setAttribute('data-density', density);
  }, [density]);

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

  // Login page: render bare layout without sidebar/shell
  if (isLoginPage) {
    return (
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        {children}
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ErrorBoundary>
        <div className="flex min-h-screen bg-background">
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:shadow-lg"
          >
            Skip to content
          </a>
          <main
            id="main-content"
            aria-label="Main content"
            className="flex flex-1 flex-col overflow-hidden"
          >
            <div className="flex flex-1 flex-col min-h-0">{children}</div>
          </main>
          <Toaster position="bottom-right" richColors closeButton />
          <CommandPalette projectId={projectId ?? undefined} />
          <KeyboardShortcutsDialog />
          <SettingsModal />
        </div>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
