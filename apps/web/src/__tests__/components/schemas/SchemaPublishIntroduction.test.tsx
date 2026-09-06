// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SchemaPublishIntroduction } from '@/components/schemas/SchemaPublishIntroduction';

const mocks = vi.hoisted(() => ({ introduction: vi.fn() }));
vi.mock('@/hooks/schemas/useSchemaCatalog', () => ({ usePublishIntroduction: mocks.introduction }));
const reference = {
  projectId: 'p',
  commitDigest: `sha256:${'a'.repeat(64)}`,
  presentationDigest: `sha256:${'b'.repeat(64)}`,
};
const resource = {
  path: 'images/cover.png',
  alt: 'Our cover',
  mediaType: 'image/png',
  base64: 'AA==',
};
beforeEach(() =>
  mocks.introduction.mockReturnValue({
    reference,
    data: { document: { description: 'Authored description', resources: [resource] } },
  })
);
describe('release introduction selection', () => {
  it('requires explicit opt-in and selects a bundled cover without changing the pin', () => {
    const onChange = vi.fn();
    const { rerender } = render(<SchemaPublishIntroduction projectId="p" onChange={onChange} />);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.queryByLabelText('Release cover image')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenLastCalledWith(reference);
    rerender(<SchemaPublishIntroduction projectId="p" value={reference} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Release cover image'), {
      target: { value: resource.path },
    });
    expect(onChange).toHaveBeenLastCalledWith({ ...reference, coverPath: resource.path });
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
  it('does not invent an introduction when the project has none', () => {
    mocks.introduction.mockReturnValue({});
    render(<SchemaPublishIntroduction projectId="p" onChange={vi.fn()} />);
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByText(/Add an introduction in State Overview/)).toBeVisible();
  });
});
