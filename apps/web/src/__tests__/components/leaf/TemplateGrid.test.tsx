// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LeafTemplate } from '@/components/leaf/TemplateGrid';
import { TemplateGrid } from '@/components/leaf/TemplateGrid';

describe('TemplateGrid', () => {
  it('renders all built-in templates', () => {
    render(<TemplateGrid selected={null} onSelect={vi.fn()} />);
    expect(screen.getByText('Tweet')).toBeTruthy();
    expect(screen.getByText('Email')).toBeTruthy();
    expect(screen.getByText('Article')).toBeTruthy();
    expect(screen.getByText('Slack')).toBeTruthy();
    expect(screen.getByText('Custom')).toBeTruthy();
  });

  it('calls onSelect with template when clicked', () => {
    const onSelect = vi.fn();
    render(<TemplateGrid selected={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Tweet'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ type: 'tweet' }));
  });

  it('highlights selected template', () => {
    render(<TemplateGrid selected="tweet" onSelect={vi.fn()} />);
    const tweetCard = screen.getByText('Tweet').closest('button');
    expect(tweetCard?.className).toContain('ring');
  });

  it('Custom template has no default constraints', () => {
    const onSelect = vi.fn();
    render(<TemplateGrid selected={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Custom'));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'custom', constraints: [] })
    );
  });
});

describe('TemplateGrid semantic_threshold defaults', () => {
  it('tweet template has tight threshold', () => {
    const onSelect = vi.fn();
    render(<TemplateGrid selected={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Tweet'));
    const template: LeafTemplate = onSelect.mock.calls[0][0];
    expect(template.semantic_threshold).toBeDefined();
    expect(template.semantic_threshold!.require).toBe(0.85);
    expect(template.semantic_threshold!.exclude).toBe(0.8);
  });

  it('article template has relaxed threshold', () => {
    const onSelect = vi.fn();
    render(<TemplateGrid selected={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Article'));
    const template: LeafTemplate = onSelect.mock.calls[0][0];
    expect(template.semantic_threshold).toBeDefined();
    expect(template.semantic_threshold!.require).toBe(0.75);
    expect(template.semantic_threshold!.exclude).toBe(0.7);
  });

  it('email template has moderate threshold', () => {
    const onSelect = vi.fn();
    render(<TemplateGrid selected={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Email'));
    const template: LeafTemplate = onSelect.mock.calls[0][0];
    expect(template.semantic_threshold).toBeDefined();
    expect(template.semantic_threshold!.require).toBe(0.8);
    expect(template.semantic_threshold!.exclude).toBe(0.75);
  });

  it('slack template has moderate threshold', () => {
    const onSelect = vi.fn();
    render(<TemplateGrid selected={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Slack'));
    const template: LeafTemplate = onSelect.mock.calls[0][0];
    expect(template.semantic_threshold).toBeDefined();
    expect(template.semantic_threshold!.require).toBe(0.8);
    expect(template.semantic_threshold!.exclude).toBe(0.75);
  });

  it('custom template has no threshold (system default)', () => {
    const onSelect = vi.fn();
    render(<TemplateGrid selected={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Custom'));
    const template: LeafTemplate = onSelect.mock.calls[0][0];
    expect(template.semantic_threshold).toBeUndefined();
  });
});
