'use client';

import { Code, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { type UserExperience, useSettingsStore } from '@/store/settingsStore';

const STORAGE_KEY = 't3x-onboarding-experience-set';

const options: { value: UserExperience; icon: typeof Users; title: string; description: string }[] =
  [
    {
      value: 'general',
      icon: Users,
      title: 'General User',
      description:
        'Simplified terminology. Commits become "Snapshots", branches become "Versions".',
    },
    {
      value: 'developer',
      icon: Code,
      title: 'Developer',
      description:
        'Full Git terminology. Commits, branches, merges, and diffs — just like you know them.',
    },
  ];

export function OnboardingDialog() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<UserExperience>('general');
  const setUserExperience = useSettingsStore((s) => s.setUserExperience);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const seen = localStorage.getItem(STORAGE_KEY);
    const onboardingSeen = localStorage.getItem('t3x-onboarding-seen');
    // Show after welcome modal has been seen, but experience not yet set
    if (onboardingSeen === 'true' && seen === null) {
      setOpen(true);
    }
  }, []);

  const handleConfirm = useCallback(() => {
    setUserExperience(selected);
    localStorage.setItem(STORAGE_KEY, 'true');
    setOpen(false);
  }, [selected, setUserExperience]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>How do you work?</DialogTitle>
          <DialogDescription>
            Choose your experience level. This adjusts terminology and defaults. You can change this
            later in Settings.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 my-4">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSelected(opt.value)}
              className={cn(
                'flex items-start gap-3 rounded-lg border p-4 text-left transition-colors',
                selected === opt.value
                  ? 'border-[var(--accent-commit)] bg-[var(--accent-commit)]/5'
                  : 'border-[var(--stroke-divider)] hover:border-[var(--stroke-default)]'
              )}
            >
              <opt.icon
                className={cn(
                  'h-5 w-5 mt-0.5 shrink-0',
                  selected === opt.value
                    ? 'text-[var(--accent-commit)]'
                    : 'text-[var(--text-tertiary)]'
                )}
              />
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">{opt.title}</p>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">{opt.description}</p>
              </div>
            </button>
          ))}
        </div>

        <Button onClick={handleConfirm} className="w-full">
          Continue
        </Button>
      </DialogContent>
    </Dialog>
  );
}
