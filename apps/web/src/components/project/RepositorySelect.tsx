'use client';

import type { LucideIcon } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import palette from '@/styles/management-palette.module.css';
import { cn } from '@/utils/cn';
import styles from './RepositoryControls.module.css';

export function RepositorySelect({
  label,
  id,
  value,
  onValueChange,
  options,
  disabled,
  required,
  describedBy,
  className,
}: {
  label: string;
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly { value: string; label: string; icon?: LucideIcon }[];
  disabled?: boolean;
  required?: boolean;
  describedBy?: string;
  className?: string;
}) {
  const selected = options.find((option) => option.value === value);
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled} required={required}>
      <SelectTrigger
        id={id}
        aria-label={label}
        aria-describedby={describedBy}
        className={cn(styles.select, className)}
      >
        {selected?.icon && <selected.icon aria-hidden="true" size={16} />}
        <SelectValue>{selected?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end" position="popper" className={cn(palette.scope, styles.selectMenu)}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} className={styles.selectItem}>
            {option.icon && <option.icon aria-hidden="true" size={16} />}
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
