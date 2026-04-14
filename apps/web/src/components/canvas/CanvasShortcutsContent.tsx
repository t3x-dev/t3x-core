import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { glass } from '@/utils/theme';
import { cn } from '@/utils/cn';

interface CanvasShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ShortcutRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-[var(--text-secondary)]">{label}</span>
      {children}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-[var(--stroke-divider)] bg-[var(--hover-bg)] px-1.5 py-0.5 text-xs font-mono text-[var(--text-secondary)]">
      {children}
    </kbd>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-[var(--space-item)]">
      {children}
    </h4>
  );
}

function Divider() {
  return <div className="h-px bg-[var(--stroke-divider)]" />;
}

export function CanvasShortcutsDialog({ open, onOpenChange }: CanvasShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('sm:max-w-md rounded-2xl', glass.cardBase, glass.highlight)}>
        <DialogHeader>
          <DialogTitle className="text-[var(--text-primary)]">Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-[var(--space-group)] py-2">
          {/* Navigation */}
          <div>
            <SectionHeader>Navigation</SectionHeader>
            <div className="grid gap-2">
              <ShortcutRow label="Show this help">
                <Kbd>?</Kbd>
              </ShortcutRow>
              <ShortcutRow label="Command palette">
                <Kbd>{'\u2318'}K</Kbd>
              </ShortcutRow>
            </div>
          </div>
          <Divider />
          {/* Canvas */}
          <div>
            <SectionHeader>Canvas</SectionHeader>
            <div className="grid gap-2">
              <ShortcutRow label="Select all">
                <div className="flex items-center gap-1">
                  <Kbd>{'\u2318'}A</Kbd>
                </div>
              </ShortcutRow>
              <ShortcutRow label="Deselect all">
                <Kbd>Escape</Kbd>
              </ShortcutRow>
              <ShortcutRow label="Cycle nodes">
                <div className="flex items-center gap-1">
                  <Kbd>Tab</Kbd>
                  <span className="text-[10px] text-[var(--text-tertiary)]">/</span>
                  <Kbd>{'\u21E7'}Tab</Kbd>
                </div>
              </ShortcutRow>
              <ShortcutRow label="Navigate nodes">
                <Kbd>Arrow keys</Kbd>
              </ShortcutRow>
              <ShortcutRow label="Open node">
                <Kbd>Enter</Kbd>
              </ShortcutRow>
              <ShortcutRow label="Toggle pan mode">
                <Kbd>Space</Kbd>
              </ShortcutRow>
            </div>
          </div>
          <Divider />
          {/* Actions */}
          <div>
            <SectionHeader>Actions</SectionHeader>
            <div className="grid gap-2">
              <ShortcutRow label="Delete selected node">
                <div className="flex items-center gap-1">
                  <Kbd>{'\u232B'}</Kbd>
                  <span className="text-[10px] text-[var(--text-tertiary)]">/</span>
                  <Kbd>Del</Kbd>
                </div>
              </ShortcutRow>
              <ShortcutRow label="Toggle sidebar">
                <Kbd>{'\u2318'}\</Kbd>
              </ShortcutRow>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
