// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CitationChips } from '@/components/chat/CitationChips';

describe('CitationChips', () => {
  it('deduplicates repeated citation URLs', () => {
    render(
      <CitationChips
        citations={[
          { url: 'https://inside.fifa.com/ranking', title: 'FIFA ranking' },
          { url: 'https://inside.fifa.com/ranking', title: 'FIFA ranking duplicate' },
          { url: 'https://example.com/report', title: 'Example report' },
        ]}
      />
    );

    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.getByRole('link', { name: /inside\.fifa\.com/i })).toHaveAttribute(
      'href',
      'https://inside.fifa.com/ranking'
    );
  });
});
