'use client';

import { Building2, Check, Copy } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import styles from './GeneralSettingsPanel.module.css';

type ProjectVisibility = 'public' | 'private';
type ProjectCreator = 'members' | 'admins';

interface GeneralSettings {
  name: string;
  slug: string;
  visibility: ProjectVisibility;
  projectCreator: ProjectCreator;
  logo?: string;
}

const STORAGE_KEY = 't3x-settings-organization-general';
const DEFAULT_SETTINGS: GeneralSettings = {
  name: 'Orbit Labs',
  slug: 'orbit-labs',
  visibility: 'private',
  projectCreator: 'members',
};

export function GeneralSettingsPanel() {
  const [settings, setSettings] = useState<GeneralSettings>(DEFAULT_SETTINGS);
  const [savedSettings, setSavedSettings] = useState<GeneralSettings>(DEFAULT_SETTINGS);
  const [copied, setCopied] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as Partial<GeneralSettings>;
      const restored = { ...DEFAULT_SETTINGS, ...parsed };
      setSettings(restored);
      setSavedSettings(restored);
    } catch {
      // Keep stable defaults when browser storage cannot be read.
    }
  }, []);

  const canonicalUrl = `https://t3x.ai/${settings.slug || DEFAULT_SETTINGS.slug}`;
  const dirty = JSON.stringify(settings) !== JSON.stringify(savedSettings);

  function update<K extends keyof GeneralSettings>(key: K, value: GeneralSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function handleLogoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') update('logo', reader.result);
    });
    reader.readAsDataURL(file);
  }

  function saveChanges() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setSavedSettings(settings);
    toast.success('Organization settings saved');
  }

  async function copyCanonicalUrl() {
    try {
      await navigator.clipboard.writeText(canonicalUrl);
      setCopied(true);
      toast.success('Canonical URL copied');
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      toast.error('Could not copy the canonical URL.');
    }
  }

  return (
    <div className={styles.page}>
      <link
        href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css"
        rel="stylesheet"
      />
      <div className={styles.inner}>
        <nav aria-label="Breadcrumb" className={styles.breadcrumbs}>
          <Link href="/settings">Settings</Link>
          <span>/</span>
          <Link href="/settings">orbit-labs</Link>
          <span>/</span>
          <strong>General</strong>
        </nav>

        <header className={styles.titleRow}>
          <h1>General</h1>
          <span className={styles.organizationBadge}>
            <Building2 aria-hidden="true" size={16} strokeWidth={2.25} />
            Organization
          </span>
        </header>

        <section aria-label="Organization settings" className={styles.settingsCard}>
          <div className={styles.formRows}>
            <div className={styles.formRow}>
              <label htmlFor="organization-name">Organization name</label>
              <div className={styles.controlGroup}>
                <input
                  id="organization-name"
                  onChange={(event) => update('name', event.target.value)}
                  value={settings.name}
                />
                <p>This is the name that will be displayed across T3X.</p>
              </div>
            </div>

            <div className={styles.formRow}>
              <label htmlFor="organization-slug">Organization slug</label>
              <div className={styles.controlGroup}>
                <input
                  id="organization-slug"
                  onChange={(event) =>
                    update('slug', event.target.value.toLowerCase().replace(/[^a-z0-9-]/gu, ''))
                  }
                  value={settings.slug}
                />
                <p>Used in URLs. Lowercase letters, numbers, and hyphens only.</p>
              </div>
            </div>

            <div className={`${styles.formRow} ${styles.logoRow}`}>
              <span className={styles.fieldLabel}>Organization logo</span>
              <div className={styles.logoControl}>
                <span className={styles.logoPreview}>
                  {settings.logo ? (
                    <Image
                      alt="Orbit Labs organization logo"
                      height={74}
                      src={settings.logo}
                      unoptimized
                      width={74}
                    />
                  ) : (
                    <i aria-hidden="true" className="ph ph-planet" />
                  )}
                </span>
                <div>
                  <input
                    ref={logoInput}
                    accept="image/*"
                    className={styles.hiddenInput}
                    onChange={handleLogoChange}
                    type="file"
                  />
                  <button
                    className={styles.changeLogoButton}
                    onClick={() => logoInput.current?.click()}
                    type="button"
                  >
                    Change logo
                  </button>
                </div>
                <p>A square image works best. Recommended size is 256 × 256.</p>
              </div>
            </div>

            <div className={styles.formRow}>
              <span className={styles.fieldLabel}>Default project visibility</span>
              <div className={styles.controlGroup}>
                <fieldset className={styles.segmented}>
                  <legend className="sr-only">Default project visibility</legend>
                  {(['public', 'private'] as const).map((visibility) => (
                    <button
                      aria-pressed={settings.visibility === visibility}
                      className={settings.visibility === visibility ? styles.segmentActive : ''}
                      key={visibility}
                      onClick={() => update('visibility', visibility)}
                      type="button"
                    >
                      {visibility[0]?.toUpperCase()}
                      {visibility.slice(1)}
                    </button>
                  ))}
                </fieldset>
                <p>New projects in this organization will be private by default.</p>
              </div>
            </div>

            <div className={styles.formRow}>
              <label htmlFor="project-creation">Project creation</label>
              <div className={styles.controlGroup}>
                <select
                  id="project-creation"
                  onChange={(event) =>
                    update('projectCreator', event.target.value as ProjectCreator)
                  }
                  value={settings.projectCreator}
                >
                  <option value="members">Members</option>
                  <option value="admins">Organization admins</option>
                </select>
                <p>Who can create new projects in this organization.</p>
              </div>
            </div>
          </div>

          <div className={styles.actions}>
            <button disabled={!dirty} onClick={saveChanges} type="button">
              Save changes
            </button>
          </div>
        </section>

        <section aria-labelledby="organization-urls-title" className={styles.urlsCard}>
          <h2 id="organization-urls-title">Organization URLs</h2>
          <div className={styles.formRow}>
            <label htmlFor="canonical-url">Canonical URL</label>
            <div className={styles.controlGroup}>
              <div className={styles.copyField}>
                <input id="canonical-url" readOnly value={canonicalUrl} />
                <button aria-label="Copy canonical URL" onClick={copyCanonicalUrl} type="button">
                  {copied ? (
                    <Check aria-hidden="true" size={17} />
                  ) : (
                    <Copy aria-hidden="true" size={17} />
                  )}
                </button>
              </div>
              <p>Share this URL to link to your organization.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
