import { ProfileSettingsPanel } from '@/components/settings/ProfileSettingsPanel';

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-2xl px-8 py-8">
      <h1 className="text-xl font-semibold text-[var(--text-primary)]">Profile</h1>
      <p className="mt-1 mb-8 text-sm text-[var(--text-secondary)]">
        Set the local identity used in the sidebar and edit history.
      </p>
      <ProfileSettingsPanel />
    </div>
  );
}
