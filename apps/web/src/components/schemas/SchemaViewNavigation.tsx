'use client';
import { cx, ReferenceIcon } from './DiscoverReference';
export type SchemaView = 'discover' | 'browse' | 'studio';
export function SchemaViewNavigation({
  value,
  onChange,
  views = ['discover', 'browse', 'studio'],
}: {
  value: SchemaView;
  onChange: (view: SchemaView) => void;
  views?: readonly SchemaView[];
}) {
  return (
    <nav aria-label="Schema views" className={cx('modes')}>
      <div role="tablist" aria-label="Schema views" style={{ display: 'contents' }}>
        {(
          [
            ['discover', 'Discover', 'compass'],
            ['browse', 'Browse', 'grid'],
            ['studio', 'Studio', 'pencil'],
          ] as const
        )
          .filter(([view]) => views.includes(view))
          .map(([view, label, icon]) => (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={value === view}
              onClick={() => onChange(view)}
            >
              <span className={value === view ? cx('on') : undefined}>
                <ReferenceIcon name={icon} size={14} />
                {label}
              </span>
            </button>
          ))}
      </div>
    </nav>
  );
}
