import { ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';
import styles from './SchemaEditorOverlay.module.css';

export function SchemaEditorSelect(props: ComponentProps<'select'>) {
  return (
    <span className={styles.selectWrap}>
      <select {...props} className={styles.select} />
      <ChevronDown size={14} aria-hidden="true" />
    </span>
  );
}
