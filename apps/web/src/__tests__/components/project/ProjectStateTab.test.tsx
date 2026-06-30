// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectStateTab } from '@/components/project/ProjectStateTab';

describe('ProjectStateTab', () => {
  it('provides a full-height flex column so the canvas can grow', () => {
    render(
      <ProjectStateTab>
        <div data-testid="state-canvas-child" />
      </ProjectStateTab>
    );

    const section = screen.getByTestId('state-canvas-child').parentElement;

    expect(section).toHaveClass(
      'relative',
      'flex',
      'h-full',
      'min-h-0',
      'flex-col',
      'overflow-hidden'
    );
  });
});
