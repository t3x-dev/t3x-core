export const PROVIDER_CREDENTIALS_UPDATED_EVENT = 't3x-provider-credentials-updated';

export function dispatchProviderCredentialsUpdatedEvent() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(PROVIDER_CREDENTIALS_UPDATED_EVENT));
}
