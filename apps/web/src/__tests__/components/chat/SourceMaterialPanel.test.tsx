// @vitest-environment jsdom

import type { Pin } from '@t3x-dev/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  type EnrichedPin,
  SourceMaterialPanel,
} from '@/components/chat/SourceMaterialPanel';
import type { Leaf } from '@/types/api';

const launchLeaf = {
  id: 'leaf_launch',
  commit_hash: 'sha256:commit1',
  type: 'article',
  title: 'Launch brief',
  constraints: [],
  config: {},
  output: null,
  generated_at: null,
  assertions: null,
  runner_assertions: null,
  project_id: 'proj_1',
  created_at: '2026-05-01T00:00:00.000Z',
  created_by: null,
} satisfies Leaf;

const launchLeafPin = {
  id: 'pin_leaf_launch',
  project_id: 'proj_1',
  type: 'leaf',
  ref_id: 'leaf_launch',
  pinned_at: '2026-05-01T00:00:00.000Z',
} satisfies Pin;

describe('SourceMaterialPanel', () => {
  it('lets an available project leaf be pinned and included for extraction', async () => {
    const onConfirm = vi.fn();
    const onPinLeaf = vi.fn(async () => launchLeafPin);

    function Harness() {
      const [pins, setPins] = useState<EnrichedPin[]>([]);
      return (
        <SourceMaterialPanel
          pins={pins}
          availableLeaves={[launchLeaf]}
          onPinLeaf={async (leafId) => {
            const pin = await onPinLeaf(leafId);
            setPins([{ ...pin, title: 'Launch brief' }]);
            return pin;
          }}
          onConfirm={onConfirm}
          onCancel={vi.fn()}
        />
      );
    }

    render(<Harness />);

    expect(screen.getByText('Available leaves')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /pin and include leaf launch brief/i }));

    await waitFor(() => {
      expect(onPinLeaf).toHaveBeenCalledWith('leaf_launch');
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /extract with 2 sources/i })).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: /extract with 2 sources/i }));

    expect(onConfirm).toHaveBeenCalledWith(['pin_leaf_launch']);
  });

  it('marks selected pinned sources with an explicit selected label', () => {
    render(
      <SourceMaterialPanel
        pins={[{ ...launchLeafPin, title: 'Launch brief' }]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('Selected')).not.toBeNull();
  });
});
