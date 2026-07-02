// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectStateTab } from '@/components/project/ProjectStateTab';
import type { YSchemaValidationSummary } from '@/domain/project/yschemaValidation';

describe('ProjectStateTab', () => {
  it('provides a full-height flex column so the canvas can grow', () => {
    render(
      <ProjectStateTab>
        <div data-testid="state-canvas-child" />
      </ProjectStateTab>
    );

    const section = screen.getByTestId('state-canvas-child').closest('section');
    const canvasRegion = screen.getByTestId('state-canvas-child').parentElement;

    expect(section).toHaveClass(
      'relative',
      'flex',
      'h-full',
      'min-h-0',
      'flex-col',
      'overflow-hidden'
    );
    expect(canvasRegion).toHaveClass('flex', 'min-h-0', 'flex-1', 'flex-col');
  });

  it('shows the current commit YSchema gate inside State next to the canvas', () => {
    const onRunValidation = vi.fn();
    const validation: YSchemaValidationSummary = {
      checkedAt: '2026-07-02T00:00:01.000Z',
      commitHash: 'sha256:5fbfafd8fa2fec3e',
      errorCount: 0,
      fixCount: 2,
      gapCount: 2,
      gaps: [
        {
          code: 'REQUIRED_NODE_MISSING',
          label: 'Missing required node',
          message: 'summary is required before commit.',
          path: 'summary',
        },
        {
          code: 'REQUIRED_NODE_MISSING',
          label: 'Missing required node',
          message: 'requirements is required before commit.',
          path: 'requirements',
        },
      ],
      ready: false,
      runId: 'ysvr_failed',
      schemaName: 't3x/prd',
      status: 'failed',
      valid: true,
    };

    render(
      <ProjectStateTab onRunValidation={onRunValidation} validation={validation}>
        <div data-testid="state-canvas-child" />
      </ProjectStateTab>
    );

    expect(screen.getByTestId('state-canvas-child')).toBeInTheDocument();
    expect(screen.getByText('State status')).toBeInTheDocument();
    expect(screen.getByText('YSchema failed · 2 gaps')).toBeInTheDocument();
    expect(screen.getByText('Schema t3x/prd')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2 validation gaps' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.queryByText('summary is required before commit.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '2 validation gaps' }));

    expect(screen.getByRole('button', { name: '2 validation gaps' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByText('summary is required before commit.')).toBeInTheDocument();
    expect(screen.getByText('requirements is required before commit.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Run validation' }));

    expect(onRunValidation).toHaveBeenCalledTimes(1);
  });
});
