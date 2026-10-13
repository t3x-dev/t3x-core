// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OrganizationSettingsPage } from '@/components/project/OrganizationSettingsPage';

const { redirect } = vi.hoisted(() => ({ redirect: vi.fn() }));

vi.mock('next/navigation', () => ({ redirect }));

describe('OrganizationSettingsPage', () => {
  it('redirects organization settings to the canonical provider credentials page', () => {
    render(<OrganizationSettingsPage ownerSlug="t3x-dev" />);

    expect(redirect).toHaveBeenCalledExactlyOnceWith(
      '/settings/provider-credentials?owner=t3x-dev'
    );
  });
});
