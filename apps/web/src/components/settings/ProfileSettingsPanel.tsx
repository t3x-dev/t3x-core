'use client';

import {
  Camera,
  Columns3,
  Download,
  Hand,
  Laptop,
  Loader2,
  Monitor,
  Smartphone,
  UserRound,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { formatUserFacingError } from '@/domain/format/errors';
import {
  type ProfileSession,
  type ProfileSettings,
  useProfileSettings,
} from '@/hooks/settings/useProfileSettings';
import { resolveLocalWorkspaceName, useSettingsStore } from '@/store/settingsStore';
import styles from './ProfileSettingsPanel.module.css';

const TIMEZONES = [
  ['America/Los_Angeles', '(GMT-08:00) Pacific Time (US & Canada)'],
  ['America/New_York', '(GMT-05:00) Eastern Time (US & Canada)'],
  ['Europe/London', '(GMT+00:00) London'],
  ['UTC', '(GMT+00:00) Coordinated Universal Time'],
  ['Asia/Shanghai', '(GMT+08:00) China Standard Time'],
  ['Asia/Tokyo', '(GMT+09:00) Japan Standard Time'],
] as const;

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'U'
  );
}

function relativeTime(value: string | null): string {
  if (!value) return 'Not recorded';
  const elapsed = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return 'Just now';
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function sessionPresentation(session: ProfileSession, index: number) {
  if (session.current) return { title: 'Current browser', detail: 'Active session', Icon: Laptop };
  return {
    title: 'Signed-in browser',
    detail: 'Session credential',
    Icon: index % 2 === 0 ? Smartphone : Monitor,
  };
}

export function ProfileSettingsPanel() {
  const authDisabled = process.env.NEXT_PUBLIC_AUTH_DISABLED?.toLowerCase() === 'true';
  const localWorkspaceName = useSettingsStore((state) => state.localWorkspaceName);
  const setLocalWorkspaceName = useSettingsStore((state) => state.setLocalWorkspaceName);
  const { data, loading, saving, error, retry, save, revoke } = useProfileSettings(!authDisabled);
  const [draft, setDraft] = useState<ProfileSettings | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (authDisabled) {
      setDraft({
        name: resolveLocalWorkspaceName(localWorkspaceName),
        email: null,
        avatar_url: null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        sessions: [
          {
            id: 'local-current-session',
            name: 'Local browser',
            current: true,
            last_active: new Date().toISOString(),
          },
        ],
      });
      return;
    }
    setDraft(data);
  }, [authDisabled, data, localWorkspaceName]);

  async function saveChanges() {
    if (!draft) return;
    if (authDisabled) {
      const name = resolveLocalWorkspaceName(draft.name);
      setLocalWorkspaceName(name);
      setDraft({ ...draft, name });
      toast.success('Profile saved');
      return;
    }
    try {
      await save({
        name: draft.name?.trim() || 'User',
        avatar_url: draft.avatar_url,
        timezone: draft.timezone,
      });
      toast.success('Profile saved');
    } catch (cause) {
      toast.error(formatUserFacingError(cause, 'Failed to save profile.'));
    }
  }

  function chooseAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !draft) return;
    const reader = new FileReader();
    reader.onload = () =>
      setDraft((current) =>
        current ? { ...current, avatar_url: String(reader.result) } : current
      );
    reader.readAsDataURL(file);
    event.target.value = '';
  }

  async function signOutSession(id: string) {
    try {
      await revoke(id);
      toast.success('Session signed out');
    } catch (cause) {
      toast.error(formatUserFacingError(cause, 'Failed to sign out session.'));
    }
  }

  const displayName = draft?.name?.trim() || 'User';

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link href="/settings">Settings</Link>
          <span>/</span>
          <span>Personal</span>
          <span>/</span>
          <strong>Profile</strong>
        </nav>
        <div className={styles.titleGroup}>
          <h1>Profile</h1>
          <span>
            <UserRound size={15} />
            Personal
          </span>
        </div>

        {loading ? (
          <div className={styles.loading}>
            <Loader2 size={22} className={styles.spin} />
            Loading profile
          </div>
        ) : null}
        {error && !draft ? (
          <div className={styles.error} role="alert">
            <span>{formatUserFacingError(error, 'Failed to load profile.')}</span>
            <button type="button" onClick={() => void retry()}>
              Retry
            </button>
          </div>
        ) : null}

        {draft ? (
          <>
            <section className={styles.identityCard}>
              <div className={styles.avatar}>
                {draft.avatar_url ? (
                  <Image src={draft.avatar_url} alt="" width={70} height={70} unoptimized />
                ) : (
                  initials(displayName)
                )}
              </div>
              <div className={styles.identityText}>
                <h2>{displayName}</h2>
                <p>{draft.email || 'No email address'}</p>
              </div>
              <input
                ref={fileInputRef}
                className={styles.fileInput}
                type="file"
                accept="image/*"
                onChange={chooseAvatar}
              />
              <button
                type="button"
                className={styles.editAvatar}
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera size={17} />
                Edit avatar
              </button>
            </section>

            <section className={styles.detailsCard}>
              <h2>Personal details</h2>
              <div className={styles.formGrid}>
                <label>
                  <span>Display name</span>
                  <input
                    value={draft.name ?? ''}
                    onChange={(event) => {
                      setDraft({ ...draft, name: event.target.value });
                      if (authDisabled) setLocalWorkspaceName(event.target.value);
                    }}
                    onBlur={(event) => {
                      if (!authDisabled) return;
                      const name = resolveLocalWorkspaceName(event.target.value);
                      setLocalWorkspaceName(name);
                      setDraft({ ...draft, name });
                    }}
                  />
                </label>
                <label>
                  <span>Email</span>
                  <input value={draft.email ?? ''} disabled />
                </label>
                <label className={styles.timezoneField}>
                  <span>Time zone</span>
                  <select
                    value={draft.timezone}
                    onChange={(event) => setDraft({ ...draft, timezone: event.target.value })}
                  >
                    {!TIMEZONES.some(([value]) => value === draft.timezone) ? (
                      <option value={draft.timezone}>{draft.timezone}</option>
                    ) : null}
                    {TIMEZONES.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className={styles.saveButton}
                  disabled={saving || !draft.name?.trim()}
                  onClick={() => void saveChanges()}
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </section>

            <section className={styles.sessionsCard}>
              <h2>Sessions</h2>
              <div className={styles.sessionHeader}>
                <span>Device</span>
                <span>Location</span>
                <span>Last active</span>
                <span />
              </div>
              {draft.sessions.length ? (
                draft.sessions.map((session, index) => {
                  const item = sessionPresentation(session, index);
                  return (
                    <div className={styles.sessionRow} key={session.id}>
                      <div className={styles.deviceCell}>
                        <item.Icon size={20} />
                        <div>
                          <strong>{item.title}</strong>
                          <span>{item.detail}</span>
                        </div>
                      </div>
                      <div className={styles.location}>
                        <span>—</span>
                        {session.current ? (
                          <span className={styles.current}>
                            <i />
                            Current
                          </span>
                        ) : null}
                      </div>
                      <span className={styles.activity}>{relativeTime(session.last_active)}</span>
                      {session.current ? (
                        <span />
                      ) : (
                        <button type="button" onClick={() => void signOutSession(session.id)}>
                          Sign out
                        </button>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className={styles.emptySessions}>
                  {authDisabled
                    ? 'Local mode does not create account sessions.'
                    : 'No active sessions were found.'}
                </div>
              )}
            </section>
          </>
        ) : null}
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
