'use client';

import Image from 'next/image';
import { cn } from '@/utils/cn';

const AVATAR_COLORS = [
  'bg-blue-600',
  'bg-emerald-600',
  'bg-violet-600',
  'bg-amber-600',
  'bg-rose-600',
  'bg-cyan-600',
  'bg-indigo-600',
  'bg-teal-600',
] as const;

type UserAvatarSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASS: Record<UserAvatarSize, string> = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-8 w-8 text-sm',
  lg: 'h-14 w-14 text-lg',
  xl: 'h-20 w-20 text-2xl',
};

const SIZE_PIXELS: Record<UserAvatarSize, number> = {
  sm: 28,
  md: 32,
  lg: 56,
  xl: 80,
};

function getAvatarColor(str: string): string {
  let hash = 0;
  for (let index = 0; index < str.length; index++) {
    hash = (hash * 31 + str.charCodeAt(index)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitial(name: string | null, username: string | null): string {
  const display = name || username || '?';
  return display.charAt(0).toUpperCase();
}

interface UserAvatarProps {
  name: string | null;
  username: string | null;
  avatarUrl?: string | null;
  size?: UserAvatarSize;
  className?: string;
}

export function UserAvatar({ name, username, avatarUrl, size = 'md', className }: UserAvatarProps) {
  const displayName = name || username || 'User';
  const normalizedAvatarUrl = avatarUrl?.trim() || null;

  if (normalizedAvatarUrl) {
    return (
      <Image
        src={normalizedAvatarUrl}
        alt={displayName}
        width={SIZE_PIXELS[size]}
        height={SIZE_PIXELS[size]}
        unoptimized
        className={cn(
          'shrink-0 rounded-full object-cover ring-1 ring-[var(--stroke-divider)]',
          SIZE_CLASS[size],
          className
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-medium text-white',
        getAvatarColor(username || name || 'user'),
        SIZE_CLASS[size],
        className
      )}
    >
      {getInitial(name, username)}
    </div>
  );
}
