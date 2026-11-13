import { ArrowRight, Box } from 'lucide-react';
import type {
  OperationStack,
  OperationStackItem,
} from '@/domain/workspaces/composeOperationStacks';
import fieldStyles from './ComposeObjectFields.module.css';
import styles from './ComposeOperationStacks.module.css';

function value(value: unknown) {
  if (value === undefined) return 'Not present';
  return typeof value === 'string' ? value || 'Empty text' : JSON.stringify(value);
}

function itemTitle(item: OperationStackItem) {
  const title = item.fields.find((field) => field.path.endsWith('/slots/title'));
  const text = title?.after ?? title?.before;
  return typeof text === 'string' && text ? text : fieldName(item.fields[0]?.path ?? item.path);
}

function fieldName(path: string) {
  return path.split('/').at(-1) ?? path;
}

function FieldPreview({ item }: { item: OperationStackItem }) {
  return (
    <span className={`${fieldStyles.fields} ${styles.fieldPreview}`}>
      {item.fields.slice(0, 3).map((field, index) => (
        <span className={fieldStyles.field} key={`${field.path}:${index}`}>
          <code title={field.path}>{fieldName(field.path)}:</code>
          <span
            className={fieldStyles.values}
            title={`${value(field.before)} → ${value(field.after)}`}
          >
            <del data-absent={field.before === undefined}>{value(field.before)}</del>
            <ArrowRight aria-hidden="true" />
            <ins data-absent={field.after === undefined}>{value(field.after)}</ins>
          </span>
        </span>
      ))}
      {item.unavailable ??
        (item.fields.length > 3 ? `+${item.fields.length - 3} more fields` : null)}
    </span>
  );
}

/** Recorded operations stay intact; the nested set/unset cards describe field changes. */
export function ComposeOperationStacks({ stacks }: { stacks: readonly OperationStack[] }) {
  return (
    <section aria-label="Recorded operation stacks" className={styles.section}>
      <p className={styles.note}>
        Field-level set/unset cards describe each recorded operation’s effect. They are not its
        compiled YOps primitives; exact YOps remain in Details.
      </p>
      <div className={styles.groups}>
        {stacks.map((stack) => (
          <div
            className={styles.group}
            data-stacked={stack.items.length > 1 || undefined}
            key={`${stack.name}:${stack.path}`}
          >
            {stack.items.map((item) => (
              <details className={styles.item} key={`${item.actionId}:${item.index}`}>
                <summary>
                  <span className={styles.icon} aria-hidden="true">
                    <Box size={14} />
                  </span>
                  <span className={styles.identity}>
                    <span className={styles.title}>
                      <strong>{itemTitle(item)}</strong>
                      <small>{item.name}</small>
                    </span>
                    <code title={item.path}>
                      P-{String(item.sequence).padStart(2, '0')} · YOp {item.index} · {item.path}
                    </code>
                  </span>
                  <FieldPreview item={item} />
                </summary>
                {item.unavailable ? (
                  <p className={styles.unavailable}>{item.unavailable}</p>
                ) : item.fields.length ? (
                  <ul className={styles.fields}>
                    {item.fields.map((field, index) => (
                      <li className={styles.field} key={`${field.path}:${field.op}:${index}`}>
                        <span className={styles.verb} data-op={field.op}>
                          {field.op}
                        </span>
                        <code title={field.path}>{field.path}</code>
                        <span className={styles.values}>
                          <del title={value(field.before)}>{value(field.before)}</del>
                          <span aria-hidden="true">→</span>
                          <ins title={value(field.after)}>{value(field.after)}</ins>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.unavailable}>No field value changed.</p>
                )}
              </details>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
