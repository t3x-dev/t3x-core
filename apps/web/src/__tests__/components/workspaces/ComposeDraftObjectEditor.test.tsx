// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ComposeDraftObjectEditor } from '@/components/workspaces/ComposeDraftObjectEditor';
import type { useComposeActivity } from '@/hooks/workspaces/useComposeActivity';

function fixture() {
  return {
    activity: {
      compositionRevision: 2,
      workspaceRevision: 3,
      publish: vi.fn(),
    } as unknown as ReturnType<typeof useComposeActivity>,
    path: 'tasks/[key=flight]',
    slots: {
      goal: '开飞机的任务',
      done: true,
      count: 2,
      text: 'true',
      config: { mode: 'pilot' },
      nullable: null,
    },
    onCancel: vi.fn(),
    onSaved: vi.fn(),
    onBusyChange: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(true),
  };
}

function changeGoal() {
  fireEvent.change(screen.getByLabelText('goal'), { target: { value: '学习开飞机' } });
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Adjust weekly goal' } });
}

describe('Compose object value editor', () => {
  it('offers existing slots only, previews changed fields, and stages typed operations', async () => {
    const props = fixture();
    render(<ComposeDraftObjectEditor {...props} />);
    expect(screen.getByRole('heading', { name: 'Edit current value' })).toBeVisible();
    expect(screen.getByLabelText('goal')).toHaveValue('开飞机的任务');
    expect(screen.getByLabelText('done')).toHaveValue('true');
    expect(screen.getByLabelText('count')).toHaveAttribute('type', 'number');
    expect(screen.getByLabelText('text')).toHaveAttribute('type', 'text');
    expect(screen.queryByLabelText('key')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('children')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove|Add/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save change' })).toBeDisabled();
    changeGoal();
    fireEvent.change(screen.getByLabelText('done'), { target: { value: 'false' } });
    const preview = screen.getByRole('region', { name: 'Preview current to proposed' });
    expect(within(preview).getByText('goal')).toBeVisible();
    expect(within(preview).getByText('done')).toBeVisible();
    expect(within(preview).queryByText('count')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save change' }));
    await waitFor(() => expect(props.onSaved).toHaveBeenCalled());
    expect(props.onSubmit).toHaveBeenCalledExactlyOnceWith(
      [
        { set: { path: `${props.path}/slots/goal`, value: '学习开飞机' } },
        { set: { path: `${props.path}/slots/done`, value: false } },
      ],
      'Adjust weekly goal'
    );
    expect(props.activity.publish).not.toHaveBeenCalled();
  });

  it('uses a text area for long existing text and preserves line breaks', async () => {
    const props = fixture();
    const text = 'Long requirement. '.repeat(10);
    render(<ComposeDraftObjectEditor {...props} slots={{ acceptance: text }} />);
    expect(screen.getByLabelText('acceptance').tagName).toBe('TEXTAREA');
    fireEvent.change(screen.getByLabelText('acceptance'), {
      target: { value: 'First step\nSecond step' },
    });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Clarify steps' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save change' }));
    await waitFor(() =>
      expect(props.onSubmit).toHaveBeenCalledExactlyOnceWith(
        [{ set: { path: `${props.path}/slots/acceptance`, value: 'First step\nSecond step' } }],
        'Clarify steps'
      )
    );
  });

  it('requires a reason, reports invalid JSON, and keeps the form open after a failed staging request', async () => {
    const props = fixture();
    props.onSubmit.mockRejectedValue(new Error('Draft changed; try again'));
    render(<ComposeDraftObjectEditor {...props} />);
    fireEvent.change(screen.getByLabelText('goal'), { target: { value: 'Learn' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save change' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Explain why');
    expect(props.onSubmit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('config'), { target: { value: '{' } });
    expect(screen.getByLabelText('config')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Save change' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('config'), { target: { value: '{"mode":"pilot"}' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Learn first' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save change' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Draft changed; try again')
    );
    expect(screen.getByLabelText('goal')).toHaveValue('Learn');
    expect(props.onSaved).not.toHaveBeenCalled();
    expect(props.onBusyChange).toHaveBeenLastCalledWith(false);
  });

  it.each(['revision', 'slots'] as const)('blocks stale edits when %s changes', (kind) => {
    const props = fixture();
    const { rerender } = render(<ComposeDraftObjectEditor {...props} />);
    changeGoal();
    rerender(
      <ComposeDraftObjectEditor
        {...props}
        {...(kind === 'revision'
          ? { activity: { ...props.activity, compositionRevision: 3 } }
          : { slots: { ...props.slots, done: false } })}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Cancel and reopen');
    expect(screen.getByRole('button', { name: 'Save change' })).toBeDisabled();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('prevents duplicate submissions and preserves the values when staging returns false', async () => {
    const props = fixture();
    let resolve!: (accepted: boolean) => void;
    props.onSubmit.mockImplementation(
      () =>
        new Promise<boolean>((done) => {
          resolve = done;
        })
    );
    render(<ComposeDraftObjectEditor {...props} />);
    changeGoal();
    const save = screen.getByRole('button', { name: 'Save change' });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(props.onSubmit).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await act(async () => resolve(false));
    expect(props.onSaved).not.toHaveBeenCalled();
    expect(screen.getByLabelText('goal')).toHaveValue('学习开飞机');
    expect(screen.getByRole('button', { name: 'Save change' })).toBeEnabled();
  });

  it('closes without writing and handles objects with no slots', () => {
    const props = fixture();
    render(<ComposeDraftObjectEditor {...props} slots={{}} />);
    expect(screen.getByRole('button', { name: 'Save change' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Close value editor' }));
    expect(props.onCancel).toHaveBeenCalledOnce();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });
});
