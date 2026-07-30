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

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
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

  it('renders a quick settings surface and closes through the modal shell', async () => {
    act(() => {
      useSettingsModalStore.getState().openSettingsModal('providers');
    });

    render(<SettingsModal />);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Quick Settings' })).toBeInTheDocument();
    expect(screen.getByText('Fast local changes and readiness shortcuts.')).toBeInTheDocument();
    expect(screen.getByText('Local profile')).toBeInTheDocument();
    expect(screen.getByText('Display name, avatar, and edit author.')).toBeInTheDocument();
    expect(screen.getByText('Appearance')).toBeInTheDocument();
    expect(screen.getByText('Provider readiness')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Provider readiness/i })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: 'Open full settings' })).toHaveAttribute(
      'href',
      '/settings'
    );
    expect(screen.queryByText('Mock Providers Panel')).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });

    await waitFor(() => {
      expect(useSettingsModalStore.getState().isOpen).toBe(false);
    });
  });

  it('closes the quick modal when navigating to a setting shortcut', async () => {
    act(() => {
      useSettingsModalStore.getState().openSettingsModal('profile');
    });

    render(<SettingsModal />);

    fireEvent.click(await screen.findByRole('link', { name: /Local profile/i }));

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
    expect(screen.getAllByRole('heading', { name: 'Quick Settings' })).toHaveLength(1);
  });

  it('keeps complex settings out of the quick modal', async () => {
    act(() => {
      useSettingsModalStore.getState().openSettingsModal('profile');
    });

    render(<SettingsModal />);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByText('API Access')).not.toBeInTheDocument();
    expect(screen.queryByText('Webhooks')).not.toBeInTheDocument();
    expect(screen.queryByText('Recipes')).not.toBeInTheDocument();
  });

  it('uses a compact quick-settings shell rather than a full settings center', async () => {
    act(() => {
      useSettingsModalStore.getState().openSettingsModal('preferences');
    });

    render(<SettingsModal />);

    const dialog = await screen.findByRole('dialog');
    const shell = screen.getByTestId('settings-modal-shell');

    expect(dialog.className).toContain('w-[min(520px,calc(100vw-24px))]');
    expect(dialog.className).not.toContain('h-[94vh]');
    expect(dialog.className).not.toContain('max-w-[1760px]');
    expect(shell.className).toContain('rounded-2xl');
  });
});
