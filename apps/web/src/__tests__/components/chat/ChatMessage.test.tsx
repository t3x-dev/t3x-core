// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatMessage } from '@/components/chat/ChatMessage';

describe('ChatMessage source evidence', () => {
  it('does not expose legacy source mutation actions', () => {
    render(<ChatMessage sender="assistant" content="Extracted answer" turnHash="sha256:t1" />);

    expect(screen.queryByLabelText('Source text edit hint')).toBeNull();
  });
});
