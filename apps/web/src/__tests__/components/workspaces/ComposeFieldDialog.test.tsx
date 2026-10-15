// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
          operations: [
            { set: { path: 'content/trees/[key=rollout]/slots/allocation', value: 25 } },
          ],
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
          operations: [{ set: { path: 'content/trees/[key=rollout]/slots/"a/b"', value: false } }],
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

  it('keeps manual additions, typed field edits, and YAML on the same staged draft', async () => {
    const activity = draftActivity();
    const onSubmit = vi.fn().mockResolvedValue(true);
    const props = {
      activity,
      initialView: 'structure' as const,
      title: 'Release',
      onClose: vi.fn(),
      onDiscuss: vi.fn(),
      onSubmit,
    };
    const { rerender } = render(<ComposeFieldDialog {...props} current={{ settings: {} }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add inside settings' }));
    expect(screen.getByRole('button', { name: 'YAML', exact: true })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('New name'), { target: { value: 'enabled' } });
    fireEvent.change(screen.getByLabelText('New value'), { target: { value: 'true' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        [{ set: { path: 'settings/enabled', value: true } }],
        'set settings/enabled'
      )
    );
    rerender(<ComposeFieldDialog {...props} current={{ settings: { enabled: true } }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit enabled' }));
    fireEvent.change(screen.getByLabelText('New value'), { target: { value: 'false' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Disable rollout' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save change' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenLastCalledWith(
        [{ set: { path: 'settings/enabled', value: false } }],
        'Disable rollout'
      )
    );
    rerender(<ComposeFieldDialog {...props} current={{ settings: { enabled: false } }} />);
    fireEvent.click(screen.getByRole('button', { name: 'YAML', exact: true }));
    expect(yaml.load(screen.getByLabelText('YAML source').textContent ?? '')).toEqual({
      settings: { enabled: false },
    });
    expect(activity.publish).not.toHaveBeenCalled();
  });

  it('retains array editing, append, delete, and row-menu operations', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(
      <ComposeFieldDialog
        activity={draftActivity()}
        current={{ regions: ['us', 'eu'] }}
        initialView="structure"
        title="Release"
        onClose={vi.fn()}
        onDiscuss={vi.fn()}
        onSubmit={onSubmit}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit regions' }));
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: '["ap"]' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenLastCalledWith(
        [{ set: { path: 'regions', value: ['ap'] } }],
        'set regions'
      )
    );
    const addInsideRegions = screen.getByRole('button', { name: 'Add inside regions' });
    await waitFor(() => expect(addInsideRegions).toBeEnabled());
    fireEvent.click(addInsideRegions);
    fireEvent.change(screen.getByLabelText('New value'), { target: { value: 'ap' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenLastCalledWith(
        [{ append: { path: 'regions', value: 'ap' } }],
        'append regions'
      )
    );
    const deleteFirstRegion = screen.getByRole('button', { name: 'Delete 0' });
    await waitFor(() => expect(deleteFirstRegion).toBeEnabled());
    fireEvent.click(deleteFirstRegion);
    await waitFor(() =>
      expect(onSubmit).toHaveBeenLastCalledWith(
        [{ drop: { path: 'regions/[0]' } }],
        'drop regions/[0]'
      )
    );
    const moreRegionOperations = screen.getByRole('button', {
      name: 'More operations for regions',
    });
    await waitFor(() => expect(moreRegionOperations).toBeEnabled());
    fireEvent.keyDown(moreRegionOperations, {
      key: 'Enter',
    });
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Deduplicate' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sort', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenLastCalledWith(
        [{ sort: { path: 'regions', order: 'asc' } }],
        'sort regions'
      )
    );
  });

  it('shows invalid structured values without discarding the editor', () => {
    const onSubmit = vi.fn();
    render(
      <ComposeFieldDialog
        activity={draftActivity()}
        current={{ regions: [] }}
        initialView="structure"
        title="Release"
        onClose={vi.fn()}
        onDiscuss={vi.fn()}
        onSubmit={onSubmit}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit regions' }));
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: '[invalid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a string, number, boolean, or JSON value'
    );
    expect(screen.getByLabelText('Value')).toHaveValue('[invalid');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('preserves read-only relations in the unified structure', () => {
    render(
      <ComposeFieldDialog
        activity={draftActivity()}
        current={{
          domain: 't3x.dev/semantic-content',
          version: 1,
          content: { trees: [], relations: [{ from: 'a', to: 'b' }] },
        }}
        initialView="structure"
        title="Release"
        onClose={vi.fn()}
        onDiscuss={vi.fn()}
      />
    );
    const row = screen.getByText('relations').closest('[role="treeitem"]')!;
    expect(within(row as HTMLElement).getByText('Read only')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit from' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add inside trees' })).toBeEnabled();
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
    const source = screen.getByLabelText('YAML source');
    expect(yaml.load(source.textContent ?? '')).toEqual(current);
    expect(source.querySelector('script')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Copy YAML' }));
    await waitFor(() => expect(screen.getByText('YAML copied.')).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledWith(source.textContent);
    expect(screen.queryByRole('button', { name: 'Save change' })).not.toBeInTheDocument();
    expect(activity.publish).not.toHaveBeenCalled();
  });
});
