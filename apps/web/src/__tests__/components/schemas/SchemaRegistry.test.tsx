// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SchemaRegistry } from '@/components/schemas';
import { getSchemaReleasePreviews } from '@/data/schemaReleases';

describe('SchemaRegistry', () => {
  it('shows schema families and release groups with text status labels', () => {
    render(<SchemaRegistry releases={getSchemaReleasePreviews('proj_test')} />);

    expect(screen.getByText('Schema registry')).toBeInTheDocument();
    expect(screen.getByText('Schema families')).toBeInTheDocument();
    expect(screen.getByText('Active PRD Schema v2')).toBeInTheDocument();
    expect(screen.getAllByText('Draft').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
  });

  it('shows immutable release detail actions without direct edit affordances', () => {
    render(<SchemaRegistry releases={getSchemaReleasePreviews('proj_test')} />);

    expect(screen.getByText('Published version is immutable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create draft from active' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set as project default' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deprecate version' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View impact' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
  });

  it('switches release detail when another family is selected', () => {
    render(<SchemaRegistry releases={getSchemaReleasePreviews('proj_test')} />);

    fireEvent.click(screen.getByRole('button', { name: /Release Note Schema/i }));

    expect(screen.getAllByText('Release Note Schema v1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Deprecated').length).toBeGreaterThan(0);
    expect(screen.getByText('breaking change')).toBeInTheDocument();
    expect(screen.getByText('No active release')).toBeInTheDocument();
  });
});
