import { AccessSettingsPanel } from '@/components/settings/AccessSettingsPanel';
import { NamespaceCollaborationPanel } from '@/components/settings/NamespaceCollaborationPanel';
import styles from '../SettingsPage.module.css';

export default function AccessPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Access</h1>
        <p>Manage workspace members, invitations, API keys, and local client access.</p>
      </header>
      <div className={styles.content}>
        <NamespaceCollaborationPanel />
        <div className={styles.notice}>
          Environment variables override the shared file, so this page shows the effective state
          before you save.
        </div>
        <AccessSettingsPanel />
      </div>
    </div>
  );
}
