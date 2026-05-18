import type { LocalWorkspaceAvatarColor } from '@/store/settingsStore';

export const LOCAL_WORKSPACE_AVATAR_OPTIONS: Array<{
  value: LocalWorkspaceAvatarColor;
  className: string;
}> = [
  { value: 'blue', className: 'bg-[var(--accent-commit)]' },
  { value: 'emerald', className: 'bg-[var(--status-success)]' },
  { value: 'violet', className: 'bg-[var(--accent-extract)]' },
  { value: 'amber', className: 'bg-[var(--accent-branch)]' },
  { value: 'rose', className: 'bg-[var(--status-error)]' },
  { value: 'cyan', className: 'bg-[var(--accent-leaf)]' },
  { value: 'indigo', className: 'bg-[var(--accent-conversation)]' },
  { value: 'teal', className: 'bg-[var(--accent-leaf)]' },
];

export function getLocalWorkspaceAvatarClass(color: LocalWorkspaceAvatarColor): string {
  return (
    LOCAL_WORKSPACE_AVATAR_OPTIONS.find((option) => option.value === color)?.className ??
    LOCAL_WORKSPACE_AVATAR_OPTIONS[0].className
  );
}
