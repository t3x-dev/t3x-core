// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
