'use client';

import type { LucideIcon } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SettingsSection } from './SettingsSection';

export function DeferredSettingsSection({
  id,
  icon,
  title,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (opened) return;
    if (window.location.hash === `#${id}`) {
      setOpened(true);
      return;
    }
    const target = document.getElementById(id);
    if (!target || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setOpened(true);
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [id, opened]);

  return opened ? (
    children
  ) : (
    <SettingsSection id={id} icon={icon} title={title} description={null}>
      <Button type="button" variant="outline" onClick={() => setOpened(true)}>
        Load {title.toLowerCase()} settings
      </Button>
    </SettingsSection>
  );
}
