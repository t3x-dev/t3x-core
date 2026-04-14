import { cn } from '@/utils/cn';

interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
}

/**
 * Keyboard key indicator component
 * Use for displaying keyboard shortcuts inline
 *
 * @example
 * <Kbd>⌘K</Kbd>
 * <Kbd>Ctrl</Kbd> + <Kbd>S</Kbd>
 */
function Kbd({ className, children, ...props }: KbdProps) {
  return (
    <kbd
      className={cn(
        'pointer-events-none inline-flex h-5 select-none items-center gap-1',
        'rounded border border-border bg-muted px-1.5',
        'font-mono text-[10px] font-medium text-muted-foreground',
        className
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}

/**
 * Keyboard shortcut display with multiple keys
 *
 * @example
 * <KbdShortcut keys={['⌘', 'K']} />
 * <KbdShortcut keys={['Ctrl', 'Shift', 'P']} />
 */
function KbdShortcut({
  keys,
  separator = '',
  className,
}: {
  keys: string[];
  separator?: string;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      {keys.map((key, i) => (
        <span key={key} className="inline-flex items-center">
          <Kbd>{key}</Kbd>
          {separator && i < keys.length - 1 && (
            <span className="mx-0.5 text-muted-foreground">{separator}</span>
          )}
        </span>
      ))}
    </span>
  );
}

/**
 * Platform-aware modifier key
 * Shows ⌘ on Mac, Ctrl on Windows/Linux
 */
function getModifierKey(): string {
  if (typeof window === 'undefined') return '⌘';
  return navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl';
}

export { Kbd, KbdShortcut, getModifierKey };
