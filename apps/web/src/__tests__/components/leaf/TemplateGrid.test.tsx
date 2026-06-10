// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeafTemplate } from '@/components/leaf/TemplateGrid';
import { TemplateGrid } from '@/components/leaf/TemplateGrid';

// Mock the templates query — default: reject so fallback templates are used.
// TemplateGrid imports from @/queries/templates (doc §2 L4 routes reads
// through a query, not @/infrastructure directly).
vi.mock('@/queries/templates', () => ({
  fetchTemplates: vi.fn(() => Promise.reject(new Error('API unavailable'))),
}));

// Import the mock so we can override per-test
import { fetchTemplates } from '@/queries/templates';

const mockListTemplates = vi.mocked(fetchTemplates);

beforeEach(() => {
  // Default: API unavailable, component falls back to hardcoded defaults
  mockListTemplates.mockRejectedValue(new Error('API unavailable'));
});

describe('TemplateGrid', () => {
  it('renders all built-in templates when API fails (fallback)', async () => {
    render(<TemplateGrid selected={null} onSelect={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('X / Twitter')).toBeTruthy();
    });
    expect(screen.getByText('LinkedIn')).toBeTruthy();
    expect(screen.getByText('Reddit')).toBeTruthy();
    expect(screen.getByText('Threads')).toBeTruthy();
    expect(screen.getByText('Email')).toBeTruthy();
    expect(screen.getByText('Blog post')).toBeTruthy();
    expect(screen.getByText('Slack')).toBeTruthy();
    expect(screen.getByText('Custom')).toBeTruthy();
  });

  it('calls onSelect with template when clicked', async () => {
    const onSelect = vi.fn();
    render(<TemplateGrid selected={null} onSelect={onSelect} />);
    await waitFor(() => {
      expect(screen.getByText('X / Twitter')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('X / Twitter'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ type: 'tweet' }));
  });

  it('highlights selected template', async () => {
    render(<TemplateGrid selected="tweet" onSelect={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('X / Twitter')).toBeTruthy();
    });
    const tweetCard = screen.getByText('X / Twitter').closest('button');
    expect(tweetCard?.className).toContain('ring');
  });

  it('Custom template has no default constraints', async () => {
    const onSelect = vi.fn();
    render(<TemplateGrid selected={null} onSelect={onSelect} />);
    await waitFor(() => {
      expect(screen.getByText('Custom')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('Custom'));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'custom', constraints: [] })
    );
  });

  it('renders API templates when available', async () => {
    mockListTemplates.mockResolvedValue([
      {
        template_id: 'tmpl_001',
        title: 'Press Release',
        description: 'Formal announcement',
        category: 'business' as const,
        leaf_type: 'article',
        system_prompt: '',
        user_prompt: '',
        variables: [],
        tags: [],
        is_builtin: true,
        default_constraints: [
          { type: 'require' as const, match_mode: 'semantic' as const, value: 'Include date' },
        ],
        semantic_threshold: { require: 0.9, exclude: 0.85 },
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);

    const onSelect = vi.fn();
    render(<TemplateGrid selected={null} onSelect={onSelect} />);

    await waitFor(() => {
      expect(screen.getByText('Press Release')).toBeTruthy();
    });
    // Custom should always be appended
    expect(screen.getByText('Custom')).toBeTruthy();

    fireEvent.click(screen.getByText('Press Release'));
    const template: LeafTemplate = onSelect.mock.calls[0][0];
    expect(template.type).toBe('article');
    expect(template.constraints).toHaveLength(1);
    expect(template.semantic_threshold?.require).toBe(0.9);
  });

  it('shows loading skeleton then resolves', async () => {
    // Delay the API response
    mockListTemplates.mockReturnValue(new Promise(() => {})); // never resolves

    const { container } = render(<TemplateGrid selected={null} onSelect={vi.fn()} />);
    // Loading skeletons should be visible (animate-pulse divs, no buttons)
    const pulseElements = container.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBeGreaterThan(0);
  });
});

describe('TemplateGrid semantic_threshold defaults', () => {
  it('tweet template has tight threshold', async () => {
    const onSelect = vi.fn();
    render(<TemplateGrid selected={null} onSelect={onSelect} />);
    await waitFor(() => {
      expect(screen.getByText('X / Twitter')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('X / Twitter'));
    const template: LeafTemplate = onSelect.mock.calls[0][0];
    expect(template.semantic_threshold).toBeDefined();
    expect(template.semantic_threshold!.require).toBe(0.85);
    expect(template.semantic_threshold!.exclude).toBe(0.8);
  });

  it('article template has relaxed threshold', async () => {
    const onSelect = vi.fn();
    render(<TemplateGrid selected={null} onSelect={onSelect} />);
    await waitFor(() => {
      expect(screen.getByText('Blog post')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('Blog post'));
    const template: LeafTemplate = onSelect.mock.calls[0][0];
    expect(template.semantic_threshold).toBeDefined();
    expect(template.semantic_threshold!.require).toBe(0.75);
    expect(template.semantic_threshold!.exclude).toBe(0.7);
  });

  it('email template has moderate threshold', async () => {
    const onSelect = vi.fn();
    render(<TemplateGrid selected={null} onSelect={onSelect} />);
    await waitFor(() => {
      expect(screen.getByText('Email')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('Email'));
    const template: LeafTemplate = onSelect.mock.calls[0][0];
    expect(template.semantic_threshold).toBeDefined();
    expect(template.semantic_threshold!.require).toBe(0.8);
    expect(template.semantic_threshold!.exclude).toBe(0.75);
  });

  it('slack template has moderate threshold', async () => {
    const onSelect = vi.fn();
    render(<TemplateGrid selected={null} onSelect={onSelect} />);
    await waitFor(() => {
      expect(screen.getByText('Slack')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('Slack'));
    const template: LeafTemplate = onSelect.mock.calls[0][0];
    expect(template.semantic_threshold).toBeDefined();
    expect(template.semantic_threshold!.require).toBe(0.8);
    expect(template.semantic_threshold!.exclude).toBe(0.75);
  });

  it('custom template has no threshold (system default)', async () => {
    const onSelect = vi.fn();
    render(<TemplateGrid selected={null} onSelect={onSelect} />);
    await waitFor(() => {
      expect(screen.getByText('Custom')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('Custom'));
    const template: LeafTemplate = onSelect.mock.calls[0][0];
    expect(template.semantic_threshold).toBeUndefined();
  });
});
