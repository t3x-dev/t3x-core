// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as yaml from 'js-yaml';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(() => vi.unstubAllGlobals());

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

  it('preserves and copies the complete Draft YAML through syntax highlighting without writing it', async () => {
    const activity = draftActivity();
    const current = {
      allocation: 20,
      enabled: false,
      empty: null,
      message: '<script>hello</script>\n第二行: "quoted"\n',
      regions: ['a:b', 'true'],
    };
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(
      <ComposeFieldDialog
        activity={{ ...activity, view: { ...activity.view!, current } }}
        initialView="yaml"
        title="Release"
        onClose={vi.fn()}
        onDiscuss={vi.fn()}
      />
    );
    expect(screen.getByRole('region', { name: 'Current Draft YAML' })).toHaveTextContent(
      'allocation: 20'
    );
    const source = screen.getByRole('region', { name: 'Current Draft YAML' }).querySelector('pre')!;
    expect(yaml.load(source.textContent ?? '')).toEqual(current);
    expect(source.querySelector('script')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Copy YAML' }));
    await waitFor(() => expect(screen.getByText('YAML copied.')).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledWith(source.textContent);
    expect(screen.queryByRole('button', { name: 'Save change' })).not.toBeInTheDocument();
    expect(activity.publish).not.toHaveBeenCalled();
  });
});
