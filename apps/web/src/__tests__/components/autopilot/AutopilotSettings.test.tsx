// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { AutopilotSettings } from '@/components/autopilot/AutopilotSettings';
import {
  getAdaptiveThreshold,
  getAutopilotConfig,
  updateAutopilotConfig,
} from '@/infrastructure/autopilot';

vi.mock('@/infrastructure/autopilot', () => ({
  getAdaptiveThreshold: vi.fn(),
  getAutopilotConfig: vi.fn(),
  updateAutopilotConfig: vi.fn(),
}));

beforeEach(() => vi.resetAllMocks());

it('shows project suggestions without reading or editing inactive automation settings', async () => {
  vi.mocked(getAdaptiveThreshold).mockResolvedValue({
    adaptive: { cosineThresholdDelta: -0.02, suppressedTypes: ['inference-type'] },
    stats: { total: 24 },
  });
  render(<AutopilotSettings projectId="project-a" />);

  expect(await screen.findByText('Based on 24 feedback actions')).toBeInTheDocument();
  expect(screen.getByText('-0.020')).toBeInTheDocument();
  expect(screen.getByText('inference-type')).toBeInTheDocument();
  expect(getAdaptiveThreshold).toHaveBeenCalledWith('project-a');
  expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Apply Suggestions' })).not.toBeInTheDocument();
  expect(getAutopilotConfig).not.toHaveBeenCalled();
  expect(updateAutopilotConfig).not.toHaveBeenCalled();
});

it('distinguishes a failed read from insufficient feedback and can retry', async () => {
  vi.mocked(getAdaptiveThreshold)
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockResolvedValueOnce({ adaptive: null });
  render(<AutopilotSettings projectId="project-b" />);

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not load threshold suggestions.'
  );
  fireEvent.click(screen.getByRole('button', { name: 'Retry suggestions' }));
  expect(await screen.findByText(/More extraction feedback is needed/)).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
