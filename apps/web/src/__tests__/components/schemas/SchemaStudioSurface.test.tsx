// @vitest-environment jsdom
import '@testing-library/jest-dom';
import type { StudioPreview } from '@t3x-dev/api-client';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { SchemaStudioSurface } from '@/components/schemas/SchemaStudioSurface';

const openMore = () => {
  const trigger = screen.getByRole('button', { name: 'Schema actions' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'Enter' });
  return screen.getByRole('menu');
};

it('keeps Undo direct and separates editing tools from the next workflow actions', () => {
  const undo = vi.fn();
  const save = vi.fn();
  const compose = vi.fn();
  const review = vi.fn();
  render(
    <SchemaStudioSurface
      canEditDefinition
      onUndo={undo}
      canUndo
      onSave={save}
      canSave
      onCompose={compose}
      onReview={review}
      canReview
    />
  );
  const tools = screen.getByRole('group', { name: 'Schema editing tools' });
  fireEvent.click(within(tools).getByRole('button', { name: 'Undo last change' }));
  expect(undo).toHaveBeenCalledOnce();
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(within(tools).queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
  openMore();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Save now' }));
  expect(save).toHaveBeenCalledOnce();
  const next = screen.getByRole('group', { name: 'Schema next steps' });
  fireEvent.click(within(next).getByRole('button', { name: 'Continue in Compose' }));
  fireEvent.click(within(next).getByRole('button', { name: 'Review in Workspace' }));
  expect(compose).toHaveBeenCalledOnce();
  expect(review).toHaveBeenCalledOnce();
});

it('groups More by purpose, keeps discard scopes distinct and does not duplicate YAML', async () => {
  const discard = vi.fn();
  const discardSaved = vi.fn();
  render(
    <SchemaStudioSurface
      canEditDefinition
      onRules={vi.fn()}
      canOpenRules
      onInspect={vi.fn()}
      data={{} as StudioPreview}
      onPublish={vi.fn()}
      onDiscard={discard}
      canDiscard
      onDiscardSaved={discardSaved}
      canDiscardSaved
    />
  );
  const menu = openMore();
  expect(within(menu).getByRole('group', { name: 'Schema settings' })).toBeVisible();
  expect(within(menu).getByRole('group', { name: 'Check and publish' })).toBeVisible();
  const discardGroup = within(menu).getByRole('group', { name: 'Discard changes' });
  expect(within(menu).queryByRole('menuitem', { name: /YAML/ })).not.toBeInTheDocument();
  fireEvent.click(
    within(discardGroup).getByRole('menuitem', { name: 'Discard all unsaved changes' })
  );
  expect(discard).toHaveBeenCalledOnce();
  expect(discardSaved).not.toHaveBeenCalled();
  openMore();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Discard saved Schema draft…' }));
  expect(discardSaved).toHaveBeenCalledOnce();
  openMore();
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Schema actions' })).toHaveFocus());
});

it('retains disabled reasons and guards after moving actions into groups', () => {
  const discard = vi.fn();
  const publish = vi.fn();
  render(
    <SchemaStudioSurface
      editorInvalid
      onRules={vi.fn()}
      onInspect={vi.fn()}
      contextLocked
      data={{} as StudioPreview}
      onPublish={publish}
      publishBlocker="Save a checked candidate before publishing."
      onDiscard={discard}
      onDiscardSaved={vi.fn()}
    />
  );
  const yaml = screen.getByRole('button', { name: 'View draft YAML' });
  expect(yaml).toBeDisabled();
  expect(yaml).toHaveAccessibleDescription('Fix field errors before opening YAML.');
  openMore();
  for (const name of [
    'Relationships & rules…',
    'View checks and impact',
    'Publish to public catalog…',
    'Discard all unsaved changes',
    'Discard saved Schema draft…',
  ]) {
    const action = screen.getByRole('menuitem', { name });
    expect(action).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(action);
  }
  expect(screen.getByText('Save a checked candidate before publishing.')).toBeVisible();
  expect(publish).not.toHaveBeenCalled();
  expect(discard).not.toHaveBeenCalled();
});

it('keeps failed-save retry visible without opening More or claiming adoption', () => {
  const retry = vi.fn();
  render(
    <SchemaStudioSurface saveFailed canSave draftStatus="Save failed · edits kept" onSave={retry} />
  );
  expect(screen.getByText('Save failed · edits kept')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
  expect(retry).toHaveBeenCalledOnce();
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});
