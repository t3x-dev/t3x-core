// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RecipesPage from '@/app/settings/recipes/page';

const listRecipes = vi.fn();
const createRecipe = vi.fn();
const updateRecipe = vi.fn();
const deleteRecipe = vi.fn();
const fetchProjects = vi.fn();
let searchParams = new URLSearchParams('project=proj_test');

const projects = [
  {
    id: 'proj_test',
    name: 'test-bug',
    description: '',
    updatedAt: 'today',
    owner: 'You',
    status: 'active' as const,
    nodes: 0,
    drafts: 0,
    commitsCount: 1,
    branchesCount: 1,
  },
];

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/store/projectStore', () => ({
  useProjectStore: (
    selector: (state: { projects: typeof projects; initialized: boolean }) => unknown
  ) => selector({ projects, initialized: true }),
}));

vi.mock('@/hooks/projects/useProjectCrud', () => ({
  useProjectCrud: () => ({ list: fetchProjects }),
}));

vi.mock('@/hooks/recipes/useRecipeCommands', () => ({
  useRecipeCommands: () => ({
    listRecipes,
    createRecipe,
    updateRecipe,
    deleteRecipe,
  }),
}));

describe('RecipesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams('project=proj_test');
    listRecipes.mockResolvedValue([
      {
        id: 'recipe_1',
        project_id: 'proj_test',
        name: 'After commit created',
        description: 'Notify release channel',
        trigger: { event: 'commit.created' },
        steps: [{ action: 'send_webhook', config: {} }],
        enabled: true,
        created_at: '2026-09-16T00:00:00.000Z',
        updated_at: '2026-09-16T00:00:00.000Z',
      },
    ]);
  });

  it('renders the project-scoped recipe table', async () => {
    render(<RecipesPage />);

    expect(screen.getByRole('heading', { name: 'Recipes', level: 1 })).toBeInTheDocument();
    await waitFor(() => expect(listRecipes).toHaveBeenCalledWith('proj_test'));
    expect(await screen.findByText('After commit created')).toBeInTheDocument();
    expect(screen.getByText('Commit created')).toBeInTheDocument();
    expect(screen.getByText('Send webhook')).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
  });

  it('opens an integrated project-scoped creation drawer', async () => {
    render(<RecipesPage />);
    await screen.findByText('After commit created');

    fireEvent.click(screen.getByRole('button', { name: 'New recipe' }));

    expect(screen.getByRole('dialog', { name: 'New recipe' })).toBeInTheDocument();
    expect(screen.getByLabelText('Target project')).toHaveValue('test-bug');
    expect(screen.getByRole('switch', { name: 'Enable this recipe' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Create recipe' })).toBeDisabled();
    expect(screen.getByText('Recipe preview')).toBeInTheDocument();
  });

  it('describes the unscoped empty list without claiming a current project', async () => {
    searchParams = new URLSearchParams();
    listRecipes.mockResolvedValue([]);
    render(<RecipesPage />);
    expect(
      await screen.findByText('No recipes configured in the loaded projects.')
    ).toBeInTheDocument();
  });

  it('moves focus into the recipe dialog, traps Tab, and returns focus after Escape', async () => {
    render(<RecipesPage />);
    await screen.findByText('After commit created');
    const opener = screen.getByRole('button', { name: 'New recipe' });
    fireEvent.click(opener);

    const field = screen.getByLabelText('Name');
    await waitFor(() => expect(field).toHaveFocus());
    expect(screen.queryByRole('heading', { name: 'Recipes', level: 1 })).not.toBeInTheDocument();
    const close = screen.getByRole('button', { name: 'Close' });
    close.focus();
    fireEvent.keyDown(close, { key: 'Tab' });
    expect(field).toHaveFocus();
    fireEvent.keyDown(field, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });

  it('creates a recipe with supported API trigger and action identifiers', async () => {
    createRecipe.mockResolvedValue({
      id: 'recipe_2',
      project_id: 'proj_test',
      name: 'Notify after commit',
      description: null,
      trigger: { event: 'commit.created' },
      steps: [{ action: 'send_webhook', config: {} }],
      enabled: true,
      created_at: '2026-09-16T00:00:00.000Z',
      updated_at: '2026-09-16T00:00:00.000Z',
    });
    render(<RecipesPage />);
    await screen.findByText('After commit created');

    fireEvent.click(screen.getByRole('button', { name: 'New recipe' }));
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Notify after commit' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create recipe' }));

    await waitFor(() => {
      expect(createRecipe).toHaveBeenCalledWith('proj_test', {
        name: 'Notify after commit',
        description: undefined,
        trigger: { event: 'commit.created' },
        steps: [{ action: 'send_webhook', config: {} }],
        enabled: true,
      });
    });
  });
});
