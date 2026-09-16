'use client';

import { Columns3, Download, Hand, UserRound, ZoomIn, ZoomOut } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { type AccentColor, type Density, useSettingsStore } from '@/store/settingsStore';
import styles from './PreferencesSettingsPanel.module.css';

type ThemeChoice = 'light' | 'system' | 'dark';

const THEMES: Array<{ value: ThemeChoice; label: string; preview: string }> = [
  { value: 'light', label: 'Light', preview: '/settings/appearance/theme-light.png' },
  { value: 'system', label: 'System', preview: '/settings/appearance/theme-system.png' },
  { value: 'dark', label: 'Dark', preview: '/settings/appearance/theme-dark.png' },
];

const DENSITIES: Array<{ value: Density; label: string; preview: string }> = [
  {
    value: 'comfortable',
    label: 'Comfortable',
    preview: '/settings/appearance/density-comfortable.png',
  },
  {
    value: 'compact',
    label: 'Compact',
    preview: '/settings/appearance/density-compact.png',
  },
];

const ACCENTS: Array<{ value: AccentColor; label: string }> = [
  { value: 'blue', label: 'Blue' },
  { value: 'purple', label: 'Purple' },
  { value: 'teal', label: 'Teal' },
];

export function PreferencesSettingsPanel() {
  const { theme, setTheme } = useTheme();
  const density = useSettingsStore((state) => state.density);
  const accentColor = useSettingsStore((state) => state.accentColor);
  const reducedMotion = useSettingsStore((state) => state.reducedMotion);
  const setDensity = useSettingsStore((state) => state.setDensity);
  const setAccentColor = useSettingsStore((state) => state.setAccentColor);
  const setReducedMotion = useSettingsStore((state) => state.setReducedMotion);
  const [mounted, setMounted] = useState(false);
  const [draftTheme, setDraftTheme] = useState<ThemeChoice>('system');
  const [draftDensity, setDraftDensity] = useState<Density>(density);
  const [draftAccent, setDraftAccent] = useState<AccentColor>(accentColor);
  const [draftReducedMotion, setDraftReducedMotion] = useState(reducedMotion);

  useEffect(() => {
    setMounted(true);
    if (theme === 'light' || theme === 'dark' || theme === 'system') setDraftTheme(theme);
  }, [theme]);

  useEffect(() => {
    setDraftDensity(density);
    setDraftAccent(accentColor);
    setDraftReducedMotion(reducedMotion);
  }, [accentColor, density, reducedMotion]);

  function saveChanges() {
    setTheme(draftTheme);
    setDensity(draftDensity);
    setAccentColor(draftAccent);
    setReducedMotion(draftReducedMotion);
    toast.success('Appearance settings saved');
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link href="/settings">Settings</Link>
          <span>/</span>
          <span>Personal</span>
          <span>/</span>
          <strong>Appearance</strong>
        </nav>
        <div className={styles.titleGroup}>
          <h1>Appearance</h1>
          <span>
            <UserRound size={15} />
            Personal
          </span>
        </div>

        <div className={styles.settingsGrid}>
          <section className={styles.themeCard}>
            <h2>Theme</h2>
            <div className={styles.themeOptions}>
              {THEMES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={mounted && draftTheme === option.value}
                  className={styles.previewOption}
                  onClick={() => setDraftTheme(option.value)}
                >
                  <Image src={option.preview} alt="" width={82} height={62} unoptimized />
                  <strong>{option.label}</strong>
                  <i />
                </button>
              ))}
            </div>
          </section>

          <section className={styles.densityCard}>
            <h2>Density</h2>
            <div className={styles.densityOptions}>
              {DENSITIES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={draftDensity === option.value}
                  className={styles.previewOption}
                  onClick={() => setDraftDensity(option.value)}
                >
                  <Image src={option.preview} alt="" width={106} height={66} unoptimized />
                  <strong>{option.label}</strong>
                  <i />
                </button>
              ))}
            </div>
          </section>

          <section className={styles.accentCard}>
            <h2>Accent color</h2>
            <div className={styles.accentOptions}>
              {ACCENTS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={draftAccent === option.value}
                  className={styles.accentOption}
                  onClick={() => setDraftAccent(option.value)}
                >
                  <i data-color={option.value} />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className={styles.motionCard}>
            <h2>Reduced motion</h2>
            <div className={styles.motionRow}>
              <span>Reduced motion</span>
              <button
                type="button"
                className={styles.switch}
                role="switch"
                aria-label="Reduced motion"
                aria-checked={draftReducedMotion}
                onClick={() => setDraftReducedMotion((value) => !value)}
              >
                <i />
              </button>
            </div>
          </section>
        </div>

        <div className={styles.saveRow}>
          <button type="button" onClick={saveChanges}>
            Save changes
          </button>
        </div>
      </div>

      <div className={styles.prototypeTools} aria-label="View tools" role="toolbar">
        <button type="button" title="Zoom Out">
          <ZoomOut size={20} />
        </button>
        <button type="button" title="Zoom In">
          <ZoomIn size={20} />
        </button>
        <i />
        <button type="button" title="Pan Tool">
          <Hand size={20} />
        </button>
        <button type="button" title="Fit to Screen">
          <Columns3 size={20} />
        </button>
        <button type="button" title="Download">
          <Download size={20} />
        </button>
      </div>
    </div>
  );
}
