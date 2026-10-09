// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ComposeFieldDialog } from '@/components/workspaces/ComposeFieldDialog';
import type { useComposeActivity } from '@/hooks/workspaces/useComposeActivity';

function draftActivity() {
  return {
    compositionRevision: 4,
    notice: null,
    publish: vi.fn().mockResolvedValue({ kind: 'published' }),
    view: {
      current: {
        domain: 't3x.dev/semantic-content',
        version: 1,
        content: {
          trees: [{ key: 'rollout', slots: { allocation: 20, 'a/b': true }, children: [] }],
          relations: [],
        },
      },
    },
  } as unknown as ReturnType<typeof useComposeActivity>;
}

describe('Compose field editing', () => {
  it('requires a reason and publishes a typed change through the existing Draft action', async () => {
    const activity = draftActivity();
    render(
      <ComposeFieldDialog
        activity={activity}
        initialView="structure"
        title="Release"
        onClose={vi.fn()}
        onDiscuss={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: 'Edit domain' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit allocation' }));
    fireEvent.change(screen.getByLabelText('New value'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save change' }));
    expect(activity.publish).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Explain why');
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'Raise canary allocation' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save change' }));
    await waitFor(() =>
      expect(activity.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          operations: [{ set: { path: 'content/trees/[0]/slots/allocation', value: 25 } }],
          reason: 'Raise canary allocation',
        })
      )
    );
  });

  it('quotes literal path separators and preserves boolean values', async () => {
    const activity = draftActivity();
    render(
      <ComposeFieldDialog
        activity={activity}
        initialView="structure"
        title="Release"
        onClose={vi.fn()}
        onDiscuss={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit a/b' }));
    fireEvent.change(screen.getByLabelText('New value'), { target: { value: 'false' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Disable flag' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save change' }));
    await waitFor(() =>
      expect(activity.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          operations: [{ set: { path: 'content/trees/[0]/slots/"a/b"', value: false } }],
        })
      )
    );
  });

  it('blocks stale field edits when another action changes the draft revision', () => {
    const activity = draftActivity();
    const props = {
      initialView: 'structure' as const,
      title: 'Release',
      onClose: vi.fn(),
      onDiscuss: vi.fn(),
    };
    const { rerender } = render(<ComposeFieldDialog activity={activity} {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit allocation' }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Raise allocation' } });
    rerender(<ComposeFieldDialog activity={{ ...activity, compositionRevision: 5 }} {...props} />);
    expect(screen.getByRole('button', { name: 'Save change' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('The draft changed');
    expect(activity.publish).not.toHaveBeenCalled();
  });

  it('opens a read-only YAML view of the real draft without writing it', () => {
    const activity = draftActivity();
    render(
      <ComposeFieldDialog
        activity={activity}
        initialView="yaml"
        title="Release"
        onClose={vi.fn()}
        onDiscuss={vi.fn()}
      />
    );
    expect(screen.getByRole('region', { name: 'Current Draft YAML' })).toHaveTextContent(
      'allocation: 20'
    );
    expect(screen.queryByRole('button', { name: 'Save change' })).not.toBeInTheDocument();
    expect(activity.publish).not.toHaveBeenCalled();
  });
});
