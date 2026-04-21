// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ClientLayout from '@/app/ClientLayout';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { useSettingsModalStore } from '@/store/settingsModalStore';

const setProjectNotify = vi.fn();
const setCanvasNotify = vi.fn();
const setPinsNotify = vi.fn();
const cleanupLegacyKeys = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({}),
  usePathname: () => '/',
}));

vi.mock('next-themes', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ui/dialog', async () => {
  const React = await import('react');

  const DialogContext = React.createContext<{
    open: boolean;
    onOpenChange?: (open: boolean) => void;
  }>({ open: false });

  function Dialog({
    children,
    open = false,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) {
    return (
      <DialogContext.Provider value={{ open, onOpenChange }}>{children}</DialogContext.Provider>
    );
  }

  function DialogContent({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) {
    const { open, onOpenChange } = React.useContext(DialogContext);
    if (!open) return null;

    return (
      <div role="dialog" aria-modal="true" className={className}>
        {children}
        <button type="button" aria-label="Close" onClick={() => onOpenChange?.(false)}>
          Close
        </button>
      </div>
    );
  }

  return {
    Dialog,
    DialogContent,
    DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  };
});

vi.mock('@/components/ui/tabs', async () => {
  const React = await import('react');

  const TabsContext = React.createContext<{
    value: string;
    onValueChange?: (value: string) => void;
  }>({ value: '' });

  function Tabs({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value: string;
    onValueChange?: (value: string) => void;
  }) {
    return <TabsContext.Provider value={{ value, onValueChange }}>{children}</TabsContext.Provider>;
  }

  function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
      <div role="tablist" className={className}>
        {children}
      </div>
    );
  }

  function TabsTrigger({
    children,
    value,
    className,
  }: {
    children: React.ReactNode;
    value: string;
    className?: string;
  }) {
    const { value: activeValue, onValueChange } = React.useContext(TabsContext);
    return (
      <button
        type="button"
        role="tab"
        aria-selected={activeValue === value}
        className={className}
        onClick={() => onValueChange?.(value)}
      >
        {children}
      </button>
    );
  }

  function TabsContent({ children, value }: { children: React.ReactNode; value: string }) {
    const { value: activeValue } = React.useContext(TabsContext);
    if (activeValue !== value) return null;
    return <div>{children}</div>;
  }

  return {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
  };
});

vi.mock('@/components/layout/CommandPalette', () => ({
  CommandPalette: () => null,
}));

vi.mock('@/components/layout/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/layout/KeyboardShortcutsDialog', () => ({
  KeyboardShortcutsDialog: () => null,
}));

vi.mock('@/components/layout/Sidebar', () => ({
  Sidebar: () => null,
}));

vi.mock('@/components/settings/ProfileSettingsPanel', () => ({
  ProfileSettingsPanel: () => <div>Mock Profile Panel</div>,
}));

vi.mock('@/components/settings/PreferencesSettingsPanel', () => ({
  PreferencesSettingsPanel: () => <div>Mock Preferences Panel</div>,
}));

vi.mock('@/components/settings/ProvidersSettingsPanel', () => ({
  ProvidersSettingsPanel: () => <div>Mock Providers Panel</div>,
}));

vi.mock('@/components/shared/NotificationBell', () => ({
  NotificationBell: () => null,
}));

vi.mock('@/components/shared/VerificationBadge', () => ({
  VerificationBadge: () => null,
}));

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => null,
}));

vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: (selector: (state: { setNotifyCallback: typeof setCanvasNotify }) => unknown) =>
    selector({ setNotifyCallback: setCanvasNotify }),
}));

vi.mock('@/store/pinsStore', () => ({
  usePinsStore: (selector: (state: { setNotifyCallback: typeof setPinsNotify }) => unknown) =>
    selector({ setNotifyCallback: setPinsNotify }),
}));

vi.mock('@/store/projectStore', () => ({
  useProjectStore: (selector: (state: { setNotifyCallback: typeof setProjectNotify }) => unknown) =>
    selector({ setNotifyCallback: setProjectNotify }),
}));

vi.mock('@/store/sessionStore', () => ({
  useSessionStore: (
    selector: (state: { cleanupLegacyKeys: typeof cleanupLegacyKeys }) => unknown
  ) => selector({ cleanupLegacyKeys }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: (selector: (state: { density: string }) => unknown) =>
    selector({ density: 'comfortable' }),
}));

describe('SettingsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      configurable: true,
    });
    act(() => {
      useSettingsModalStore.setState(useSettingsModalStore.getInitialState());
    });
  });

  afterEach(() => {
    act(() => {
      useSettingsModalStore.setState(useSettingsModalStore.getInitialState());
    });
  });

  it('stays closed until the modal store opens it', () => {
    render(<SettingsModal />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the active tab from store state and closes through the modal shell', async () => {
    act(() => {
      useSettingsModalStore.getState().openSettingsModal('providers');
    });

    render(<SettingsModal />);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByText('Mock Providers Panel')).toBeInTheDocument();
    expect(screen.queryByText('Mock Preferences Panel')).not.toBeInTheDocument();

    act(() => {
      useSettingsModalStore.getState().setActiveTab('preferences');
    });

    await waitFor(() => {
      expect(screen.getByText('Mock Preferences Panel')).toBeInTheDocument();
    });

    expect(useSettingsModalStore.getState().activeTab).toBe('preferences');

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });

    await waitFor(() => {
      expect(useSettingsModalStore.getState().isOpen).toBe(false);
    });
  });

  it('is mounted once at the app root through ClientLayout', async () => {
    useSettingsModalStore.getState().openSettingsModal('profile');

    render(
      <ClientLayout>
        <div>App Content</div>
      </ClientLayout>
    );

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getAllByRole('heading', { name: 'Settings' })).toHaveLength(1);
  });

  it('shows the settings sections in a dedicated left navigation rail', async () => {
    act(() => {
      useSettingsModalStore.getState().openSettingsModal('profile');
    });

    render(<SettingsModal />);

    const tablist = await screen.findByRole('tablist');
    expect(tablist).toHaveTextContent('Profile');
    expect(tablist).toHaveTextContent('Preferences');
    expect(tablist).toHaveTextContent('Providers');
  });

  it('uses a distinct modal shell with a thin left rail and separate content panel', async () => {
    act(() => {
      useSettingsModalStore.getState().openSettingsModal('preferences');
    });

    render(<SettingsModal />);

    const shell = await screen.findByTestId('settings-modal-shell');
    const rail = screen.getByTestId('settings-modal-rail');
    const panel = screen.getByTestId('settings-modal-panel');
    const tablist = screen.getByRole('tablist');

    expect(shell.className).toContain('rounded-[34px]');
    expect(panel.className).toContain('bg-white');
    expect(rail.className).toContain('border-r');
    expect(tablist.className).toContain('w-full');
    expect(tablist.className).not.toContain('w-56');
  });

  it('renders as a large settings sheet with a sidebar surface and roomy content canvas', async () => {
    act(() => {
      useSettingsModalStore.getState().openSettingsModal('profile');
    });

    render(<SettingsModal />);

    const dialog = await screen.findByRole('dialog');
    const shell = screen.getByTestId('settings-modal-shell');
    const rail = screen.getByTestId('settings-modal-rail');
    const panel = screen.getByTestId('settings-modal-panel');
    const canvas = screen.getByTestId('settings-modal-canvas');

    expect(dialog.className).toContain('w-[96vw]');
    expect(dialog.className).toContain('h-[94vh]');
    expect(dialog.className).toContain('max-w-[1760px]');
    expect(dialog.className).toContain('sm:max-w-[1760px]');
    expect(shell.className).toContain('rounded-[34px]');
    expect(rail.className).toContain('bg-[color-mix(in_srgb,var(--surface-app)_92%,white_8%)]');
    expect(panel.className).toContain('bg-white');
    expect(canvas.className).toContain('px-10');
  });
});
