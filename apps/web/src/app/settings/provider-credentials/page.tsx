import { ProviderSettingsCapabilityGate } from '@/components/settings/ProviderSettingsCapabilityGate';
import styles from '../SettingsPage.module.css';

export default function ProviderCredentialsPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Provider credentials</h1>
        <p>
          Deployment operators manage shared AI credentials here. Database credentials take priority
          over environment configuration.
        </p>
      </header>
      <ProviderSettingsCapabilityGate />
    </div>
  );
}
