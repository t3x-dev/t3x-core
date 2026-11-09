'use client';

import { Building2, Check, Copy } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSettingsNamespace } from '@/hooks/settings/useSettingsNamespace';
import styles from './GeneralSettingsPanel.module.css';
import { NamespaceSettingsRecovery } from './NamespaceSettingsRecovery';

export function GeneralSettingsPanel() {
  const context = useSettingsNamespace();
  const [copied, setCopied] = useState(false);
  const namespace = context.account?.namespace;
  const namespacePath = namespace ? `/${encodeURIComponent(namespace.slug)}` : '';

  async function copyNamespaceUrl() {
    if (!namespacePath) return;
    try {
      await navigator.clipboard.writeText(
        new URL(namespacePath, window.location.origin).toString()
      );
      setCopied(true);
      toast.success('Namespace URL copied');
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      toast.error('Could not copy the namespace URL.');
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <nav aria-label="Breadcrumb" className={styles.breadcrumbs}>
          <Link href={context.generalHref}>Settings</Link>
          <span>/</span>
          <strong>General</strong>
        </nav>
        <header className={styles.titleRow}>
          <h1>General</h1>
          {namespace && (
            <span className={styles.organizationBadge}>
              <Building2 aria-hidden="true" size={16} strokeWidth={2.25} />
              {namespace.kind === 'personal' ? 'Personal namespace' : 'Organization'}
            </span>
          )}
        </header>

        {!namespace && <NamespaceSettingsRecovery context={context} />}
        {namespace ? (
          <>
            <p>
              These details come from your namespace account. Editing organization policy is not
              supported here yet.
            </p>
            <section aria-label="Organization settings" className={styles.settingsCard}>
              <div className={styles.formRows}>
                <div className={styles.formRow}>
                  <label htmlFor="organization-name">Namespace name</label>
                  <div className={styles.controlGroup}>
                    <input id="organization-name" readOnly value={namespace.display_name} />
                    <p>Read from the active namespace.</p>
                  </div>
                </div>
                <div className={styles.formRow}>
                  <label htmlFor="organization-slug">Namespace slug</label>
                  <div className={styles.controlGroup}>
                    <input id="organization-slug" readOnly value={namespace.slug} />
                    <p>Used in project URLs. Changing it is not supported here.</p>
                  </div>
                </div>
              </div>
            </section>
            <section aria-labelledby="organization-urls-title" className={styles.urlsCard}>
              <h2 id="organization-urls-title">Namespace URL</h2>
              <div className={styles.formRow}>
                <label htmlFor="canonical-url">Path</label>
                <div className={styles.controlGroup}>
                  <div className={styles.copyField}>
                    <input id="canonical-url" readOnly value={namespacePath} />
                    <button
                      aria-label="Copy namespace URL"
                      onClick={copyNamespaceUrl}
                      type="button"
                    >
                      {copied ? (
                        <Check aria-hidden="true" size={17} />
                      ) : (
                        <Copy aria-hidden="true" size={17} />
                      )}
                    </button>
                  </div>
                  <p>Copy a link on this server to the namespace directory.</p>
                </div>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
