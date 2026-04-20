import type { LocalWorkspaceAvatarColor } from '@/store/settingsStore';

export const LOCAL_WORKSPACE_AVATAR_OPTIONS: Array<{
  value: LocalWorkspaceAvatarColor;
  className: string;
}> = [
  { value: 'blue', className: 'bg-blue-600' },
  { value: 'emerald', className: 'bg-emerald-600' },
  { value: 'violet', className: 'bg-violet-600' },
  { value: 'amber', className: 'bg-amber-600' },
  { value: 'rose', className: 'bg-rose-600' },
  { value: 'cyan', className: 'bg-cyan-600' },
  { value: 'indigo', className: 'bg-indigo-600' },
  { value: 'teal', className: 'bg-teal-600' },
];

export function getLocalWorkspaceAvatarClass(color: LocalWorkspaceAvatarColor): string {
  return (
    LOCAL_WORKSPACE_AVATAR_OPTIONS.find((option) => option.value === color)?.className ??
    LOCAL_WORKSPACE_AVATAR_OPTIONS[0].className
  );
}
