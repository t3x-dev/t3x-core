// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const detailProps = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));

vi.mock('@/app/project/[projectId]/page', () => ({
  ProjectDetailPageContent: (props: Record<string, unknown>) => {
    detailProps.current = props;
    return <div data-testid="project-detail-content" />;
  },
}));

import ChatProjectCanvasPage from '@/app/chat/project/[projectId]/canvas/page';

describe('ChatProjectCanvasPage', () => {
  it('selects the independent Canvas surface', () => {
    render(<ChatProjectCanvasPage />);

    expect(screen.getByTestId('project-detail-content')).toBeInTheDocument();
    expect(detailProps.current).toMatchObject({
      showChatSidebarToggle: true,
      surface: 'canvas',
    });
  });
});
